import { describe, expect, it } from "vitest"

import { loadWidgetComponent, preloadWidgetComponent } from "../engine"
import { getWidgetRegistryEntry } from "../registry"

describe("widget loader", () => {
  it("preloads registered widget modules", async () => {
    const entry = getWidgetRegistryEntry("welcome-banner")
    expect(entry).not.toBeNull()

    const widgetModule = await preloadWidgetComponent(entry!)
    expect(widgetModule.default).toBeTypeOf("function")
  })

  it("caches lazy widget components", () => {
    const entry = getWidgetRegistryEntry("welcome-banner")!
    expect(loadWidgetComponent(entry)).toBe(loadWidgetComponent(entry))
  })
})
