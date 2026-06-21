"use client"

import { AppEmpty, AppLoading } from "@/components/app"

import { useCampaignDetails } from "../hooks"
import { CampaignForm } from "./campaign-form"

export function CampaignEditScreen({ campaignId }: { campaignId: string }) {
  const campaignDetailsQuery = useCampaignDetails(campaignId)

  if (campaignDetailsQuery.isLoading) {
    return <AppLoading variant="page" />
  }

  const details = campaignDetailsQuery.data

  if (!details) {
    return <AppEmpty title="Campaign not found" description="Unable to edit a missing campaign." />
  }

  return <CampaignForm mode="edit" campaignId={campaignId} initialDetails={details} />
}
