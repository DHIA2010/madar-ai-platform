"use client"

import { useQuery } from "@tanstack/react-query"

import { aiChatService } from "../services"

// The recommendations tab's data, fetched only while that tab is open.
export function useAiRecommendations(days: number, enabled: boolean) {
  return useQuery({
    queryKey: ["ai-recommendations", days],
    queryFn: () => aiChatService.getRecommendations(days),
    enabled,
    staleTime: 60_000,
  })
}
