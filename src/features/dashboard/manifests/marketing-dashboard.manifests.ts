import { DASHBOARD_PACKAGE_IDS, DASHBOARD_WIDGET_STATES } from "../constants"
import type { WidgetManifest } from "../types"

function createMarketingManifest(
  widgetId: string,
  displayName: string,
  category: string,
  businessQuestion: string,
  fallbackVariant: "card" | "chart" | "table",
  fallbackHeight: number,
  responsiveBehavior: WidgetManifest["responsiveBehavior"]
): WidgetManifest {
  return {
    metadata: {
      widgetId,
      displayName,
      category,
      version: "1.0.0",
      owner: "dashboard-platform",
      businessQuestion,
    },
    permissions: ["dashboard:view"],
    featureFlags: [],
    dashboardAvailability: [DASHBOARD_PACKAGE_IDS.marketing],
    contracts: {
      readModel: `dashboard.${widgetId}`,
      propsContract: "none",
      stateContract: [...DASHBOARD_WIDGET_STATES],
    },
    loadingStrategy: {
      strategy: "lazy",
      suspense: true,
      fallbackVariant,
      fallbackHeight,
    },
    refreshStrategy: {
      strategy: "event-driven",
      triggers: ["manual", "workspace-change", "route-enter", "query-invalidation"],
    },
    sizing: {
      defaultSize: {
        width: responsiveBehavior.desktop ?? responsiveBehavior.tablet ?? responsiveBehavior.mobile,
        height: fallbackHeight,
      },
    },
    responsiveBehavior,
  }
}

export const welcomeBannerManifest = createMarketingManifest(
  "welcome-banner",
  "Welcome Banner",
  "hero",
  "What high-level growth story should the user see first?",
  "card",
  280,
  { mobile: 12, desktop: 6 }
)

export const revenueChartManifest = createMarketingManifest(
  "revenue-chart",
  "Revenue Chart",
  "executive",
  "How is revenue trending at a glance?",
  "chart",
  220,
  { mobile: 12, tablet: 6, desktop: 3 }
)

export const visitorsChartManifest = createMarketingManifest(
  "visitors-chart",
  "Visitors Chart",
  "executive",
  "How is visitor volume trending?",
  "chart",
  220,
  { mobile: 12, tablet: 6, desktop: 3 }
)

export const activityInsightsManifest = createMarketingManifest(
  "activity-insights",
  "Activity Insights",
  "analytics",
  "Which operational insights need attention?",
  "card",
  300,
  { mobile: 12, desktop: 6 }
)

export const websiteAnalyticsManifest = createMarketingManifest(
  "website-analytics",
  "Website Analytics",
  "analytics",
  "How is website performance distributed?",
  "chart",
  300,
  { mobile: 12, desktop: 6 }
)

export const transactionsManifest = createMarketingManifest(
  "transactions-card",
  "Transactions Card",
  "diagnostics",
  "What transaction summary needs review?",
  "card",
  250,
  { mobile: 12, tablet: 6, tabletBreakpoint: "lg", desktop: 4 }
)

export const completionRateManifest = createMarketingManifest(
  "completion-rate",
  "Completion Rate",
  "diagnostics",
  "How complete are the tracked flows?",
  "chart",
  250,
  { mobile: 12, tablet: 6, tabletBreakpoint: "lg", desktop: 4 }
)

export const browserStatsManifest = createMarketingManifest(
  "browser-stats",
  "Browser Stats",
  "diagnostics",
  "Which browser channels dominate?",
  "chart",
  250,
  { mobile: 12, desktop: 4 }
)

export const trafficTableManifest = createMarketingManifest(
  "traffic-table",
  "Traffic Table",
  "operations",
  "Which traffic sources and sessions need inspection?",
  "table",
  380,
  { mobile: 12, desktop: 8 }
)

export const socialStatsManifest = createMarketingManifest(
  "social-stats",
  "Social Stats",
  "footer",
  "How are social channels performing comparatively?",
  "card",
  280,
  { mobile: 12, desktop: 4 }
)

export const marketingDashboardManifests = [
  welcomeBannerManifest,
  revenueChartManifest,
  visitorsChartManifest,
  activityInsightsManifest,
  websiteAnalyticsManifest,
  transactionsManifest,
  completionRateManifest,
  browserStatsManifest,
  trafficTableManifest,
  socialStatsManifest,
] as const
