import { describe, expect, it } from "vitest"

import {
  createMockAuthenticationGateway,
  createMockDashboardGateway,
  createMockFeatureFlagGateway,
  createMockWorkspaceGateway,
  createSessionManager,
} from "@/infrastructure"

import {
  AuthenticationApplicationService,
  DashboardApplicationService,
  WorkspaceApplicationService,
} from "../services"

describe("application services", () => {
  it("resolves the dashboard bundle through the application service", async () => {
    const service = new DashboardApplicationService(
      createMockDashboardGateway(),
      createMockFeatureFlagGateway()
    )
    const bundle = await service.getDashboard({
      workspaceId: "ws_northstar_marketing",
      permissions: ["dashboard:view"],
      featureFlags: {},
      role: "Admin",
    })

    expect(bundle.dashboardPackage.id).toBe("marketing-dashboard")
    expect(bundle.readModels["welcome-banner"]?.payload.widgetId).toBe("welcome-banner")
  })

  it("restores authentication through the application service", async () => {
    const gateway = createMockAuthenticationGateway()
    const sessionStorage = createSessionManager()
    const loginResponse = await gateway.login({
      email: "demo@madar.ai",
      password: "password123",
    })
    sessionStorage.persist(loginResponse.session)

    const service = new AuthenticationApplicationService(gateway, sessionStorage)
    const restored = await service.restoreSession()

    expect(restored?.user.email).toBe("demo@madar.ai")
  })

  it("resolves workspace context through the application service", async () => {
    const service = new WorkspaceApplicationService(createMockWorkspaceGateway())
    const context = await service.resolveWorkspaceContext({
      organizationId: null,
      workspaceId: null,
    })

    expect(context.availableOrganizations.length).toBeGreaterThan(0)
    expect(context.availableWorkspaces.length).toBeGreaterThan(0)
  })
})
