"use client"

import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import type { AIIntelligenceInput } from "../types"

import { useApplicationServices } from "@/application"

export function useAIIntelligence(input: AIIntelligenceInput) {
  const { aiIntelligenceApplicationService } = useApplicationServices()

  return useQuery({
    queryKey: ["ai-intelligence", input],
    queryFn: async () => {
      try {
        return await aiIntelligenceApplicationService.getIntelligenceDashboard(input)
      } catch (error) {
        throw toAppError(error)
      }
    },
    placeholderData: (previous) => previous,
  })
}
