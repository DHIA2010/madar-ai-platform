export interface GA4OAuthTokenResponseDto {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: "Bearer"
}

export interface GA4TrafficMetricRowDto {
  date: string
  users: number
  new_users: number
  sessions: number
  engaged_sessions: number
  bounce_rate: number
}

export interface GA4AcquisitionMetricRowDto {
  source: string
  medium: string
  campaign: string
  channel_group: string
  users: number
  sessions: number
}

export interface GA4EngagementMetricRowDto {
  page_path: string
  page_views: number
  landing_page: string
  exit_page: string
  average_engagement_time_seconds: number
}

export interface GA4EcommerceMetricRowDto {
  item_id: string
  item_name: string
  product_views: number
  add_to_cart: number
  begin_checkout: number
  purchases: number
  revenue: number
  currency: string
}

export interface GA4EventMetricRowDto {
  event_name:
    | "page_view"
    | "session_start"
    | "view_item"
    | "add_to_cart"
    | "begin_checkout"
    | "purchase"
  event_count: number
}

export interface CanonicalTrafficMetrics {
  date: string
  users: number
  newUsers: number
  sessions: number
  engagedSessions: number
  bounceRate: number
}

export interface CanonicalAcquisitionMetrics {
  source: string
  medium: string
  campaign: string
  channelGroup: string
  users: number
  sessions: number
}

export interface CanonicalEngagementMetrics {
  pagePath: string
  pageViews: number
  landingPage: string
  exitPage: string
  averageEngagementTimeSeconds: number
}

export interface CanonicalEcommerceMetrics {
  itemId: string
  itemName: string
  productViews: number
  addToCart: number
  beginCheckout: number
  purchases: number
  revenue: number
  currency: string
}

export interface CanonicalEventMetrics {
  eventName:
    | "page_view"
    | "session_start"
    | "view_item"
    | "add_to_cart"
    | "begin_checkout"
    | "purchase"
  eventCount: number
}
