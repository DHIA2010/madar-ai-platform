import type { WidgetManifest, WidgetRegistryEntry } from "../types"
import { marketingDashboardWidgets } from "../widgets"

export function createWidgetRegistry(entries: readonly WidgetRegistryEntry[]) {
  return entries.reduce<Record<string, WidgetRegistryEntry>>((registry, entry) => {
    registry[entry.widgetId] = entry
    return registry
  }, {})
}

export const dashboardWidgetRegistry = createWidgetRegistry(marketingDashboardWidgets)

export function getWidgetRegistryEntry(widgetId: string) {
  return dashboardWidgetRegistry[widgetId] ?? null
}

export function getWidgetManifest(widgetId: string): WidgetManifest | null {
  return getWidgetRegistryEntry(widgetId)?.manifest ?? null
}
