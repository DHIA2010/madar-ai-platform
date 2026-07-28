import type { DashboardPackageResolverInput, DashboardService } from "../types"

const marketingDashboardPackage = {
  id: "marketing-dashboard",
  persona: "marketing",
  widgets: ["campaign-performance", "traffic-overview", "budget-alerts"],
  layout: [
    {
      widgetId: "campaign-performance",
      zone: "executive" as const,
      order: 0,
      responsive: {
        mobile: 12,
        tablet: 8,
        desktop: 6,
      },
    },
    {
      widgetId: "traffic-overview",
      zone: "analytics" as const,
      order: 1,
      responsive: {
        mobile: 12,
        tablet: 12,
        desktop: 6,
      },
    },
    {
      widgetId: "budget-alerts",
      zone: "operations" as const,
      order: 2,
      responsive: {
        mobile: 12,
        tablet: 12,
        desktop: 12,
      },
    },
  ],
  permissions: ["dashboard:view"],
  featureFlags: ["dashboard.beta"],
  themePreset: "marketing",
  defaultFilters: {
    dateRange: "30d",
  },
  version: "1.0.0",
}

export class MockDashboardService implements DashboardService {
  async resolvePackage(input: DashboardPackageResolverInput) {
    void input
    return marketingDashboardPackage
  }
}

export function createMockDashboardService(): DashboardService {
  return new MockDashboardService()
}
