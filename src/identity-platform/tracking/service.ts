import type { CacheProvider } from "../application/ports"
import type { CampaignLinkRepository } from "../campaign-links/repository"

import type { TrackingRepository } from "./repository"
import type { RecordClickInput, ResolvedCampaignLink } from "./types"

const REDIRECT_CACHE_TTL_SECONDS = 300

function cacheKeyFor(displayId: string) {
  return `campaign-link:redirect:${displayId}`
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

  // Called after the redirect response has already been sent. Must never throw back into the
  // caller in a way that could be mistaken for a redirect failure -- callers should fire this
  // and swallow/log any rejection themselves. Also used for the storefront snippet's PAGE_VIEW
  // captures -- RecordClickInput/the underlying inserts already handle both event types.
  async recordClick(input: RecordClickInput): Promise<void> {
    await this.repository.insertClickEvent(input)
    await this.repository.insertAttribution(input)
  }

  async resolveOrganizationBySiteKey(siteKey: string): Promise<string | null> {
    return this.repository.findOrganizationIdBySiteKey(siteKey)
  }

  async ensureSiteKey(organizationId: string): Promise<string> {
    return this.repository.ensureSiteKey(organizationId)
  }
}
