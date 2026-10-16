"use client"

import { useTranslations } from "next-intl"

import { AppEmpty, AppLoading } from "@/components/app"

import { useCampaignDetails } from "../hooks"
import { CampaignForm } from "./campaign-form"

export function CampaignEditScreen({ campaignId }: { campaignId: string }) {
  const t = useTranslations("campaigns.editScreen")
  const campaignDetailsQuery = useCampaignDetails(campaignId)

  if (campaignDetailsQuery.isLoading) {
    return <AppLoading variant="page" />
  }

  const details = campaignDetailsQuery.data

  if (!details) {
    return <AppEmpty title={t("notFoundTitle")} description={t("notFoundDescription")} />
  }

  return <CampaignForm mode="edit" campaignId={campaignId} initialDetails={details} />
}
