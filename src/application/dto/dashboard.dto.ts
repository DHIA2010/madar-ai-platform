import type { DashboardPackageDto, DashboardWidgetReadModelPayload } from "../contracts"

export const marketingDashboardPackageDto: DashboardPackageDto = {
  id: "marketing-dashboard",
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
    { widgetId: "welcome-banner", zone: "hero", order: 0, responsive: { mobile: 12, desktop: 6 } },
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

export const dashboardWidgetPayloadDtos: Record<string, DashboardWidgetReadModelPayload> = {
  "welcome-banner": {
    widgetId: "welcome-banner",
    title: "Executive Dashboard",
    summary: "High-level growth story for the current workspace.",
  },
  "revenue-chart": {
    widgetId: "revenue-chart",
    title: "Revenue Trend",
    summary: "Mock revenue trend payload.",
    dataPoints: [
      { month: "Jan", value: 145 },
      { month: "Feb", value: 278 },
    ],
  },
  "visitors-chart": {
    widgetId: "visitors-chart",
    title: "Visitor Trend",
    summary: "Mock visitor trend payload.",
    dataPoints: [
      { month: "Jan", value: 163 },
      { month: "Feb", value: 305 },
    ],
  },
  "activity-insights": {
    widgetId: "activity-insights",
    title: "Activity Insights",
    summary: "Mock activity insights payload.",
  },
  "website-analytics": {
    widgetId: "website-analytics",
    title: "Website Analytics",
    summary: "Mock website analytics payload.",
  },
  "transactions-card": {
    widgetId: "transactions-card",
    title: "Transactions",
    summary: "Mock transactions payload.",
  },
  "completion-rate": {
    widgetId: "completion-rate",
    title: "Completion Rate",
    summary: "Mock completion rate payload.",
  },
  "browser-stats": {
    widgetId: "browser-stats",
    title: "Browser Stats",
    summary: "Mock browser stats payload.",
  },
  "traffic-table": {
    widgetId: "traffic-table",
    title: "Traffic Table",
    summary: "Mock traffic table payload.",
  },
  "social-stats": {
    widgetId: "social-stats",
    title: "Social Performance",
    summary: "Mock social performance payload.",
  },
}
