import type { CampaignPlatform } from "../campaigns/types"

export interface PlatformSignals {
  clickId: string | null
  clickIdPlatform: CampaignPlatform | null
  platformCampaignId: string | null
  platformAdgroupId: string | null
  platformKeyword: string | null
  platformCreativeId: string | null
}

// Shared param names across all 4 platforms so the /m/:displayId redirect handler and the
// storefront capture snippet (tracking/snippet.ts) can parse resolved macro values with one
// set of keys, regardless of which network actually resolved them.
const ENTITY_ID_PARAMS = {
  campaignId: "madar_ad_campaign_id",
  adgroupId: "madar_ad_adgroup_id",
  keyword: "madar_ad_keyword",
  creativeId: "madar_ad_creative_id",
} as const

type EntityIdKey = keyof typeof ENTITY_ID_PARAMS

// Meta/TikTok/Snapchat auto-append their own click-id param (fbclid/ttclid/ScCid) to any
// clicked URL unconditionally -- no outbound macro needed for those. Google only does this
// via auto-tagging, which is on by default but account-disablable, so an explicit gclid
// macro is kept as belt-and-suspenders.
const OUTBOUND_CLICK_ID_MACRO: Partial<Record<CampaignPlatform, string>> = {
  google_ads: "gclid={gclid}",
}

// Entity-ID macro tokens the platform substitutes with real IDs before the click reaches us.
// TikTok has no ad-group-level macro distinct from the ad itself -- adgroupId is deliberately
// left unmapped (never appended) for tiktok_ads, not a placeholder bug.
// Snapchat's exact current entity-ID macro syntax is not confirmed against current Ads
// Manager docs -- left empty until verified; only its click-id (ScCid) is captured for now.
const ENTITY_MACRO_TOKENS: Record<CampaignPlatform, Partial<Record<EntityIdKey, string>>> = {
  google_ads: {
    campaignId: "{campaignid}",
    adgroupId: "{adgroupid}",
    keyword: "{keyword}",
    creativeId: "{creative}",
  },
  meta_ads: {
    campaignId: "{{campaign.id}}",
    adgroupId: "{{adset.id}}",
    creativeId: "{{ad.id}}",
  },
  tiktok_ads: {
    campaignId: "__CAMPAIGN_ID__",
    creativeId: "__CID__",
  },
  snapchat_ads: {},
}

/**
 * Builds the raw macro query fragment for a generated link's target platform. Returns "" when
 * platform is null.
 *
 * MUST stay raw string concatenation, never URLSearchParams/encodeURIComponent on the macro
 * tokens -- URLSearchParams would percent-encode "{"/"}" (and Meta's "{{"), silently breaking
 * platform substitution. Browsers auto-decode %7B%7D in the address bar, so this bug is
 * invisible in manual testing and only breaks once a real ad actually serves the URL.
 */
export function buildPlatformMacroFragment(platform: CampaignPlatform | null): string {
  if (!platform) {
    return ""
  }

  const parts: string[] = []
  const clickIdMacro = OUTBOUND_CLICK_ID_MACRO[platform]
  if (clickIdMacro) {
    parts.push(clickIdMacro)
  }

  const tokens = ENTITY_MACRO_TOKENS[platform]
  for (const key of Object.keys(ENTITY_ID_PARAMS) as EntityIdKey[]) {
    const token = tokens[key]
    if (token) {
      parts.push(`${ENTITY_ID_PARAMS[key]}=${token}`)
    }
  }

  return parts.join("&")
}

// Appends a raw, already-formed fragment (key=value&key2=value2, no encoding) to a URL --
// distinct from tracking/utm.ts's appendUtmToUrl, which encodes real values through
// URLSearchParams and would corrupt macro tokens.
export function appendRawFragment(baseUrl: string, fragment: string): string {
  if (!fragment) {
    return baseUrl
  }
  const separator = baseUrl.includes("?") ? "&" : "?"
  return `${baseUrl}${separator}${fragment}`
}

const CLICK_ID_PARAM_BY_PLATFORM: Array<{ param: string; platform: CampaignPlatform }> = [
  { param: "gclid", platform: "google_ads" },
  { param: "fbclid", platform: "meta_ads" },
  { param: "ttclid", platform: "tiktok_ads" },
  { param: "ScCid", platform: "snapchat_ads" },
]

// Reads whatever the network actually resolved onto an incoming click/page-view request --
// used by both the /m/:displayId redirect handler (server-side) and documented as the source
// of truth the hand-authored storefront snippet (tracking/snippet.ts) must mirror key-for-key.
export function extractPlatformSignals(searchParams: URLSearchParams): PlatformSignals {
  let clickId: string | null = null
  let clickIdPlatform: CampaignPlatform | null = null
  for (const { param, platform } of CLICK_ID_PARAM_BY_PLATFORM) {
    const value = searchParams.get(param)
    if (value) {
      clickId = value
      clickIdPlatform = platform
      break
    }
  }

  return {
    clickId,
    clickIdPlatform,
    platformCampaignId: searchParams.get(ENTITY_ID_PARAMS.campaignId) || null,
    platformAdgroupId: searchParams.get(ENTITY_ID_PARAMS.adgroupId) || null,
    platformKeyword: searchParams.get(ENTITY_ID_PARAMS.keyword) || null,
    platformCreativeId: searchParams.get(ENTITY_ID_PARAMS.creativeId) || null,
  }
}
