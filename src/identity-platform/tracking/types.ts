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

// Shared by both the /m/:displayId redirect (CLICK, campaignId/campaignLinkId always known)
// and the storefront capture snippet's /v1/tracking/capture (PAGE_VIEW, campaignId/
// campaignLinkId null until order-time UTM matching resolves them) -- one shape, one pair of
// repository insert methods, rather than forking parallel click/page-view copies.
export interface RecordClickInput {
  organizationId: string
  campaignId: string | null
  campaignLinkId: string | null
  eventType: "CLICK" | "PAGE_VIEW"
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
}
