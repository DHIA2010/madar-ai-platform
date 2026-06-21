import type { ReadModel, ReadModelViewModel } from "./read-model.contracts"

export type TrackingConsentStatus = "accepted" | "rejected" | "partial" | "unknown"

export type TrackingEventName =
  | "page_viewed"
  | "product_viewed"
  | "category_viewed"
  | "search_performed"
  | "add_to_cart"
  | "remove_from_cart"
  | "checkout_started"
  | "checkout_completed"
  | "purchase_completed"
  | "banner_clicked"
  | "promotion_clicked"
  | "collection_viewed"
  | "login"
  | "signup"

export interface TrackingDevice {
  deviceId: string
  type: "desktop" | "mobile" | "tablet" | "unknown"
  browser: string
  operatingSystem: string
  screenSize: string
}

export interface TrackingLocation {
  country?: string
  city?: string
}

export interface TrackingContext {
  timestamp: string
  timezone: string
  language: string
  currency?: string
  location: TrackingLocation
  device: TrackingDevice
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  landingPage?: string
  exitPage?: string
}

export interface TrackingConsent {
  status: TrackingConsentStatus
  categories: {
    analytics?: boolean
    marketing?: boolean
    personalization?: boolean
  }
  updatedAt: string
}

export interface TrackingVisitor {
  visitorId: string
  customerId?: string
  isAnonymous: boolean
  firstSeenAt: string
  lastSeenAt: string
  deviceIds: string[]
  mergedFromVisitorIds: string[]
}

export interface TrackingIdentity {
  visitorId: string
  customerId?: string
  emailHash?: string
  phoneHash?: string
}

export interface TrackingSession {
  sessionId: string
  visitorId: string
  customerId?: string
  isAnonymous: boolean
  isActive: boolean
  startedAt: string
  lastSeenAt: string
  expiresAt: string
  landingPage?: string
  exitPage?: string
  deviceId: string
}

export interface TrackingEvent {
  eventId: string
  sessionId: string
  visitorId: string
  customerId?: string
  name: TrackingEventName
  context: TrackingContext
  payload: Record<string, string | number | boolean | null>
}

export interface TrackingQueueItem {
  queueId: string
  event: TrackingEvent
  attempts: number
  lastError?: string
  enqueuedAt: string
  nextAttemptAt: string
}

export interface TrackingPipelineResult {
  accepted: boolean
  duplicate: boolean
  event?: TrackingEvent
  reason?: string
}

export interface TrackingDispatcherPort {
  dispatch(events: TrackingEvent[]): Promise<{ success: boolean; failedEventIds: string[] }>
}

export interface ActiveSessionsPayload {
  totalActiveSessions: number
  sessions: TrackingSession[]
}

export interface LiveVisitorsPayload {
  totalLiveVisitors: number
  visitors: TrackingVisitor[]
}

export interface FunnelStep {
  step: "page_viewed" | "product_viewed" | "add_to_cart" | "checkout_started" | "purchase_completed"
  count: number
}

export interface CurrentFunnelsPayload {
  steps: FunnelStep[]
}

export interface TopProductsPayload {
  products: Array<{ productId: string; views: number; purchases: number }>
}

export interface RecentEventsPayload {
  events: TrackingEvent[]
}

export interface AbandonedCartsPayload {
  carts: Array<{ visitorId: string; sessionId: string; itemCount: number; lastUpdatedAt: string }>
}

export type ActiveSessionsReadModel = ReadModel<ActiveSessionsPayload>
export type ActiveSessionsViewModel = ReadModelViewModel<ActiveSessionsPayload>

export type LiveVisitorsReadModel = ReadModel<LiveVisitorsPayload>
export type LiveVisitorsViewModel = ReadModelViewModel<LiveVisitorsPayload>

export type CurrentFunnelsReadModel = ReadModel<CurrentFunnelsPayload>
export type CurrentFunnelsViewModel = ReadModelViewModel<CurrentFunnelsPayload>

export type TopProductsReadModel = ReadModel<TopProductsPayload>
export type TopProductsViewModel = ReadModelViewModel<TopProductsPayload>

export type RecentEventsReadModel = ReadModel<RecentEventsPayload>
export type RecentEventsViewModel = ReadModelViewModel<RecentEventsPayload>

export type AbandonedCartsReadModel = ReadModel<AbandonedCartsPayload>
export type AbandonedCartsViewModel = ReadModelViewModel<AbandonedCartsPayload>
