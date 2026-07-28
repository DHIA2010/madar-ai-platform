import type { OAuthAdapter } from "../../application/ports"

export interface GoogleAdsAccountProfile {
  accountId: string
  customerId: string
  name: string
  currency: string
  timezone: string
}

export class GoogleAdsV2OAuthAdapter implements OAuthAdapter {
  connectorId = "google_ads"

  buildAuthorizationUrl(input: {
    state: string
    codeChallenge?: string
    redirectUri: string
    scopes: string[]
    offlineAccess: boolean
  }) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.searchParams.set("client_id", "google-ads-v2-client")
    url.searchParams.set("redirect_uri", input.redirectUri)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", input.state)
    url.searchParams.set("scope", input.scopes.join(" "))
    if (input.codeChallenge) {
      url.searchParams.set("code_challenge", input.codeChallenge)
      url.searchParams.set("code_challenge_method", "S256")
    }
    if (input.offlineAccess) {
      url.searchParams.set("access_type", "offline")
    }
    return url.toString()
  }

  async exchangeCode(input: { code: string; redirectUri: string; codeVerifier?: string }) {
    void input.redirectUri
    void input.codeVerifier
    return {
      accessToken: `google_ads_access_${input.code}`,
      refreshToken: `google_ads_refresh_${input.code}`,
      expiresInSeconds: 3600,
      scopes: [
        "https://www.googleapis.com/auth/adwords",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      providerAccountId: `manager_${input.code}`,
      providerAccountEmail: `google-ads-${input.code}@example.com`,
    }
  }

  async refreshAccessToken(input: { refreshToken: string }) {
    return {
      accessToken: `google_ads_access_refreshed_${input.refreshToken}`,
      refreshToken: input.refreshToken,
      expiresInSeconds: 3600,
      scopes: ["https://www.googleapis.com/auth/adwords"],
    }
  }

  async revokeToken(_input: { refreshToken?: string; accessToken?: string }) {
    return
  }
}

export class GoogleAdsV2Api {
  async discoverAccounts(_input: { accessToken: string }): Promise<GoogleAdsAccountProfile[]> {
    return [
      {
        accountId: "google-account-1",
        customerId: "123-456-7890",
        name: "Madar Search",
        currency: "USD",
        timezone: "America/New_York",
      },
      {
        accountId: "google-account-2",
        customerId: "456-789-0123",
        name: "Madar Display",
        currency: "EUR",
        timezone: "Europe/Berlin",
      },
    ]
  }
}
