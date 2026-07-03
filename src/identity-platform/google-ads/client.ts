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
        const response = await this.fetchFn(requestUrl, {
          method: "GET",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
            accept: "application/json",
          },
        })

        if (!response.ok) {
          const body = await response.text()
          throw toGoogleAdsError({ status: response.status, body })
        }

        const payload = (await response.json()) as { resourceNames?: unknown }
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

        const response = await this.fetchFn(
          requestUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              query: input.query,
              pageSize: input.pageSize ?? 1000,
              pageToken: input.nextPageToken,
            }),
          }
        )

        if (!response.ok) {
          const body = await response.text()
          throw toGoogleAdsError({ status: response.status, body })
        }

        return (await response.json()) as GoogleAdsApiPage
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
