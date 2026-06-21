import {
  getClientEnvironment,
  getServerEnvironment,
} from "@/infrastructure/environment/app-environment"
import { logger } from "@/lib/logger"
import { failure, success, type Result } from "@/lib/result"
import {
  AppError,
  AuthorizationError,
  NetworkError,
  UnknownError,
  ValidationError,
  mapHttpResponseError,
  toAppError,
} from "@/lib/errors/app-error"
import type { Envelope, RequestDto, RequestMetadata } from "@/types/api"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface RetryPolicy {
  enabled: boolean
  attempts: number
  delayMs: number
  shouldRetry?: (error: AppError, attempt: number) => boolean
}

export interface ApiRequestOptions<TBody = unknown> extends RequestDto<TBody> {
  method: HttpMethod
  path: string
  timeoutMs?: number
  signal?: AbortSignal
  parseJson?: boolean
  correlationId?: string
}

export interface PreparedRequest {
  method: HttpMethod
  url: string
  headers: Headers
  timeoutMs: number
  metadata: RequestMetadata
}

export interface RequestInterceptorContext<TBody = unknown> {
  request: ApiRequestOptions<TBody>
}

export interface ResponseInterceptorContext {
  request: PreparedRequest
  response: Response
  body: unknown
}

export type RequestInterceptor = <TBody = unknown>(
  context: RequestInterceptorContext<TBody>
) => Promise<ApiRequestOptions<TBody> | void> | ApiRequestOptions<TBody> | void

export type ResponseInterceptor = (
  context: ResponseInterceptorContext
) => Promise<unknown> | unknown

export interface ApiClientOptions {
  baseUrl?: string
  timeoutMs?: number
  requestInterceptors?: RequestInterceptor[]
  responseInterceptors?: ResponseInterceptor[]
  getAuthHeaders?: () => HeadersInit | Promise<HeadersInit | undefined>
  correlationIdHeader?: string
  retryPolicy?: RetryPolicy
  fetchImpl?: typeof fetch
  onError?: (error: AppError, request: PreparedRequest) => void
  onResponse?: (context: ResponseInterceptorContext) => void
}

export interface ApiClient {
  readonly baseUrl: string
  readonly timeoutMs: number
  readonly retryPolicy: RetryPolicy
  request<TResponse>(options: ApiRequestOptions): Promise<TResponse>
  get<TResponse>(
    path: string,
    options?: Omit<ApiRequestOptions, "method" | "path">
  ): Promise<TResponse>
  post<TRequest, TResponse>(
    path: string,
    payload: TRequest,
    options?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
  ): Promise<TResponse>
  put<TRequest, TResponse>(
    path: string,
    payload: TRequest,
    options?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
  ): Promise<TResponse>
  patch<TRequest, TResponse>(
    path: string,
    payload: TRequest,
    options?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
  ): Promise<TResponse>
  delete<TResponse>(
    path: string,
    options?: Omit<ApiRequestOptions, "method" | "path">
  ): Promise<TResponse>
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_CORRELATION_HEADER = "x-correlation-id"

function isAbsoluteUrl(path: string) {
  return /^https?:\/\//i.test(path)
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function mergeHeaders(...headersList: HeadersInit[]) {
  const headers = new Headers()

  headersList.forEach((value) => {
    if (!value) {
      return
    }

    new Headers(value).forEach((headerValue, headerName) => {
      headers.set(headerName, headerValue)
    })
  })

  return headers
}

function serializeQuery(query?: Record<string, unknown>) {
  if (!query) {
    return ""
  }

  const params = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)))
      return
    }

    params.set(key, String(value))
  })

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

function resolveUrl(baseUrl: string | undefined, path: string, query?: Record<string, unknown>) {
  const normalizedPath = `${path}${serializeQuery(query)}`

  if (isAbsoluteUrl(normalizedPath)) {
    return normalizedPath
  }

  if (!baseUrl) {
    return normalizedPath
  }

  return `${trimTrailingSlash(baseUrl)}${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") || ""

  if (response.status === 204) {
    return undefined
  }

  if (contentType.includes("application/json")) {
    return response.json()
  }

  const text = await response.text()

  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function isEnvelopePayload(value: unknown): value is Envelope {
  return Boolean(
    value &&
    typeof value === "object" &&
    "data" in value &&
    Object.prototype.hasOwnProperty.call(value, "data")
  )
}

function extractResponseData<TResponse>(body: unknown): TResponse {
  if (isEnvelopePayload(body)) {
    return body.data as TResponse
  }

  return body as TResponse
}

async function normalizeRequest<TBody>(
  request: ApiRequestOptions<TBody>,
  options: ApiClientOptions
): Promise<ApiRequestOptions<TBody>> {
  let nextRequest = request

  for (const interceptor of options.requestInterceptors ?? []) {
    const intercepted = await interceptor({ request: nextRequest })
    if (intercepted) {
      nextRequest = intercepted
    }
  }

  return nextRequest
}

async function createPreparedRequest<TBody>(
  request: ApiRequestOptions<TBody>,
  options: ApiClientOptions
): Promise<{
  prepared: PreparedRequest
  init: RequestInit
  timeoutId: ReturnType<typeof setTimeout>
}> {
  const env = typeof window === "undefined" ? getServerEnvironment() : getClientEnvironment()
  const timeoutMs =
    request.timeoutMs ?? options.timeoutMs ?? env.REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS
  const correlationId =
    request.correlationId ?? request.metadata?.correlationId ?? createCorrelationId()
  const headers = mergeHeaders(
    {
      accept: "application/json",
      ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      [options.correlationIdHeader ?? DEFAULT_CORRELATION_HEADER]: correlationId,
    },
    request.headers ?? {}
  )

  if (options.getAuthHeaders) {
    const authHeaders = await options.getAuthHeaders()
    if (authHeaders) {
      new Headers(authHeaders).forEach((headerValue, headerName) => {
        headers.set(headerName, headerValue)
      })
    }
  }

  const prepared: PreparedRequest = {
    method: request.method,
    url: resolveUrl(options.baseUrl ?? env.API_BASE_URL, request.path, request.query),
    headers,
    timeoutMs,
    metadata: {
      ...request.metadata,
      correlationId,
      requestedAt: request.metadata?.requestedAt ?? new Date().toISOString(),
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  if (request.signal) {
    if (request.signal.aborted) {
      controller.abort()
    } else {
      request.signal.addEventListener("abort", () => controller.abort(), { once: true })
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers: prepared.headers,
    signal: controller.signal,
  }

  if (request.body !== undefined && request.method !== "GET") {
    init.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body)
  }

  prepared.headers.set("x-request-timeout-ms", String(timeoutMs))

  return { prepared, init: { ...init, cache: "no-store" }, timeoutId: timeout }
}

async function executeRequest<TResponse>(
  request: ApiRequestOptions,
  options: ApiClientOptions
): Promise<TResponse> {
  const normalizedRequest = await normalizeRequest(request, options)
  const { prepared, init, timeoutId } = await createPreparedRequest(normalizedRequest, options)
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(prepared.url, init)
    let body = await readResponseBody(response)

    const responseContext: ResponseInterceptorContext = {
      request: prepared,
      response,
      body,
    }

    for (const interceptor of options.responseInterceptors ?? []) {
      const intercepted = await interceptor(responseContext)
      if (intercepted !== undefined) {
        body = intercepted
        responseContext.body = intercepted
      }
    }

    options.onResponse?.(responseContext)

    if (!response.ok) {
      const error = mapHttpResponseError(response, body)
      options.onError?.(error, prepared)
      throw error
    }

    return extractResponseData<TResponse>(body)
  } catch (error) {
    const appError = toAppError(error)
    options.onError?.(appError, prepared)
    throw appError
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const env = typeof window === "undefined" ? getServerEnvironment() : getClientEnvironment()
  const baseUrl = options.baseUrl ?? env.API_BASE_URL ?? ""
  const timeoutMs = options.timeoutMs ?? env.REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS

  return {
    baseUrl,
    timeoutMs,
    retryPolicy: options.retryPolicy ?? {
      enabled: false,
      attempts: 0,
      delayMs: 0,
    },
    request: <TResponse>(request: ApiRequestOptions) =>
      executeRequest<TResponse>(request, {
        ...options,
        baseUrl,
        timeoutMs,
      }),
    get: <TResponse>(path: string, requestOptions?: Omit<ApiRequestOptions, "method" | "path">) =>
      executeRequest<TResponse>(
        {
          ...(requestOptions ?? {}),
          method: "GET",
          path,
        },
        {
          ...options,
          baseUrl,
          timeoutMs,
        }
      ),
    post: <TRequest, TResponse>(
      path: string,
      payload: TRequest,
      requestOptions?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
    ) =>
      executeRequest<TResponse>(
        {
          ...(requestOptions ?? {}),
          method: "POST",
          path,
          body: payload,
        },
        {
          ...options,
          baseUrl,
          timeoutMs,
        }
      ),
    put: <TRequest, TResponse>(
      path: string,
      payload: TRequest,
      requestOptions?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
    ) =>
      executeRequest<TResponse>(
        {
          ...(requestOptions ?? {}),
          method: "PUT",
          path,
          body: payload,
        },
        {
          ...options,
          baseUrl,
          timeoutMs,
        }
      ),
    patch: <TRequest, TResponse>(
      path: string,
      payload: TRequest,
      requestOptions?: Omit<ApiRequestOptions<TRequest>, "method" | "path" | "body">
    ) =>
      executeRequest<TResponse>(
        {
          ...(requestOptions ?? {}),
          method: "PATCH",
          path,
          body: payload,
        },
        {
          ...options,
          baseUrl,
          timeoutMs,
        }
      ),
    delete: <TResponse>(
      path: string,
      requestOptions?: Omit<ApiRequestOptions, "method" | "path">
    ) =>
      executeRequest<TResponse>(
        {
          ...(requestOptions ?? {}),
          method: "DELETE",
          path,
        },
        {
          ...options,
          baseUrl,
          timeoutMs,
        }
      ),
  }
}

export const apiClient = createApiClient()

export {
  AppError,
  AuthorizationError,
  NetworkError,
  UnknownError,
  ValidationError,
  failure,
  logger,
  success,
  type Result,
}
