"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import type { CampaignCreatePayload, CampaignUpdatePayload } from "../types"

import { useApplicationServices } from "@/application"

export function useCampaignMutations() {
  const queryClient = useQueryClient()
  const { campaignApplicationService } = useApplicationServices()

  const createCampaign = useMutation({
    mutationKey: ["campaigns", "create"],
    mutationFn: async (payload: CampaignCreatePayload) => {
      try {
        return await campaignApplicationService.createCampaign(payload)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns", "list"] })
    },
  })

  const updateCampaign = useMutation({
    mutationKey: ["campaigns", "update"],
    mutationFn: async (input: { campaignId: string; payload: CampaignUpdatePayload }) => {
      try {
        return await campaignApplicationService.updateCampaign(input.campaignId, input.payload)
      } catch (error) {
        throw toAppError(error)
      }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaigns", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["campaigns", "details", result.payload.id] }),
      ])
    },
  })

  return {
    createCampaign,
    updateCampaign,
  }
}
