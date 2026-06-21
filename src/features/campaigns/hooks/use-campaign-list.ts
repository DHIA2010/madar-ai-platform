"use client"

import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import type { CampaignListQueryInput } from "../types"

import { useApplicationServices } from "@/application"

export function useCampaignList(input: CampaignListQueryInput) {
  const { campaignApplicationService } = useApplicationServices()

  return useQuery({
    queryKey: ["campaigns", "list", input],
    queryFn: async () => {
      try {
        return await campaignApplicationService.getCampaignList(input)
      } catch (error) {
        throw toAppError(error)
      }
    },
    placeholderData: (previous) => previous,
  })
}
