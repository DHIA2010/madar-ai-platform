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
