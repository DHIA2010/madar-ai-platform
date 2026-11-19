import type { useTranslations } from "next-intl"

type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

// How a platform's raw campaign status is shown: one label and colour per meaning, whatever
// word the platform itself uses for it.
const STATUS_PILL_KEYS: Record<string, { key: string; className: string }> = {
  active: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  enabled: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  paused: { key: "paused", className: "bg-[#fff7e6] text-[#e08b00]" },
  removed: { key: "removed", className: "bg-[#fdeeee] text-[#e0484d]" },
  ended: { key: "ended", className: "bg-[#eef2f8] text-[#5b6b85]" },
  // TikTok's on/off words.
  enable: { key: "active", className: "bg-[#e9f8ef] text-[#1f9d55]" },
  disable: { key: "paused", className: "bg-[#fff7e6] text-[#e08b00]" },
  // What the platform says about something that is switched on but not simply running (see the
  // backend's campaigns/delivery-status.ts).
  rejected: { key: "rejected", className: "bg-[#fdeeee] text-[#e0484d]" },
  not_delivering: { key: "notDelivering", className: "bg-[#eef2f8] text-[#5b6b85]" },
  under_review: { key: "underReview", className: "bg-[#eaf2ff] text-[#2563eb]" },
  learning: { key: "learning", className: "bg-[#eaf2ff] text-[#2563eb]" },
  limited: { key: "limited", className: "bg-[#fff7e6] text-[#e08b00]" },
  pending: { key: "pending", className: "bg-[#eef2f8] text-[#5b6b85]" },
  not_eligible: { key: "notEligible", className: "bg-[#fdeeee] text-[#e0484d]" },
  misconfigured: { key: "misconfigured", className: "bg-[#fdeeee] text-[#e0484d]" },
}

export function campaignStatusPill(status: string, t: CampaignsTranslator) {
  const entry = STATUS_PILL_KEYS[status.toLowerCase()]
  if (!entry) {
    return { label: status, className: "bg-[#eef2f8] text-[#5b6b85]" }
  }
  return {
    label: t(`dashboardScreen.statusPill.${entry.key}` as "dashboardScreen.statusPill.active"),
    className: entry.className,
  }
}

// The three groups the list filters by: running in some form, switched off, or anything else
// (ended, removed, rejected, not delivering).
export function campaignStatusBucket(status: string): "active" | "paused" | "other" {
  const key = STATUS_PILL_KEYS[status.toLowerCase()]?.key
  if (key === "active" || key === "learning" || key === "limited") return "active"
  if (key === "paused") return "paused"
  return "other"
}
