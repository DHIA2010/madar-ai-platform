import type { useTranslations } from "next-intl"

import type { AppStatusTone } from "@/components/app"

import type { CampaignStatus } from "../types"

const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; tone: AppStatusTone }> = {
  draft: { label: "مسودة", tone: "neutral" },
  scheduled: { label: "مجدولة", tone: "info" },
  active: { label: "نشطة", tone: "success" },
  paused: { label: "متوقفة", tone: "warning" },
  completed: { label: "مكتملة", tone: "success" },
  archived: { label: "مؤرشفة", tone: "neutral" },
}

export function getCampaignStatusMeta(status: CampaignStatus) {
  return CAMPAIGN_STATUS_META[status]
}

// Mirrors getCampaignStatusMeta's tones with a translated label -- the calling component owns the
// actual useTranslations() call (see plan-tiers.ts's translatedPlanTierMeta for the established
// pattern). getCampaignStatusMeta above stays Arabic-hardcoded and unchanged because
// campaign-details-view.tsx (a larger screen not yet migrated) still reads it directly.
type CampaignsTranslator = ReturnType<typeof useTranslations<"campaigns">>

export function translatedCampaignStatusMeta(
  status: CampaignStatus,
  t: CampaignsTranslator
): { label: string; tone: AppStatusTone } {
  return {
    label: t(`statusBadge.status.${status}`),
    tone: CAMPAIGN_STATUS_META[status].tone,
  }
}
