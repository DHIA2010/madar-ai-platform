// Single source of truth for both what GET /v1/tracking/config/:siteKey returns and what the
// server applies when enriching a captured event (heartbeat/session timeouts, referrer
// classification). A per-organization override lives in organizations.tracking_config (jsonb,
// migration 043) and is merged over these defaults -- most orgs will never set one.

export const CURRENT_SDK_VERSION = "1.0.0"
export const MINIMUM_SUPPORTED_SDK_VERSION = "1.0.0"

export interface ReferrerRule {
  domainIncludes: string
  trafficSource: string
}

// Order matters: first match wins, so more specific domains should precede broader ones.
export const DEFAULT_REFERRER_RULES: ReferrerRule[] = [
  { domainIncludes: "google.", trafficSource: "Organic Search" },
  { domainIncludes: "bing.", trafficSource: "Organic Search" },
  { domainIncludes: "yahoo.", trafficSource: "Organic Search" },
  { domainIncludes: "duckduckgo.", trafficSource: "Organic Search" },
  { domainIncludes: "instagram.", trafficSource: "Social" },
  { domainIncludes: "facebook.", trafficSource: "Social" },
  { domainIncludes: "tiktok.", trafficSource: "Social" },
  { domainIncludes: "snapchat.", trafficSource: "Social" },
  { domainIncludes: "twitter.", trafficSource: "Social" },
  { domainIncludes: "x.com", trafficSource: "Social" },
  { domainIncludes: "linkedin.", trafficSource: "Social" },
  { domainIncludes: "youtube.", trafficSource: "Social" },
]

export interface TrackingRemoteConfig {
  sdk_version: string
  minimum_supported_version: string
  heartbeat_interval: number
  session_timeout: number
  live_visitor_timeout: number
  tracking: {
    page_view: boolean
    product_view: boolean
    add_to_cart: boolean
    checkout: boolean
    purchase: boolean
  }
  attribution: {
    utm: boolean
    gclid: boolean
    fbclid: boolean
    ttclid: boolean
    snap_click_id: boolean
  }
  referrer_rules: ReferrerRule[]
}

export const DEFAULT_TRACKING_CONFIG: TrackingRemoteConfig = {
  sdk_version: CURRENT_SDK_VERSION,
  minimum_supported_version: MINIMUM_SUPPORTED_SDK_VERSION,
  heartbeat_interval: 30_000,
  session_timeout: 1_800_000,
  live_visitor_timeout: 300_000,
  tracking: {
    page_view: true,
    product_view: true,
    add_to_cart: true,
    checkout: true,
    purchase: true,
  },
  attribution: {
    utm: true,
    gclid: true,
    fbclid: true,
    ttclid: true,
    snap_click_id: true,
  },
  referrer_rules: DEFAULT_REFERRER_RULES,
}

// Shallow-merges an org's stored override (organizations.tracking_config) over the defaults.
// Deliberately not a deep/recursive merge beyond one level of nesting -- an org overriding, say,
// tracking.purchase=false still gets every other tracking.* default, but a malformed override
// (wrong shape entirely) can never crash this: unknown/mistyped keys are just ignored via the
// spread order (defaults first, then only the recognized override keys layered on top).
export function resolveTrackingConfig(override: unknown): TrackingRemoteConfig {
  if (!override || typeof override !== "object") {
    return DEFAULT_TRACKING_CONFIG
  }

  const o = override as Partial<TrackingRemoteConfig>
  return {
    sdk_version:
      typeof o.sdk_version === "string" ? o.sdk_version : DEFAULT_TRACKING_CONFIG.sdk_version,
    minimum_supported_version:
      typeof o.minimum_supported_version === "string"
        ? o.minimum_supported_version
        : DEFAULT_TRACKING_CONFIG.minimum_supported_version,
    heartbeat_interval:
      typeof o.heartbeat_interval === "number"
        ? o.heartbeat_interval
        : DEFAULT_TRACKING_CONFIG.heartbeat_interval,
    session_timeout:
      typeof o.session_timeout === "number"
        ? o.session_timeout
        : DEFAULT_TRACKING_CONFIG.session_timeout,
    live_visitor_timeout:
      typeof o.live_visitor_timeout === "number"
        ? o.live_visitor_timeout
        : DEFAULT_TRACKING_CONFIG.live_visitor_timeout,
    tracking: { ...DEFAULT_TRACKING_CONFIG.tracking, ...o.tracking },
    attribution: { ...DEFAULT_TRACKING_CONFIG.attribution, ...o.attribution },
    referrer_rules: Array.isArray(o.referrer_rules)
      ? o.referrer_rules
      : DEFAULT_TRACKING_CONFIG.referrer_rules,
  }
}

export interface ClassifiedReferrer {
  referrerDomain: string | null
  trafficSource: string
}

export function classifyReferrer(
  referrerUrl: string | null,
  rules: ReferrerRule[] = DEFAULT_REFERRER_RULES
): ClassifiedReferrer {
  if (!referrerUrl) {
    return { referrerDomain: null, trafficSource: "Direct" }
  }

  let domain: string
  try {
    domain = new URL(referrerUrl).hostname.replace(/^www\./, "")
  } catch {
    return { referrerDomain: null, trafficSource: "Direct" }
  }

  const rule = rules.find((candidate) => domain.includes(candidate.domainIncludes))
  return { referrerDomain: domain, trafficSource: rule?.trafficSource ?? "Referral" }
}
