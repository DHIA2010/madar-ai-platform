import { DASHBOARD_PACKAGE_IDS } from "../constants"
import type { DashboardPackage, DashboardPackageResolverInput } from "../types"

const marketingDashboardPackage: DashboardPackage = {
  id: DASHBOARD_PACKAGE_IDS.marketing,
  persona: "marketing-operator",
  widgets: [
    "welcome-banner",
    "revenue-chart",
    "visitors-chart",
    "activity-insights",
    "website-analytics",
    "transactions-card",
    "completion-rate",
    "browser-stats",
    "traffic-table",
    "social-stats",
  ],
  layout: [
    {
      widgetId: "welcome-banner",
      zone: "hero",
      order: 0,
      responsive: { mobile: 12, desktop: 6 },
    },
    {
      widgetId: "revenue-chart",
      zone: "executive",
      order: 0,
      responsive: { mobile: 12, tablet: 6, desktop: 3 },
    },
    {
      widgetId: "visitors-chart",
      zone: "executive",
      order: 1,
      responsive: { mobile: 12, tablet: 6, desktop: 3 },
    },
    {
      widgetId: "activity-insights",
      zone: "analytics",
      order: 0,
      responsive: { mobile: 12, desktop: 6 },
    },
    {
      widgetId: "website-analytics",
      zone: "analytics",
      order: 1,
      responsive: { mobile: 12, desktop: 6 },
    },
    {
      widgetId: "transactions-card",
      zone: "diagnostics",
      order: 0,
      responsive: {
        mobile: 12,
        tablet: 6,
        tabletBreakpoint: "lg",
        desktop: 4,
        utilityClassName: "flex",
      },
    },
    {
      widgetId: "completion-rate",
      zone: "diagnostics",
      order: 1,
      responsive: {
        mobile: 12,
        tablet: 6,
        tabletBreakpoint: "lg",
        desktop: 4,
        utilityClassName: "flex",
      },
    },
    {
      widgetId: "browser-stats",
      zone: "diagnostics",
      order: 2,
      responsive: { mobile: 12, desktop: 4, utilityClassName: "flex" },
    },
    {
      widgetId: "traffic-table",
      zone: "operations",
      order: 0,
      responsive: { mobile: 12, desktop: 8, utilityClassName: "flex" },
    },
    {
      widgetId: "social-stats",
      zone: "footer",
      order: 0,
      responsive: { mobile: 12, desktop: 4, utilityClassName: "flex" },
    },
  ],
  permissions: ["dashboard:view"],
  featureFlags: [],
  themePreset: "dark-blue",
  defaultFilters: {},
  version: "1.0.0",
}

export function resolveDashboardPackage({
  permissions,
}: DashboardPackageResolverInput): DashboardPackage {
  if (!permissions.includes("dashboard:view")) {
    return marketingDashboardPackage
  }

  return marketingDashboardPackage
}
