"use client"

import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { useApplicationServices } from "@/application"

export function useCampaignDetails(campaignId: string) {
  const { campaignApplicationService } = useApplicationServices()

  return useQuery({
    queryKey: ["campaigns", "details", campaignId],
    queryFn: async () => {
      try {
        return await campaignApplicationService.getCampaignDetails(campaignId)
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: Boolean(campaignId),
  })
}
