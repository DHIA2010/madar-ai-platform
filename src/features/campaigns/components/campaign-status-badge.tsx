import { AppStatusBadge } from "@/components/app"

import { getCampaignStatusMeta } from "../services"
import type { CampaignStatus } from "../types"

export interface CampaignStatusBadgeProps {
  status: CampaignStatus
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const meta = getCampaignStatusMeta(status)

  return <AppStatusBadge status={meta.tone} label={meta.label} />
}
