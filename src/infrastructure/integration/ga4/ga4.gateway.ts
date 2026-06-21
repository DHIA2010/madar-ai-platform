import type { AccessToken, RefreshToken } from "@/application/contracts/integration.contracts"

import type {
  GA4AcquisitionMetricRowDto,
  GA4EcommerceMetricRowDto,
  GA4EngagementMetricRowDto,
  GA4EventMetricRowDto,
  GA4OAuthTokenResponseDto,
  GA4TrafficMetricRowDto,
} from "./ga4.dtos"

function nowDate() {
  return new Date().toISOString().slice(0, 10)
}

export class GA4Gateway {
  async exchangeAuthorizationCode(
    connectionId: string,
    authorizationCode?: string
  ): Promise<GA4OAuthTokenResponseDto> {
    const codeSeed = authorizationCode ?? "default"
    return {
      access_token: `ga4_access_${connectionId}_${codeSeed}`,
      refresh_token: `ga4_refresh_${connectionId}_${codeSeed}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async refreshAccessToken(
    connectionId: string,
    refreshToken?: RefreshToken
  ): Promise<GA4OAuthTokenResponseDto> {
    const tokenSeed = refreshToken?.value ?? "seed"
    return {
      access_token: `ga4_access_${connectionId}_${Date.now()}_${tokenSeed}`,
      refresh_token: `ga4_refresh_${connectionId}_${Date.now()}`,
      expires_in: 3600,
      token_type: "Bearer",
    }
  }

  async validateToken(accessToken?: AccessToken): Promise<boolean> {
    if (!accessToken) {
      return false
    }

    return new Date(accessToken.expiresAt).getTime() > Date.now()
  }

  async fetchTrafficMetrics(mode: "initial" | "incremental"): Promise<GA4TrafficMetricRowDto[]> {
    const rows: GA4TrafficMetricRowDto[] = [
      {
        date: nowDate(),
        users: 1200,
        new_users: 340,
        sessions: 1800,
        engaged_sessions: 980,
        bounce_rate: 45.2,
      },
    ]

    if (mode === "initial") {
      rows.push({
        date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
        users: 1100,
        new_users: 300,
        sessions: 1600,
        engaged_sessions: 900,
        bounce_rate: 43.5,
      })
    }

    return rows
  }

  async fetchAcquisitionMetrics(
    mode: "initial" | "incremental"
  ): Promise<GA4AcquisitionMetricRowDto[]> {
    const rows: GA4AcquisitionMetricRowDto[] = [
      {
        source: "google",
        medium: "organic",
        campaign: "brand_search",
        channel_group: "Organic Search",
        users: 700,
        sessions: 900,
      },
    ]

    if (mode === "initial") {
      rows.push({
        source: "newsletter",
        medium: "email",
        campaign: "summer_drop",
        channel_group: "Email",
        users: 150,
        sessions: 210,
      })
    }

    return rows
  }

  async fetchEngagementMetrics(
    mode: "initial" | "incremental"
  ): Promise<GA4EngagementMetricRowDto[]> {
    const rows: GA4EngagementMetricRowDto[] = [
      {
        page_path: "/",
        page_views: 1300,
        landing_page: "/",
        exit_page: "/checkout",
        average_engagement_time_seconds: 74,
      },
    ]

    if (mode === "initial") {
      rows.push({
        page_path: "/products/shirt-1",
        page_views: 420,
        landing_page: "/products/shirt-1",
        exit_page: "/cart",
        average_engagement_time_seconds: 95,
      })
    }

    return rows
  }

  async fetchEcommerceMetrics(
    mode: "initial" | "incremental"
  ): Promise<GA4EcommerceMetricRowDto[]> {
    const rows: GA4EcommerceMetricRowDto[] = [
      {
        item_id: "sku_1",
        item_name: "Performance Shirt",
        product_views: 280,
        add_to_cart: 70,
        begin_checkout: 30,
        purchases: 18,
        revenue: 5400,
        currency: "SAR",
      },
    ]

    if (mode === "initial") {
      rows.push({
        item_id: "sku_2",
        item_name: "Sport Cap",
        product_views: 190,
        add_to_cart: 44,
        begin_checkout: 20,
        purchases: 12,
        revenue: 1800,
        currency: "SAR",
      })
    }

    return rows
  }

  async fetchEventMetrics(mode: "initial" | "incremental"): Promise<GA4EventMetricRowDto[]> {
    const rows: GA4EventMetricRowDto[] = [
      { event_name: "page_view", event_count: 3200 },
      { event_name: "session_start", event_count: 1100 },
      { event_name: "view_item", event_count: 620 },
      { event_name: "add_to_cart", event_count: 180 },
      { event_name: "begin_checkout", event_count: 92 },
      { event_name: "purchase", event_count: 51 },
    ]

    return mode === "initial"
      ? rows
      : rows.map((row) => ({ ...row, event_count: Math.floor(row.event_count * 0.6) }))
  }
}
