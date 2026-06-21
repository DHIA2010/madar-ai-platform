import { describe, expect, it } from "vitest"

import { generateDashboardLayout, resolveDashboardPackage } from "../engine"

describe("generateDashboardLayout", () => {
  it("orders widgets by slot and emits responsive class names", () => {
    const dashboardPackage = resolveDashboardPackage({
      workspaceId: "ws_northstar_marketing",
      permissions: ["dashboard:view"],
      featureFlags: {},
      role: "Admin",
    })

    const layout = generateDashboardLayout(dashboardPackage)

    expect(layout[0]?.widgetId).toBe("welcome-banner")
    expect(layout[0]?.className).toContain("xl:col-span-6")
    expect(layout.find((item) => item.widgetId === "traffic-table")?.className).toContain("flex")
  })
})
