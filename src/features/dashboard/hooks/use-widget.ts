"use client"

import { useMemo } from "react"

import type { WidgetViewModel } from "../types"
import { useDashboard } from "./use-dashboard"

export function useWidget(widgetId: string): WidgetViewModel {
  const { manifests, registry, layout, widgetStates, widgetReadModels, widgetReadModelViewModels } =
    useDashboard()

  return useMemo(
    () => ({
      manifest: manifests[widgetId],
      entry: registry[widgetId] ?? null,
      layoutItem: layout.find((item) => item.widgetId === widgetId) ?? null,
      state: widgetStates[widgetId] ?? null,
      readModel: widgetReadModels[widgetId] ?? null,
      readModelViewModel: widgetReadModelViewModels[widgetId] ?? null,
    }),
    [
      layout,
      manifests,
      registry,
      widgetId,
      widgetReadModels,
      widgetReadModelViewModels,
      widgetStates,
    ]
  )
}
