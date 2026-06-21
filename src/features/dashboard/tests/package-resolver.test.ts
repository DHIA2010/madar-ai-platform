import { describe, expect, it } from "vitest"

import { DASHBOARD_PACKAGE_IDS } from "../constants"
import { resolveDashboardPackage } from "../engine"

describe("resolveDashboardPackage", () => {
  it("selects the marketing package for dashboard users", () => {
    const dashboardPackage = resolveDashboardPackage({
      workspaceId: "ws_northstar_marketing",
      permissions: ["dashboard:view"],
      featureFlags: {},
      role: "Admin",
    })

    expect(dashboardPackage.id).toBe(DASHBOARD_PACKAGE_IDS.marketing)
    expect(dashboardPackage.widgets).toContain("welcome-banner")
  })
})
