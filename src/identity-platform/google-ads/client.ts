import { GoogleAdsIntegrationError, toGoogleAdsError } from "./errors"
import { SimpleRateLimiter } from "./rate-limiter"

interface GoogleAdsApiPage {
  results?: Record<string, unknown>[]
  nextPageToken?: string
}

interface GoogleAdsClientConfig {
  apiBaseUrl: string
  developerToken: string
  loginCustomerId?: string
  maxRetries: number
  minRequestIntervalMs: number
}

interface GoogleAdsOutboundTraceContext {
  endpoint: string
  handler: string
  connectionId: string
  customerId: string
  sequence: number
}

let outboundTraceContext: GoogleAdsOutboundTraceContext | null = null

export function beginGoogleAdsSyncRequestTrace(input: {
  endpoint: string
  handler: string
  connectionId: string
  customerId: string
}) {
  outboundTraceContext = {
    endpoint: input.endpoint,
    handler: input.handler,
    connectionId: input.connectionId,
    customerId: input.customerId,
    sequence: 0,
  }
}

export function endGoogleAdsSyncRequestTrace() {
  outboundTraceContext = null
}

function nextTraceSequence(connectionId: string) {
  if (!outboundTraceContext || outboundTraceContext.connectionId !== connectionId) {
    return null
  }

  outboundTraceContext.sequence += 1
  return outboundTraceContext.sequence
}

function logGoogleAdsOutboundTrace(input: {
  connectionId: string
  endpoint: string
  customerId: string | null
  loginCustomerId: string | null
  method: string
  requestBody: string | null
  statusCode: number
  responseBody: string
  requestId: string | null
}) {
  const sequence = nextTraceSequence(input.connectionId)
  if (!sequence || !outboundTraceContext) {
    return
  }

  console.info(
    JSON.stringify({
      level: "info",
      service: "identity-platform",
      event: "google_ads.outbound_trace",
      sequence,
      syncEndpoint: outboundTraceContext.endpoint,
      syncHandler: outboundTraceContext.handler,
      connectionId: input.connectionId,
      customerId: input.customerId,
      loginCustomerId: input.loginCustomerId,
      method: input.method,
      endpoint: input.endpoint,
      requestBody: input.requestBody,
      statusCode: input.statusCode,
      responseBody: input.responseBody,
      googleRequestId: input.requestId,
      timestamp: new Date().toISOString(),
    })
  )
}

function readUpstreamRequestId(response: Response) {
  return (
    response.headers.get("request-id") ??
    response.headers.get("x-request-id") ??
    response.headers.get("requestid") ??
    null
  )
}

function logGoogleAdsProviderError(input: {
  endpoint: string
  statusCode: number | null
  errorCode: string
  correlationId: string
  requestId: string | null
}) {
  console.error(
    JSON.stringify({
      level: "error",
      service: "identity-platform",
      event: "provider.error",
      provider: "google-ads",
      endpoint: input.endpoint,
      statusCode: input.statusCode,
      errorCode: input.errorCode,
      correlationId: input.correlationId,
      requestId: input.requestId,
      timestamp: new Date().toISOString(),
    })
  )
}

export class GoogleAdsClient {
  private readonly rateLimiter: SimpleRateLimiter

  constructor(
    private readonly authProvider: { getAccessToken(connectionId: string): Promise<string> },
    private readonly config: GoogleAdsClientConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {
    this.rateLimiter = new SimpleRateLimiter(config.minRequestIntervalMs)
  }

  async queryAllRows(input: {
    connectionId: string
    customerId: string
    query: string
    pageSize?: number
  }) {
    const allRows: Record<string, unknown>[] = []
    let nextPageToken: string | undefined

    do {
      const page = await this.queryPage({
        ...input,
        nextPageToken,
      })

      allRows.push(...(page.results ?? []))
      nextPageToken = page.nextPageToken
    } while (nextPageToken)

    return allRows
  }

  async listAccessibleCustomerIds(connectionId: string): Promise<string[]> {
    let attempt = 0
    const requestUrl = `${this.config.apiBaseUrl.replace(/\/$/, "")}/customers:listAccessibleCustomers`

    while (attempt <= this.config.maxRetries) {
      await this.rateLimiter.waitTurn()

      try {
        const developerToken = this.requireDeveloperToken()
        const accessToken = await this.authProvider.getAccessToken(connectionId)

        const response = await this.fetchFn(requestUrl, {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            accept: "application/json",
          },
        })

        const rawBody = await response.text()
        const upstreamRequestId = readUpstreamRequestId(response)

        logGoogleAdsOutboundTrace({
          connectionId,
          endpoint: requestUrl,
          customerId: null,
          loginCustomerId: this.config.loginCustomerId?.trim() || null,
          method: "GET",
          requestBody: null,
          statusCode: response.status,
          responseBody: rawBody,
          requestId: upstreamRequestId,
        })

        if (!response.ok) {
          const mapped = toGoogleAdsError({ status: response.status, body: rawBody })
          logGoogleAdsProviderError({
            endpoint: "customers:listAccessibleCustomers",
            statusCode: response.status,
            errorCode: mapped.code,
            correlationId: connectionId,
            requestId: upstreamRequestId,
          })
          throw mapped
        }

        const payload = JSON.parse(rawBody) as { resourceNames?: unknown }
        const resourceNames = Array.isArray(payload.resourceNames) ? payload.resourceNames : []

        return Array.from(
          new Set(
            resourceNames
              .map((entry) => {
                if (typeof entry !== "string") {
                  return ""
                }

                const match = /^customers\/([0-9-]+)$/.exec(entry)
                if (!match) {
                  return ""
                }

                return match[1].replace(/-/g, "")
              })
              .filter((entry) => entry.length > 0)
          )
        )
      } catch (error) {
        const mapped =
          error instanceof GoogleAdsIntegrationError
            ? error
            : new GoogleAdsIntegrationError(
                "Google Ads provider failure.",
                "GOOGLE_ADS_PROVIDER_FAILURE",
                true,
                502
              )

        logGoogleAdsProviderError({
          endpoint: "customers:listAccessibleCustomers",
          statusCode: mapped.status,
          errorCode: mapped.code,
          correlationId: connectionId,
          requestId: null,
        })

        if (!mapped.retryable || attempt >= this.config.maxRetries) {
          throw mapped
        }

        attempt += 1
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000))
        )
      }
    }

    throw new GoogleAdsIntegrationError(
      "Google Ads request retries exhausted.",
      "GOOGLE_ADS_TRANSIENT_FAILURE",
      true,
      503
    )
  }

  private async queryPage(input: {
    connectionId: string
    customerId: string
    query: string
    pageSize?: number
    nextPageToken?: string
  }): Promise<GoogleAdsApiPage> {
    let attempt = 0
    const requestUrl = `${this.config.apiBaseUrl.replace(/\/$/, "")}/customers/${encodeURIComponent(input.customerId)}/googleAds:search`

    while (attempt <= this.config.maxRetries) {
      await this.rateLimiter.waitTurn()

      try {
        const developerToken = this.requireDeveloperToken()

        const accessToken = await this.authProvider.getAccessToken(input.connectionId)
        const headers: Record<string, string> = {
          authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "content-type": "application/json",
          ...(this.config.loginCustomerId
            ? { "login-customer-id": this.config.loginCustomerId }
            : {}),
        }

        const requestBody = JSON.stringify({
          query: input.query,
          pageToken: input.nextPageToken,
        })

        const response = await this.fetchFn(requestUrl, {
          method: "POST",
          headers,
          body: requestBody,
        })

        const rawBody = await response.text()
        const upstreamRequestId = readUpstreamRequestId(response)

        logGoogleAdsOutboundTrace({
          connectionId: input.connectionId,
          endpoint: requestUrl,
          customerId: input.customerId,
          loginCustomerId: this.config.loginCustomerId?.trim() || null,
          method: "POST",
          requestBody,
          statusCode: response.status,
          responseBody: rawBody,
          requestId: upstreamRequestId,
        })

        if (!response.ok) {
          const mapped = toGoogleAdsError({ status: response.status, body: rawBody })
          logGoogleAdsProviderError({
            endpoint: "googleAds:search",
            statusCode: response.status,
            errorCode: mapped.code,
            correlationId: input.connectionId,
            requestId: upstreamRequestId,
          })
          throw mapped
        }

        return JSON.parse(rawBody) as GoogleAdsApiPage
      } catch (error) {
        const mapped =
          error instanceof GoogleAdsIntegrationError
            ? error
            : new GoogleAdsIntegrationError(
                "Google Ads provider failure.",
                "GOOGLE_ADS_PROVIDER_FAILURE",
                true,
                502
              )

        logGoogleAdsProviderError({
          endpoint: "googleAds:search",
          statusCode: mapped.status,
          errorCode: mapped.code,
          correlationId: input.connectionId,
          requestId: null,
        })

        if (!mapped.retryable || attempt >= this.config.maxRetries) {
          throw mapped
        }

        attempt += 1
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000))
        )
      }
    }

    throw new GoogleAdsIntegrationError(
      "Google Ads request retries exhausted.",
      "GOOGLE_ADS_TRANSIENT_FAILURE",
      true,
      503
    )
  }

  private requireDeveloperToken() {
    const developerToken = this.config.developerToken.trim()
    if (developerToken.length === 0) {
      throw new GoogleAdsIntegrationError(
        "Google Ads developer token is missing.",
        "GOOGLE_ADS_PROVIDER_FAILURE",
        false,
        500
      )
    }

    return developerToken
  }
}
