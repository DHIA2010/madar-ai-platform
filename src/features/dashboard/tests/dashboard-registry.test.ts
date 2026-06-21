import { describe, expect, it } from "vitest"

import { dashboardWidgetRegistry, getWidgetManifest, getWidgetRegistryEntry } from "../registry"

describe("dashboard widget registry", () => {
  it("returns registered widgets from the registry source of truth", () => {
    expect(Object.keys(dashboardWidgetRegistry)).toHaveLength(10)
    expect(getWidgetRegistryEntry("welcome-banner")?.displayName).toBe("Welcome Banner")
  })

  it("returns widget manifests from registry entries", () => {
    expect(getWidgetManifest("traffic-table")?.metadata.displayName).toBe("Traffic Table")
    expect(getWidgetRegistryEntry("unknown-widget")).toBeNull()
  })
})
