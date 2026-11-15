// What the campaigns page shows as a campaign's (ad set's, ad's) status.
//
// Every ad platform keeps two things: the on/off switch the advertiser sets, and whether the
// thing is actually able to run -- in review, rejected, out of budget, held back by a paused
// parent. Showing only the switch calls a campaign "active" while its ads are still in review.
// So for anything switched ON, the platform's own delivery state is turned into one of the
// shared words below; anything switched off (paused, removed) keeps its plain status.

export type DeliveryStatus =
  | "under_review"
  | "rejected"
  | "limited"
  | "learning"
  | "pending"
  | "ended"
  | "not_eligible"
  | "misconfigured"
  | "not_delivering"

// ---- Google Ads: campaign/ad primary status, stored by the sync as `servingStatus` ----

const GOOGLE_SERVING_STATUS: Record<string, DeliveryStatus> = {
  UNDER_REVIEW: "under_review",
  LIMITED: "limited",
  LEARNING: "learning",
  NOT_ELIGIBLE: "not_eligible",
  MISCONFIGURED: "misconfigured",
  PENDING: "pending",
  ENDED: "ended",
}

export function googleDisplayStatus(
  status: string,
  servingStatus: string | null | undefined
): string {
  if (status.toUpperCase() !== "ENABLED" || !servingStatus) return status
  return GOOGLE_SERVING_STATUS[servingStatus] ?? status
}

// ---- Meta: `effective_status` next to the configured `status` ----

const META_EFFECTIVE_STATUS: Record<string, DeliveryStatus> = {
  PENDING_REVIEW: "under_review",
  IN_PROCESS: "under_review",
  PREAPPROVED: "pending",
  DISAPPROVED: "rejected",
  WITH_ISSUES: "not_eligible",
  PENDING_BILLING_INFO: "misconfigured",
  // Switched on itself, but its campaign or ad set is paused.
  CAMPAIGN_PAUSED: "not_delivering",
  ADSET_PAUSED: "not_delivering",
}

export function metaDisplayStatus(payload: Record<string, unknown>): string {
  const status = String(payload.status ?? "UNKNOWN")
  if (status.toUpperCase() !== "ACTIVE") return status
  return META_EFFECTIVE_STATUS[String(payload.effective_status ?? "")] ?? status
}

// ---- TikTok: `secondary_status` (CAMPAIGN_STATUS_*, ADGROUP_STATUS_*, AD_STATUS_*) next to
// `operation_status` ----

export function tiktokDisplayStatus(payload: Record<string, unknown>): string {
  const status = String(payload.operation_status ?? "UNKNOWN")
  if (status.toUpperCase() !== "ENABLE") return status
  const secondary = String(payload.secondary_status ?? "").toUpperCase()
  if (!secondary) return status
  // Order matters: a denied review also contains "AUDIT".
  if (secondary.includes("DENY") || secondary.includes("REJECT")) return "rejected"
  if (secondary.includes("AUDIT") || secondary.includes("REVIEW")) return "under_review"
  if (secondary.includes("BUDGET_EXCEED") || secondary.includes("BALANCE_EXCEED")) return "limited"
  if (secondary.includes("NOT_START")) return "pending"
  if (secondary.includes("TIME_DONE") || secondary.endsWith("_DONE")) return "ended"
  if (secondary.includes("DELIVERY_OK") || secondary.endsWith("_STATUS_ENABLE")) return status
  // Its campaign or ad group is off, or it has nothing to deliver.
  if (secondary.includes("DISABLE") || secondary.includes("NOT_DELIVER")) return "not_delivering"
  return status
}

// ---- Snapchat: `delivery_status` (a list of reasons) and, on ads, `review_status` ----

export function snapchatDisplayStatus(payload: Record<string, unknown>): string {
  const status = String(payload.status ?? "UNKNOWN")
  if (status.toUpperCase() !== "ACTIVE") return status
  const review = String(payload.review_status ?? "").toUpperCase()
  if (review === "PENDING") return "under_review"
  if (review === "REJECTED") return "rejected"

  const delivery = Array.isArray(payload.delivery_status)
    ? payload.delivery_status.map((entry) => String(entry).toUpperCase())
    : []
  if (delivery.length === 0) return status
  const has = (pattern: RegExp) => delivery.some((entry) => pattern.test(entry))
  if (has(/REJECT/)) return "rejected"
  if (has(/REVIEW/)) return "under_review"
  if (delivery.includes("VALID")) return has(/LEARNING/) ? "learning" : status
  if (has(/BUDGET|SPEND_CAP|BALANCE/)) return "limited"
  if (has(/NOT_STARTED|START_TIME/)) return "pending"
  if (has(/ENDED|END_TIME|EXPIRED/)) return "ended"
  // Switched on, but something above or below it isn't (a paused campaign, no active ad squad).
  return "not_delivering"
}
