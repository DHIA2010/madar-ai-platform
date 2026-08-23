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

export interface RecordClickInput {
  organizationId: string
  campaignId: string
  campaignLinkId: string
  visitorId: string
  sessionId: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent: string | null
  utmTerm: string | null
  landingUrl: string
  referrerUrl: string | null
  deviceType: string | null
}
