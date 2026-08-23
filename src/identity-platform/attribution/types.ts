export const ORDER_PROVIDERS = ["salla", "shopify", "zid"] as const
export type OrderProvider = (typeof ORDER_PROVIDERS)[number]

export type MatchMethod =
  | "explicit_id"
  | "campaign_link_id"
  | "session_id"
  | "customer_ref"
  | "utm_match"
  | "unattributed"

export type AttributionStatus = "ATTRIBUTED" | "UNATTRIBUTED"

export interface OrderAttributionView {
  id: string
  organizationId: string
  provider: OrderProvider
  connectionId: string
  externalOrderId: string
  orderCreatedAt: string
  currency: string | null
  totalAmount: number | null
  customerRef: string | null
  attributionId: string | null
  campaignId: string | null
  campaignLinkId: string | null
  matchMethod: MatchMethod
  modelUsed: string
  attributionStatus: AttributionStatus
  createdAt: string
  updatedAt: string
}

export interface MatchOrdersResult {
  processed: number
  attributed: number
  unattributed: number
}

// What each provider's raw order payload can tell us before any matching runs. Only the fields
// we could confirm exist (or are documented as standard) go here -- everything else stays null
// rather than guessing at a provider's schema.
export interface OrderSignals {
  explicitAttributionId: string | null
  campaignLinkDisplayId: string | null
  sessionId: string | null
  customerEmail: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}

export interface CandidateOrder {
  provider: OrderProvider
  connectionId: string
  externalOrderId: string
  orderCreatedAt: string
  currency: string | null
  totalAmount: number | null
  signals: OrderSignals
}
