import type { CampaignLinkRepository } from "../campaign-links/repository"
import { CAMPAIGN_PLATFORMS } from "../campaigns/types"
import type { CampaignService } from "../campaigns/service"
import { hashCustomerEmail } from "../tracking/customer-ref"

import type { AttributionRepository } from "./repository"
import type { CandidateOrder, MatchMethod, MatchOrdersResult, OrderProvider } from "./types"

interface MatchResult {
  matchMethod: MatchMethod
  attributionId: string | null
  campaignId: string | null
  campaignLinkId: string | null
}

const UNATTRIBUTED: MatchResult = {
  matchMethod: "unattributed",
  attributionId: null,
  campaignId: null,
  campaignLinkId: null,
}

export class OrderAttributionService {
  constructor(
    private readonly repository: AttributionRepository,
    private readonly campaignLinkRepository: CampaignLinkRepository,
    // Optional: lets matchOrders() keep the shared `campaigns` table fresh for the
    // campaign_name_match step (see below) now that the Link Builder's own "Import" button is no
    // longer the only thing that populates it. Null is accepted (e.g. in tests that don't care
    // about that step) and simply skips the re-import.
    private readonly campaignService?: CampaignService
  ) {}

  // Never throws -- an attribution failure must never surface as an order-ingestion failure.
  // Each step below is independently caught so one broken lookup degrades to the next step
  // rather than aborting the whole order.
  async matchOrders(
    organizationId: string,
    workspaceId: string | null,
    input: { provider?: OrderProvider } = {}
  ): Promise<MatchOrdersResult> {
    if (this.campaignService) {
      // Best-effort: fetchPlatformCampaigns() only reads already-synced local tables (no
      // external API calls), so this is cheap. Per-platform failures are swallowed and logged --
      // a broken campaign re-import must never block order matching.
      await Promise.all(
        CAMPAIGN_PLATFORMS.map((platform) =>
          this.campaignService!.importFromPlatform(organizationId, { platform }).catch((error) => {
            console.error("order_attribution.campaign_sync_failed", {
              organizationId,
              platform,
              error,
            })
          })
        )
      )
    }

    const candidates = await this.repository.fetchCandidateOrders(
      organizationId,
      workspaceId,
      input.provider
    )

    let attributed = 0
    let unattributed = 0

    for (const order of candidates) {
      const customerRef = hashCustomerEmail(order.signals.customerEmail)
      let match: MatchResult
      try {
        match = await this.resolveMatch(organizationId, order, customerRef)
      } catch (error) {
        console.error("order_attribution.match_step_failed", { organizationId, order, error })
        match = UNATTRIBUTED
      }

      const status = match.matchMethod === "unattributed" ? "UNATTRIBUTED" : "ATTRIBUTED"
      if (status === "ATTRIBUTED") attributed += 1
      else unattributed += 1

      await this.repository.upsertOrderAttribution({
        organizationId,
        provider: order.provider,
        connectionId: order.connectionId,
        externalOrderId: order.externalOrderId,
        orderCreatedAt: order.orderCreatedAt,
        currency: order.currency,
        totalAmount: order.totalAmount,
        customerRef,
        attributionId: match.attributionId,
        campaignId: match.campaignId,
        campaignLinkId: match.campaignLinkId,
        matchMethod: match.matchMethod,
        attributionStatus: status,
      })
    }

    return { processed: candidates.length, attributed, unattributed }
  }

  private async resolveMatch(
    organizationId: string,
    order: CandidateOrder,
    customerRef: string | null
  ): Promise<MatchResult> {
    const { signals } = order

    // 1. Explicit MADAR attribution id.
    if (signals.explicitAttributionId) {
      return {
        matchMethod: "explicit_id",
        attributionId: signals.explicitAttributionId,
        campaignId: null,
        campaignLinkId: null,
      }
    }

    // 2. Campaign link display id.
    if (signals.campaignLinkDisplayId) {
      const link = await this.campaignLinkRepository.findByDisplayId(signals.campaignLinkDisplayId)
      if (link && link.organizationId === organizationId) {
        return {
          matchMethod: "campaign_link_id",
          attributionId: null,
          campaignId: link.campaignId,
          campaignLinkId: link.id,
        }
      }
    }

    // 3. Session id (correlated with a prior click via attributions.session_id).
    if (signals.sessionId) {
      const bySession = await this.repository.findAttributionBySessionId(
        organizationId,
        signals.sessionId
      )
      if (bySession) {
        return {
          matchMethod: "session_id",
          attributionId: bySession.attributionId,
          campaignId: bySession.campaignId,
          campaignLinkId: bySession.campaignLinkId,
        }
      }
    }

    // 4. Customer ref (hashed email, matched against a prior click's attributions.customer_ref).
    if (customerRef) {
      const byCustomer = await this.repository.findAttributionByCustomerRef(
        organizationId,
        customerRef
      )
      if (byCustomer) {
        return {
          matchMethod: "customer_ref",
          attributionId: byCustomer.attributionId,
          campaignId: byCustomer.campaignId,
          campaignLinkId: byCustomer.campaignLinkId,
        }
      }
    }

    // 5. UTM match against the most recent campaign link created before the order.
    if (signals.utmSource && signals.utmMedium && signals.utmCampaign) {
      const byUtm = await this.repository.findCampaignLinkByUtm(
        organizationId,
        signals.utmSource,
        signals.utmMedium,
        signals.utmCampaign,
        order.orderCreatedAt
      )
      if (byUtm) {
        return {
          matchMethod: "utm_match",
          attributionId: null,
          campaignId: byUtm.campaignId,
          campaignLinkId: byUtm.campaignLinkId,
        }
      }
    }

    // 5b. No campaign-link match, but utm_campaign is present -- try matching directly against
    // an imported ad-platform campaign's name. This is the case for a merchant who tagged their
    // own ads with UTMs and never used Madar's Link Builder at all.
    if (signals.utmCampaign) {
      const byCampaignName = await this.repository.findImportedCampaignByUtmCampaign(
        organizationId,
        signals.utmCampaign,
        signals.utmSource
      )
      if (byCampaignName) {
        return {
          matchMethod: "campaign_name_match",
          attributionId: null,
          campaignId: byCampaignName.campaignId,
          campaignLinkId: null,
        }
      }
    }

    // 6. Unattributed -- never guessed.
    return UNATTRIBUTED
  }
}
