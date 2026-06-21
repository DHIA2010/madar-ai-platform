import { lazy } from "react"

import { DASHBOARD_PACKAGE_IDS } from "../constants"
import {
  activityInsightsManifest,
  browserStatsManifest,
  completionRateManifest,
  revenueChartManifest,
  socialStatsManifest,
  trafficTableManifest,
  transactionsManifest,
  visitorsChartManifest,
  websiteAnalyticsManifest,
  welcomeBannerManifest,
} from "../manifests"
import type { WidgetRegistryEntry } from "../types"

function createWidgetEntry(
  manifest: WidgetRegistryEntry["manifest"],
  loader: WidgetRegistryEntry["loader"]
): WidgetRegistryEntry {
  return {
    widgetId: manifest.metadata.widgetId,
    displayName: manifest.metadata.displayName,
    category: manifest.metadata.category,
    version: manifest.metadata.version,
    owner: manifest.metadata.owner,
    businessQuestion: manifest.metadata.businessQuestion,
    supportedPackages: [DASHBOARD_PACKAGE_IDS.marketing],
    permissions: manifest.permissions,
    featureFlags: manifest.featureFlags,
    supportedBreakpoints: ["mobile", "tablet", "desktop"],
    defaultSize: manifest.sizing.defaultSize,
    refreshPolicy: manifest.refreshStrategy,
    loadingPolicy: manifest.loadingStrategy,
    lifecycle: {
      mount: "route-enter",
      dispose: "route-leave",
    },
    dependencies: [],
    readModel: manifest.contracts.readModel,
    renderer: lazy(loader),
    loader,
    manifest,
  }
}

export const marketingDashboardWidgets = [
  createWidgetEntry(
    welcomeBannerManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/welcome-banner-card")
  ),
  createWidgetEntry(
    revenueChartManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/revenue-chart-card")
  ),
  createWidgetEntry(
    visitorsChartManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/visitors-chart-card")
  ),
  createWidgetEntry(
    activityInsightsManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/activity-insights")
  ),
  createWidgetEntry(
    websiteAnalyticsManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/WebsiteAnalytics")
  ),
  createWidgetEntry(
    transactionsManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/transactions-card")
  ),
  createWidgetEntry(
    completionRateManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/CompletionRate")
  ),
  createWidgetEntry(
    browserStatsManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/BrowserStats")
  ),
  createWidgetEntry(
    trafficTableManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/TrafficTable")
  ),
  createWidgetEntry(
    socialStatsManifest,
    () => import("@/app/(layout-pages)/dashboard/analytics/SocialStatsCard")
  ),
] as const
