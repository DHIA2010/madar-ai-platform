import type { WidgetLazyComponent, WidgetRegistryEntry } from "../types"

const widgetComponentCache = new Map<string, WidgetLazyComponent>()

export function loadWidgetComponent(entry: WidgetRegistryEntry): WidgetLazyComponent {
  const existing = widgetComponentCache.get(entry.widgetId)
  if (existing) {
    return existing
  }

  const component = entry.renderer
  widgetComponentCache.set(entry.widgetId, component)
  return component
}

export async function preloadWidgetComponent(entry: WidgetRegistryEntry) {
  return entry.loader()
}
