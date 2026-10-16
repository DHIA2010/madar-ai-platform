"use client"

import { useTranslations } from "next-intl"

import { AppStatusBadge } from "@/components/app"

import { translatedCampaignStatusMeta } from "../services"
import type { CampaignStatus } from "../types"

export interface CampaignStatusBadgeProps {
  status: CampaignStatus
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const t = useTranslations("campaigns")
  const meta = translatedCampaignStatusMeta(status, t)

  return <AppStatusBadge status={meta.tone} label={meta.label} />
}
