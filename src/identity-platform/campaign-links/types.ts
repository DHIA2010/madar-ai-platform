export type TrackingType = "FULL_URL" | "SHORT_LINK"

export interface CampaignLinkView {
  id: string
  organizationId: string
  workspaceId: string | null
  campaignId: string
  displayId: string
  name: string
  trackingType: TrackingType
  destinationBaseUrl: string
  finalUrl: string
  shortUrl: string | null
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  adGroupName: string | null
  adName: string | null
  customParams: Record<string, string>
  enabled: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface UtmInput {
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent?: string | null
  utmTerm?: string | null
}

export interface CreateCampaignLinkInput extends UtmInput {
  campaignId: string
  name: string
  trackingType: TrackingType
  destinationBaseUrl: string
  adGroupName?: string | null
  adName?: string | null
  customParams?: Record<string, string>
}

// Deliberately narrower than CreateCampaignLinkInput -- utm_*/trackingType/campaignId/
// adGroupName/adName are all tracking identifiers fixed at creation, same rationale as UTM:
// changing them after the link is live would silently break attribution matching for clicks
// that already happened. Only display metadata (name, custom params) stays editable.
export interface UpdateCampaignLinkInput {
  name?: string
  customParams?: Record<string, string>
}

export interface CampaignLinkPreview {
  finalUrl: string
  shortUrl: string | null
  normalizedUtm: {
    utmSource: string
    utmMedium: string
    utmCampaign: string
    utmContent: string | null
    utmTerm: string | null
  }
}
