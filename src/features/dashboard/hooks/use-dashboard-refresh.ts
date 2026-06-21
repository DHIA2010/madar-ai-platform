"use client"

import { useDashboard } from "./use-dashboard"

export function useDashboardRefresh() {
  const { lastRefreshReason, refreshVersion, requestRefresh } = useDashboard()

  return {
    lastRefreshReason,
    refreshVersion,
    requestRefresh,
  }
}
