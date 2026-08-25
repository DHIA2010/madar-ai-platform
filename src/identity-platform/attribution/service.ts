import type { CampaignLinkRepository } from "../campaign-links/repository"
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
    private readonly campaignLinkRepository: CampaignLinkRepository
  ) {}

  // Never throws -- an attribution failure must never surface as an order-ingestion failure.
  // Each step below is independently caught so one broken lookup degrades to the next step
  // rather than aborting the whole order.
  async matchOrders(
    organizationId: string,
    workspaceId: string | null,
    input: { provider?: OrderProvider } = {}
  ): Promise<MatchOrdersResult> {
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

    // 6. Unattributed -- never guessed.
    return UNATTRIBUTED
  }
}
