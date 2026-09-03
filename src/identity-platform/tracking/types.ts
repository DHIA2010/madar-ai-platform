import type { CampaignPlatform } from "../campaigns/types"

export interface ResolvedCampaignLink {
  campaignLinkId: string
  organizationId: string
  campaignId: string
  finalUrl: string
  enabled: boolean
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
}

// The full Madar Tracking SDK vocabulary (spec section 6) plus HEARTBEAT/IDENTIFY, matching
// migration 043's tracking_events_event_type_check. Kept as DB-shaped SCREAMING_SNAKE_CASE,
// distinct from the wire-level lowercase names in schemas.ts's TRACKING_EVENT_NAMES -- see
// EVENT_NAME_TO_TYPE in ./service.ts for the mapping.
export type TrackingEventType =
  | "CLICK"
  | "PAGE_VIEW"
  | "PRODUCT_VIEW"
  | "PRODUCT_LIST_VIEW"
  | "SEARCH"
  | "ADD_TO_CART"
  | "REMOVE_FROM_CART"
  | "CART_VIEW"
  | "CHECKOUT_STARTED"
  | "CHECKOUT_COMPLETED"
  | "PURCHASE"
  | "IDENTIFY"
  | "HEARTBEAT"

export interface TrackingPageContext {
  url: string | null
  path: string | null
  title: string | null
  referrer: string | null
}

export interface TrackingDeviceContext {
  type: string | null
  browser: string | null
  browserVersion: string | null
  os: string | null
  screenWidth: number | null
  screenHeight: number | null
  language: string | null
  timezone: string | null
}

export interface TrackingGeoContext {
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
}

// Shared by the /m/:displayId redirect (CLICK, campaignId/campaignLinkId always known) and the
// storefront capture snippet's /v1/tracking/capture (every other event type, campaignId/
// campaignLinkId null until order-time UTM matching resolves them) -- one shape, one pair of
// repository insert methods, rather than forking parallel copies per event type.
export interface RecordClickInput {
  organizationId: string
  campaignId: string | null
  campaignLinkId: string | null
  eventType: TrackingEventType
  eventId?: string | null
  visitorId: string
  sessionId: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  landingUrl: string | null
  referrerUrl: string | null
  deviceType: string | null
  clickId: string | null
  clickIdPlatform: CampaignPlatform | null
  platformCampaignId: string | null
  platformAdgroupId: string | null
  platformKeyword: string | null
  platformCreativeId: string | null
  customerRef: string | null
  customerId?: string | null
  properties?: Record<string, unknown> | null
  page?: TrackingPageContext | null
  device?: TrackingDeviceContext | null
  geo?: TrackingGeoContext | null
  trafficSource?: string | null
  referrerDomain?: string | null
}
