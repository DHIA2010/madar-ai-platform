import { classifyMetaGraphApiError, type MetaGraphApiErrorEnvelope } from "./errors"
import { SimpleRateLimiter } from "../google-ads/rate-limiter"

export interface MetaApiErrorDetail {
  endpoint: string
  httpStatus: number
  metaErrorCode: number | null
  errorSubcode: number | null
  errorType: string | null
  errorMessage: string
  fbtraceId: string | null
  likelyCause: string
  requiredPermission: string | null
}

export type MetaApiResult<T> = { ok: true; data: T } | { ok: false; error: MetaApiErrorDetail }

interface MetaGraphApiClientConfig {
  apiBaseUrl: string
  maxRetries: number
  minRequestIntervalMs: number
}

// Never log the token itself -- only whether one was present. Every trace/log line in this
// module must be checked against this rule before adding new fields.
function redactedRequestSummary(endpoint: string, params: Record<string, string | undefined>) {
  const { access_token: _accessToken, ...safeParams } = params
  return { endpoint, params: safeParams }
}

function logMetaOutboundTrace(input: {
  endpoint: string
  statusCode: number
  fbtraceId: string | null
  durationMs: number
}) {
  console.info(
    JSON.stringify({
      level: "info",
      service: "identity-platform",
      event: "meta_ads.outbound_trace",
      endpoint: input.endpoint,
      statusCode: input.statusCode,
      fbtraceId: input.fbtraceId,
      durationMs: input.durationMs,
      timestamp: new Date().toISOString(),
    })
  )
}

function logMetaProviderError(detail: MetaApiErrorDetail) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "identity-platform",
      event: "provider.error",
      provider: "meta-ads",
      endpoint: detail.endpoint,
      statusCode: detail.httpStatus,
      metaErrorCode: detail.metaErrorCode,
      fbtraceId: detail.fbtraceId,
      timestamp: new Date().toISOString(),
    })
  )
}

export class MetaGraphApiClient {
  private readonly rateLimiter: SimpleRateLimiter

  constructor(
    private readonly accessToken: string,
    private readonly config: MetaGraphApiClientConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.rateLimiter = new SimpleRateLimiter(config.minRequestIntervalMs)
  }

  async get<T>(
    path: string,
    params: Record<string, string | undefined> = {}
  ): Promise<MetaApiResult<T>> {
    let attempt = 0
    const endpoint = `${this.config.apiBaseUrl.replace(/\/$/, "")}${path}`

    while (attempt <= this.config.maxRetries) {
      await this.rateLimiter.waitTurn()

      const startedAt = Date.now()
      const requestUrl = new URL(endpoint)
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) requestUrl.searchParams.set(key, value)
      }

      let response: Response
      try {
        response = await this.fetchFn(requestUrl.toString(), {
          method: "GET",
          headers: {
            // Bearer header, never a token query param -- keeps the token out of any URL
            // that might end up in logs, proxies, or browser history.
            authorization: `Bearer ${this.accessToken}`,
            accept: "application/json",
          },
        })
      } catch (networkError) {
        const detail = this.buildErrorDetail({
          endpoint: path,
          httpStatus: 0,
          envelope: null,
          fallbackMessage: networkError instanceof Error ? networkError.message : "Network error",
        })
        logMetaProviderError(detail)
        if (attempt >= this.config.maxRetries) {
          return { ok: false, error: detail }
        }
        attempt += 1
        await this.backoff(attempt)
        continue
      }

      const rawBody = await response.text()
      let parsedBody: unknown = null
      try {
        parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : null
      } catch {
        parsedBody = null
      }

      logMetaOutboundTrace({
        endpoint: redactedRequestSummary(path, params).endpoint,
        statusCode: response.status,
        fbtraceId: this.extractFbtraceId(parsedBody),
        durationMs: Date.now() - startedAt,
      })

      if (response.ok) {
        return { ok: true, data: parsedBody as T }
      }

      const envelope = this.extractErrorEnvelope(parsedBody)
      const classification = classifyMetaGraphApiError({
        endpoint: path,
        httpStatus: response.status,
        envelope,
      })

      const detail: MetaApiErrorDetail = {
        endpoint: path,
        httpStatus: response.status,
        metaErrorCode: envelope?.code ?? null,
        errorSubcode: envelope?.error_subcode ?? null,
        errorType: envelope?.type ?? null,
        errorMessage:
          envelope?.message ?? `Meta Graph API request failed (status ${response.status}).`,
        fbtraceId: envelope?.fbtrace_id ?? null,
        likelyCause: classification.likelyCause,
        requiredPermission: classification.requiredPermission,
      }
      logMetaProviderError(detail)

      if (classification.retryable && attempt < this.config.maxRetries) {
        attempt += 1
        await this.backoff(attempt)
        continue
      }

      return { ok: false, error: detail }
    }

    return {
      ok: false,
      error: this.buildErrorDetail({
        endpoint: path,
        httpStatus: 0,
        envelope: null,
        fallbackMessage: "Meta Graph API request retries exhausted.",
      }),
    }
  }

  // Follows Graph API's `paging.next` cursor until exhausted, mirroring the nextPageToken
  // loop pattern used by GoogleAdsClient.queryAllRows so pagination reads the same way
  // across both providers.
  async getAllPages<T>(
    path: string,
    params: Record<string, string | undefined> = {}
  ): Promise<MetaApiResult<T[]>> {
    const allItems: T[] = []
    let nextUrl: string | undefined

    for (let page = 0; page < 100; page += 1) {
      const result = nextUrl
        ? await this.getRawUrl<{ data?: T[]; paging?: { next?: string } }>(nextUrl)
        : await this.get<{ data?: T[]; paging?: { next?: string } }>(path, params)

      if (!result.ok) {
        return { ok: false, error: result.error }
      }

      allItems.push(...(result.data.data ?? []))
      nextUrl = result.data.paging?.next
      if (!nextUrl) {
        return { ok: true, data: allItems }
      }
    }

    return { ok: true, data: allItems }
  }

  private async getRawUrl<T>(url: string): Promise<MetaApiResult<T>> {
    await this.rateLimiter.waitTurn()
    const parsed = new URL(url)
    // paging.next already includes the access_token Meta issued it with; strip it and
    // re-attach ours via the header so a token never travels through a logged URL.
    parsed.searchParams.delete("access_token")

    let response: Response
    try {
      response = await this.fetchFn(parsed.toString(), {
        method: "GET",
        headers: { authorization: `Bearer ${this.accessToken}`, accept: "application/json" },
      })
    } catch (networkError) {
      return {
        ok: false,
        error: this.buildErrorDetail({
          endpoint: parsed.pathname,
          httpStatus: 0,
          envelope: null,
          fallbackMessage: networkError instanceof Error ? networkError.message : "Network error",
        }),
      }
    }

    const rawBody = await response.text()
    const parsedBody = (() => {
      try {
        return rawBody.length > 0 ? JSON.parse(rawBody) : null
      } catch {
        return null
      }
    })()

    if (response.ok) {
      return { ok: true, data: parsedBody as T }
    }

    const envelope = this.extractErrorEnvelope(parsedBody)
    const classification = classifyMetaGraphApiError({
      endpoint: parsed.pathname,
      httpStatus: response.status,
      envelope,
    })

    return {
      ok: false,
      error: {
        endpoint: parsed.pathname,
        httpStatus: response.status,
        metaErrorCode: envelope?.code ?? null,
        errorSubcode: envelope?.error_subcode ?? null,
        errorType: envelope?.type ?? null,
        errorMessage:
          envelope?.message ?? `Meta Graph API request failed (status ${response.status}).`,
        fbtraceId: envelope?.fbtrace_id ?? null,
        likelyCause: classification.likelyCause,
        requiredPermission: classification.requiredPermission,
      },
    }
  }

  private buildErrorDetail(input: {
    endpoint: string
    httpStatus: number
    envelope: MetaGraphApiErrorEnvelope | null
    fallbackMessage: string
  }): MetaApiErrorDetail {
    const classification = classifyMetaGraphApiError({
      endpoint: input.endpoint,
      httpStatus: input.httpStatus,
      envelope: input.envelope,
    })
    return {
      endpoint: input.endpoint,
      httpStatus: input.httpStatus,
      metaErrorCode: input.envelope?.code ?? null,
      errorSubcode: input.envelope?.error_subcode ?? null,
      errorType: input.envelope?.type ?? null,
      errorMessage: input.envelope?.message ?? input.fallbackMessage,
      fbtraceId: input.envelope?.fbtrace_id ?? null,
      likelyCause: classification.likelyCause,
      requiredPermission: classification.requiredPermission,
    }
  }

  private extractErrorEnvelope(body: unknown): MetaGraphApiErrorEnvelope | null {
    if (!body || typeof body !== "object" || !("error" in body)) {
      return null
    }
    const error = (body as { error?: unknown }).error
    if (!error || typeof error !== "object") {
      return null
    }
    return error as MetaGraphApiErrorEnvelope
  }

  private extractFbtraceId(body: unknown): string | null {
    const envelope = this.extractErrorEnvelope(body)
    return envelope?.fbtrace_id ?? null
  }

  private async backoff(attempt: number) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000)))
  }
}
