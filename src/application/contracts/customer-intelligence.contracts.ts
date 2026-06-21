import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type TrackingEventName =
  | "page_view"
  | "product_view"
  | "category_view"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "login"
  | "signup"
  | "logout"
  | "wishlist_add"
  | "wishlist_remove"
  | "coupon_apply"
  | "campaign_click"
  | "campaign_impression"

export interface TrafficSourceDto {
  source: string
  medium: string
  campaign: string
}

export interface CampaignAttributionDto {
  campaign: string
  source: string
  medium: string
  impressions: number
  clicks: number
  purchases: number
  revenue: number
}

export interface IdentityDto {
  identityId: string
  customerId: string
  email?: string
  phone?: string
  externalId?: string
  attachedAt: string
}

export interface VisitorDto {
  visitorId: string
  journeyId: string
  firstSeenAt: string
  lastSeenAt: string
  isAnonymous: boolean
  identityId?: string
  customerId?: string
  currentSessionId?: string
}

export interface SessionDto {
  sessionId: string
  visitorId: string
  startedAt: string
  endedAt?: string
  isActive: boolean
  entryPage: string
  exitPage: string
  eventCount: number
  source: string
  medium: string
  campaign: string
  device: string
  browser: string
  country: string
  city: string
}

export interface TrackingEventDto {
  eventId: string
  visitorId: string
  sessionId: string
  timestamp: string
  eventName: TrackingEventName
  page: string
  source: string
  medium: string
  campaign: string
  device: string
  browser: string
  country: string
  city: string
  metadata: Record<string, string | number | boolean | null>
}

export interface PageViewDto {
  eventId: string
  page: string
}

export interface ProductViewDto {
  eventId: string
  productId: string
}

export interface CartEventDto {
  eventId: string
  productId: string
  quantity: number
  action: "add_to_cart" | "remove_from_cart"
}

export interface CheckoutEventDto {
  eventId: string
  checkoutId: string
  step: string
}

export interface PurchaseEventDto {
  eventId: string
  orderId: string
  revenue: number
  currency: string
}

export interface CustomerJourneyDto {
  journeyId: string
  visitorIds: string[]
  identityId?: string
  customerId?: string
  firstEventAt?: string
  lastEventAt?: string
  events: TrackingEventDto[]
  sessions: SessionDto[]
}

export interface TimelineEntryDto {
  timelineId: string
  timestamp: string
  visitorId: string
  sessionId?: string
  eventName?: TrackingEventName
  action: "session_started" | "session_ended" | "event_tracked" | "identity_attached"
  label: string
}

export interface VisitorSummaryDto {
  visitor: VisitorDto
  sessions: SessionDto[]
  events: TrackingEventDto[]
  pageViews: PageViewDto[]
  productViews: ProductViewDto[]
}

export interface CustomerTimelineDto {
  customerId: string
  identity: IdentityDto
  timeline: TimelineEntryDto[]
}

export interface TrafficSourceStatsDto {
  source: string
  medium: string
  campaign: string
  visitors: number
  sessions: number
  events: number
}

export interface ProductInterestDto {
  productId: string
  views: number
  addToCart: number
  removeFromCart: number
  purchases: number
  abandons: number
}

export interface CustomerIntelligenceWidgetMetricsDto {
  visitors: number
  sessions: number
  bounceRate: number
  returningVisitors: number
  topLandingPages: Array<{ page: string; sessions: number }>
  topExitPages: Array<{ page: string; sessions: number }>
  mostViewedProducts: Array<{ productId: string; views: number }>
  mostAbandonedProducts: Array<{ productId: string; abandons: number }>
  checkoutFunnel: {
    addToCart: number
    beginCheckout: number
    purchase: number
  }
  customerJourneyTimeline: TimelineEntryDto[]
}

export interface StartSessionRequestDto {
  visitorId: string
  startedAt: string
  entryPage: string
  source: string
  medium: string
  campaign: string
  device: string
  browser: string
  country: string
  city: string
}

export interface EndSessionRequestDto {
  sessionId: string
  endedAt: string
  exitPage?: string
}

export interface TrackEventRequestDto {
  eventId: string
  visitorId: string
  sessionId: string
  timestamp: string
  eventName: TrackingEventName
  page: string
  source: string
  medium: string
  campaign: string
  device: string
  browser: string
  country: string
  city: string
  metadata: Record<string, string | number | boolean | null>
}

export interface AttachIdentityRequestDto {
  visitorId: string
  attachedAt: string
  email?: string
  phone?: string
  externalId?: string
}

export interface GetJourneyRequestDto {
  visitorId?: string
  customerId?: string
}

export interface CustomerIntelligenceRepository {
  startSession(input: StartSessionRequestDto): Promise<SessionDto>
  endSession(input: EndSessionRequestDto): Promise<SessionDto | null>
  trackEvent(input: TrackEventRequestDto): Promise<TrackingEventDto>
  attachIdentity(input: AttachIdentityRequestDto): Promise<CustomerJourneyDto>
  getJourney(input: GetJourneyRequestDto): Promise<CustomerJourneyDto | null>
  getVisitorHistory(visitorId: string): Promise<VisitorSummaryDto | null>
  getCustomerTimeline(customerId: string): Promise<CustomerTimelineDto | null>
  getTrafficSources(): Promise<TrafficSourceStatsDto[]>
  getCampaignAttribution(): Promise<CampaignAttributionDto[]>
  getProductInterest(): Promise<ProductInterestDto[]>
  getWidgetMetrics(): Promise<CustomerIntelligenceWidgetMetricsDto>
}

export type CustomerIntelligenceGateway = CustomerIntelligenceRepository

export type JourneyReadModel = ReadModel<CustomerJourneyDto>
export type JourneyViewModel = ReadModelViewModel<CustomerJourneyDto>

export type VisitorSummaryReadModel = ReadModel<VisitorSummaryDto>
export type VisitorSummaryViewModel = ReadModelViewModel<VisitorSummaryDto>

export type SessionReadModel = ReadModel<SessionDto>
export type SessionViewModel = ReadModelViewModel<SessionDto>

export type TimelineReadModel = ReadModel<CustomerTimelineDto>
export type TimelineViewModel = ReadModelViewModel<CustomerTimelineDto>

export type TrafficSourceReadModel = ReadModel<TrafficSourceStatsDto[]>
export type TrafficSourceViewModel = ReadModelViewModel<TrafficSourceStatsDto[]>

export type AttributionReadModel = ReadModel<CampaignAttributionDto[]>
export type AttributionViewModel = ReadModelViewModel<CampaignAttributionDto[]>

export type ProductInterestReadModel = ReadModel<ProductInterestDto[]>
export type ProductInterestViewModel = ReadModelViewModel<ProductInterestDto[]>
