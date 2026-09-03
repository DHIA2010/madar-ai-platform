import type { CacheProvider } from "../application/ports"
import type { CampaignLinkRepository } from "../campaign-links/repository"

import { resolveTrackingConfig, type TrackingRemoteConfig } from "./config"
import type { LiveVisitorRow, TrackingRepository } from "./repository"
import type { RecordClickInput, ResolvedCampaignLink, TrackingEventType } from "./types"

const REDIRECT_CACHE_TTL_SECONDS = 300

function cacheKeyFor(displayId: string) {
  return `campaign-link:redirect:${displayId}`
}

// Wire-level event names (schemas.ts's TRACKING_EVENT_NAMES, what the snippet/SDK sends) to the
// DB's SCREAMING_SNAKE_CASE event_type (migration 043's check constraint). An unrecognized name
// can't reach here -- zod's z.enum already rejects it before this runs -- so the fallback only
// guards against a future desync between the two lists, never silently mis-tags real traffic.
const EVENT_NAME_TO_TYPE: Record<string, TrackingEventType> = {
  page_view: "PAGE_VIEW",
  product_view: "PRODUCT_VIEW",
  product_list_view: "PRODUCT_LIST_VIEW",
  search: "SEARCH",
  add_to_cart: "ADD_TO_CART",
  remove_from_cart: "REMOVE_FROM_CART",
  cart_view: "CART_VIEW",
  checkout_started: "CHECKOUT_STARTED",
  checkout_completed: "CHECKOUT_COMPLETED",
  purchase: "PURCHASE",
  identify: "IDENTIFY",
  heartbeat: "HEARTBEAT",
}

export function toTrackingEventType(eventName: string): TrackingEventType {
  return EVENT_NAME_TO_TYPE[eventName] ?? "PAGE_VIEW"
}

// event_type values worth surfacing as a live visitor's "current product" -- anything else
// clears product_id/product_name back to null so the column reflects genuine current context,
// not a stale value from three page views ago.
const PRODUCT_CONTEXT_EVENT_TYPES = new Set<TrackingEventType>([
  "PRODUCT_VIEW",
  "ADD_TO_CART",
  "REMOVE_FROM_CART",
  "CART_VIEW",
])

function readStringProperty(
  properties: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = properties?.[key]
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return null
}

export class TrackingService {
  constructor(
    private readonly campaignLinkRepository: CampaignLinkRepository,
    private readonly repository: TrackingRepository,
    private readonly cache?: CacheProvider
  ) {}

  // Cache-aside: a hit costs zero Postgres queries, which is the point -- the redirect route
  // must stay as thin as a single cached-key lookup on the common path.
  async resolveLink(displayId: string): Promise<ResolvedCampaignLink | null> {
    const cacheKey = cacheKeyFor(displayId)

    if (this.cache) {
      const cached = await this.cache.get(cacheKey)
      if (cached) {
        try {
          return JSON.parse(cached) as ResolvedCampaignLink
        } catch {
          // Fall through to the database read below on a corrupt cache entry.
        }
      }
    }

    const link = await this.campaignLinkRepository.findByDisplayId(displayId)
    if (!link) return null

    const resolved: ResolvedCampaignLink = {
      campaignLinkId: link.id,
      organizationId: link.organizationId,
      campaignId: link.campaignId,
      finalUrl: link.finalUrl,
      enabled: link.enabled,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      utmContent: link.utmContent,
      utmTerm: link.utmTerm,
    }

    if (this.cache) {
      await this.cache.set(cacheKey, JSON.stringify(resolved), REDIRECT_CACHE_TTL_SECONDS)
    }

    return resolved
  }

  // Called after the redirect response has already been sent (the /m/:displayId CLICK case).
  // Must never throw back into the caller in a way that could be mistaken for a redirect
  // failure -- callers should fire this and swallow/log any rejection themselves. Also the
  // entry point for every event the storefront capture snippet/SDK sends.
  //
  // HEARTBEAT never touches tracking_events (a 30s presence ping per visitor would otherwise
  // dwarf every other event type in volume) -- it only refreshes tracking_live_visitors.
  // attributions only gets a new touchpoint row for CLICK/PAGE_VIEW, matching the table's
  // existing purpose (order-attribution matching), not every granular e-commerce event.
  async recordEvent(input: RecordClickInput): Promise<void> {
    if (input.eventType !== "HEARTBEAT") {
      await this.repository.insertClickEvent(input)
    }

    if (input.eventType === "CLICK" || input.eventType === "PAGE_VIEW") {
      await this.repository.insertAttribution(input)
    }

    const isProductContext = PRODUCT_CONTEXT_EVENT_TYPES.has(input.eventType)
    await this.repository.upsertLiveVisitor({
      organizationId: input.organizationId,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      currentPageUrl: input.page?.url ?? input.landingUrl ?? null,
      currentPageTitle: input.page?.title ?? null,
      productId: isProductContext ? readStringProperty(input.properties, "product_id") : null,
      productName: isProductContext ? readStringProperty(input.properties, "product_name") : null,
      country: input.geo?.country ?? null,
      city: input.geo?.city ?? null,
      deviceType: input.device?.type ?? input.deviceType ?? null,
      browser: input.device?.browser ?? null,
      trafficSource: input.trafficSource ?? null,
      campaign: input.utmCampaign ?? null,
      currentActivity: input.eventType,
    })
  }

  async resolveOrganizationBySiteKey(siteKey: string): Promise<string | null> {
    return this.repository.findOrganizationIdBySiteKey(siteKey)
  }

  async ensureSiteKey(organizationId: string): Promise<string> {
    return this.repository.ensureSiteKey(organizationId)
  }

  async getTrackingConfig(organizationId: string): Promise<TrackingRemoteConfig> {
    const override = await this.repository.getTrackingConfigOverride(organizationId)
    return resolveTrackingConfig(override)
  }

  async getLiveVisitors(organizationId: string): Promise<LiveVisitorRow[]> {
    const config = await this.getTrackingConfig(organizationId)
    const sinceTimestamp = new Date(Date.now() - config.live_visitor_timeout).toISOString()
    return this.repository.listLiveVisitors(organizationId, sinceTimestamp)
  }
}
