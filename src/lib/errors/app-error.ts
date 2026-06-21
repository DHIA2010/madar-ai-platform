import type { ApiError } from "@/types/api"

export type AppErrorKind = "validation" | "authorization" | "network" | "unknown"

export interface AppErrorOptions {
  code?: string
  message: string
  details?: unknown
  traceId?: string
  cause?: unknown
  status?: number
}

export class AppError extends Error {
  kind: AppErrorKind
  code: string
  details?: unknown
  traceId?: string
  status?: number

  constructor(kind: AppErrorKind, options: AppErrorOptions) {
    super(options.message)
    this.name = "AppError"
    this.kind = kind
    this.code = options.code ?? "app_error"
    this.details = options.details
    this.traceId = options.traceId
    this.status = options.status
    this.cause = options.cause
  }
}

export class ValidationError extends AppError {
  constructor(options: AppErrorOptions) {
    super("validation", { code: options.code ?? "validation_error", ...options })
    this.name = "ValidationError"
  }
}

export class AuthorizationError extends AppError {
  constructor(options: AppErrorOptions) {
    super("authorization", { code: options.code ?? "authorization_error", ...options })
    this.name = "AuthorizationError"
  }
}

export class NetworkError extends AppError {
  constructor(options: AppErrorOptions) {
    super("network", { code: options.code ?? "network_error", ...options })
    this.name = "NetworkError"
  }
}

export class UnknownError extends AppError {
  constructor(options: AppErrorOptions) {
    super("unknown", { code: options.code ?? "unknown_error", ...options })
    this.name = "UnknownError"
  }
}

function isApiError(value: unknown): value is ApiError {
  return Boolean(value && typeof value === "object" && "code" in value && "message" in value)
}

function extractApiError(body: unknown): ApiError | undefined {
  if (!body || typeof body !== "object") {
    return undefined
  }

  if (isApiError(body)) {
    return body
  }

  if ("error" in body && isApiError((body as { error?: unknown }).error)) {
    return (body as { error: ApiError }).error
  }

  return undefined
}

export function mapHttpResponseError(response: Response, body: unknown): AppError {
  const apiError = extractApiError(body)
  const traceId =
    response.headers.get("x-correlation-id") ?? response.headers.get("x-request-id") ?? undefined

  if (response.status === 401 || response.status === 403) {
    return new AuthorizationError({
      code: apiError?.code ?? "authorization_error",
      message: apiError?.message ?? "You are not authorized to perform this action.",
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  if (response.status === 400 || response.status === 422) {
    return new ValidationError({
      code: apiError?.code ?? "validation_error",
      message: apiError?.message ?? "The request could not be processed.",
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  if (response.status >= 500) {
    return new NetworkError({
      code: apiError?.code ?? "network_error",
      message: apiError?.message ?? "A server error occurred.",
      details: apiError?.details,
      traceId,
      status: response.status,
    })
  }

  return new UnknownError({
    code: apiError?.code ?? "unknown_error",
    message: apiError?.message ?? `Request failed with status ${response.status}`,
    details: apiError?.details,
    traceId,
    status: response.status,
  })
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new NetworkError({
      code: "request_timeout",
      message: "The request timed out.",
      cause: error,
    })
  }

  if (error instanceof TypeError) {
    return new NetworkError({
      code: "network_error",
      message: error.message || "A network error occurred.",
      cause: error,
    })
  }

  if (error instanceof Error) {
    return new UnknownError({
      code: "unknown_error",
      message: error.message,
      cause: error,
    })
  }

  return new UnknownError({
    code: "unknown_error",
    message: "An unknown error occurred.",
    details: error,
  })
}
