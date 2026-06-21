"use client"

import { useDashboard } from "./use-dashboard"

export function useWidgetRegistry() {
  return useDashboard().registry
}
