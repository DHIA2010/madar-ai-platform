import { describe, expect, it } from "vitest"

import { createMockDashboardGateway, createMockWorkspaceGateway } from "@/infrastructure"

import {
  GetDashboardUseCase,
  LoadWidgetReadModelUseCase,
  ResolveWorkspaceContextUseCase,
} from "../use-cases"

describe("application use cases", () => {
  it("gets a dashboard bundle through a named use case", async () => {
    const useCase = new GetDashboardUseCase(createMockDashboardGateway())
    const bundle = await useCase.execute({
      workspaceId: "ws_northstar_marketing",
      permissions: ["dashboard:view"],
      featureFlags: {},
      role: "Admin",
    })

    expect(bundle.dashboardPackage.widgets).toContain("welcome-banner")
  })

  it("loads an individual widget read model", async () => {
    const useCase = new LoadWidgetReadModelUseCase(createMockDashboardGateway())
    const readModel = await useCase.execute("revenue-chart")

    expect(readModel.payload.title).toBe("إجمالي الإيرادات")
  })

  it("resolves workspace context from the use case", async () => {
    const useCase = new ResolveWorkspaceContextUseCase(createMockWorkspaceGateway())
    const result = await useCase.execute({ organizationId: null, workspaceId: null })

    expect(result.availableOrganizations.length).toBeGreaterThan(0)
  })
})
