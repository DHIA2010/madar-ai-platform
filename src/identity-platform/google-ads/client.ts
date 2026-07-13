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

function maskSecret(value: string, keep = 8) {
  if (!value) {
    return ""
  }

  if (value.length <= keep) {
    return "*".repeat(value.length)
  }

  return `${value.slice(0, keep)}***`
}

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
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

    while (attempt <= this.config.maxRetries) {
      await this.rateLimiter.waitTurn()

      try {
        const developerToken = this.requireDeveloperToken()
        const accessToken = await this.authProvider.getAccessToken(connectionId)
        const requestUrl = `${this.config.apiBaseUrl.replace(/\/$/, "")}/customers:listAccessibleCustomers`

        console.info("[TEMP_DIAGNOSTIC][google-ads] request", {
          operation: "customers:listAccessibleCustomers",
          method: "GET",
          connectionId,
          customerId: null,
          url: requestUrl,
          loginCustomerId: this.config.loginCustomerId ?? null,
          headers: {
            authorization: `Bearer ${maskSecret(accessToken, 12)}`,
            "developer-token": maskSecret(developerToken, 4),
            accept: "application/json",
          },
          developerTokenPresent: developerToken.trim().length > 0,
          oauthTokenPresent: accessToken.trim().length > 0,
        })

        const response = await this.fetchFn(requestUrl, {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            accept: "application/json",
          },
        })

        const rawBody = await response.text()
        console.info("[TEMP_DIAGNOSTIC][google-ads] response", {
          operation: "customers:listAccessibleCustomers",
          method: "GET",
          connectionId,
          customerId: null,
          url: requestUrl,
          status: response.status,
          rawResponse: rawBody,
        })

        if (!response.ok) {
          throw toGoogleAdsError({ status: response.status, body: rawBody })
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
        const mapped = error instanceof GoogleAdsIntegrationError
          ? error
          : new GoogleAdsIntegrationError(
            "Google Ads provider failure.",
            "GOOGLE_ADS_PROVIDER_FAILURE",
            true,
            502
          )

        if (!mapped.retryable || attempt >= this.config.maxRetries) {
          throw mapped
        }

        attempt += 1
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000)))
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

    while (attempt <= this.config.maxRetries) {
      await this.rateLimiter.waitTurn()

      try {
        const developerToken = this.requireDeveloperToken()

        const accessToken = await this.authProvider.getAccessToken(input.connectionId)
        const requestUrl = `${this.config.apiBaseUrl.replace(/\/$/, "")}/customers/${encodeURIComponent(input.customerId)}/googleAds:search`
        const headers: Record<string, string> = {
          authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "content-type": "application/json",
          ...(this.config.loginCustomerId ? { "login-customer-id": this.config.loginCustomerId } : {}),
        }

        const requestBody = JSON.stringify({
          query: input.query,
          pageSize: input.pageSize ?? 1000,
          pageToken: input.nextPageToken,
        })

        console.info("[TEMP_DIAGNOSTIC][google-ads] request", {
          operation: "googleAds:search",
          method: "POST",
          connectionId: input.connectionId,
          customerId: input.customerId,
          url: requestUrl,
          loginCustomerId: this.config.loginCustomerId ?? null,
          headers: {
            authorization: `Bearer ${maskSecret(accessToken, 12)}`,
            "developer-token": maskSecret(developerToken, 4),
            "content-type": "application/json",
            "login-customer-id": this.config.loginCustomerId ?? null,
          },
          developerTokenPresent: developerToken.trim().length > 0,
          oauthTokenPresent: accessToken.trim().length > 0,
          requestBody,
        })

        const response = await this.fetchFn(
          requestUrl,
          {
            method: "POST",
            headers,
            body: requestBody,
          }
        )

        const rawBody = await response.text()
        const responseHeaders = Object.fromEntries(response.headers.entries())
        console.info("[TEMP_DIAGNOSTIC][google-ads] response", {
          operation: "googleAds:search",
          method: "POST",
          connectionId: input.connectionId,
          customerId: input.customerId,
          url: requestUrl,
          status: response.status,
          responseHeaders,
          rawResponse: rawBody,
        })

        if (!response.ok) {
          const parsed = parseJsonSafe(rawBody)
          const errorPayload = parsed?.error as Record<string, unknown> | undefined
          const errorDetails = Array.isArray(errorPayload?.details)
            ? errorPayload?.details
            : []
          const googleAdsFailure = errorDetails.find((detail) => {
            if (!detail || typeof detail !== "object") {
              return false
            }

            const atType = (detail as Record<string, unknown>)["@type"]
            return typeof atType === "string" && atType.includes("GoogleAdsFailure")
          })

          console.error("[TEMP_DIAGNOSTIC][google-ads] upstream error before mapping", {
            operation: "googleAds:search",
            method: "POST",
            url: requestUrl,
            customerId: input.customerId,
            loginCustomerId: this.config.loginCustomerId ?? null,
            developerTokenPresent: developerToken.trim().length > 0,
            authorizationHeaderPresent: Boolean(headers.authorization),
            requestId:
              response.headers.get("request-id")
              ?? response.headers.get("x-request-id")
              ?? response.headers.get("requestid")
              ?? null,
            status: response.status,
            errorObject: parsed,
            errorCode: errorPayload?.code ?? null,
            errorStatus: errorPayload?.status ?? null,
            errorDetails,
            googleAdsFailure,
            nestedErrors:
              (googleAdsFailure && typeof googleAdsFailure === "object")
                ? (googleAdsFailure as Record<string, unknown>).errors ?? null
                : null,
            responseHeaders,
            rawResponse: rawBody,
          })

          throw toGoogleAdsError({ status: response.status, body: rawBody })
        }

        return JSON.parse(rawBody) as GoogleAdsApiPage
      } catch (error) {
        console.error("[TEMP_DIAGNOSTIC][google-ads] client exception", {
          operation: "googleAds:search",
          method: "POST",
          customerId: input.customerId,
          connectionId: input.connectionId,
          errorObject: error,
          errorCode:
            error instanceof GoogleAdsIntegrationError
              ? error.code
              : (error as { code?: unknown })?.code ?? null,
          errorStatus:
            error instanceof GoogleAdsIntegrationError
              ? error.status
              : (error as { status?: unknown })?.status ?? null,
          errorDetails:
            (error as { details?: unknown })?.details
            ?? (error as { response?: { data?: unknown } })?.response?.data
            ?? null,
        })

        const mapped = error instanceof GoogleAdsIntegrationError
          ? error
          : new GoogleAdsIntegrationError(
            "Google Ads provider failure.",
            "GOOGLE_ADS_PROVIDER_FAILURE",
            true,
            502
          )

        if (!mapped.retryable || attempt >= this.config.maxRetries) {
          throw mapped
        }

        attempt += 1
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 4000)))
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
