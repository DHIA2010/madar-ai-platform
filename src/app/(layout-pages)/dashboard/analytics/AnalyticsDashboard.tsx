"use client"

import React, { Suspense, lazy } from "react"

// Clean default-based lazy imports
const WelcomeBannerCard = lazy(() => import("./welcome-banner-card"))
const RevenueChartCard = lazy(() => import("./revenue-chart-card"))
const VisitorsChartCard = lazy(() => import("./visitors-chart-card"))
const ActivityInsights = lazy(() => import("./activity-insights"))
const WebsiteAnalytics = lazy(() => import("./WebsiteAnalytics"))
const TransactionsCard = lazy(() => import("./transactions-card"))
const CompletionRate = lazy(() => import("./CompletionRate"))
const BrowserStats = lazy(() => import("./BrowserStats"))
const TrafficTable = lazy(() => import("./TrafficTable"))
const SocialStatsCard = lazy(() => import("./SocialStatsCard"))

// Skeleton fallback
function CardSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-muted animate-pulse"
      style={{ height }}
    />
  )
}

export default function AnalyticsDashboard() {
  return (
    <div className="dashboard-analytics">
      <div className="grid grid-cols-12 gap-6">

        <div className="col-span-12 xl:col-span-6">
          <Suspense fallback={<CardSkeleton height={280} />}>
            <WelcomeBannerCard />
          </Suspense>
        </div>

        <div className="col-span-12 md:col-span-6 xl:col-span-3">
          <Suspense fallback={<CardSkeleton height={220} />}>
            <RevenueChartCard />
          </Suspense>
        </div>

        <div className="col-span-12 md:col-span-6 xl:col-span-3">
          <Suspense fallback={<CardSkeleton height={220} />}>
            <VisitorsChartCard />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <ActivityInsights />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <WebsiteAnalytics />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4 flex">
          <Suspense fallback={<CardSkeleton height={250} />}>
            <TransactionsCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4 flex">
          <Suspense fallback={<CardSkeleton height={250} />}>
            <CompletionRate />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4 flex">
          <Suspense fallback={<CardSkeleton height={250} />}>
            <BrowserStats />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-8 flex">
          <Suspense fallback={<CardSkeleton height={380} />}>
            <TrafficTable />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4 flex">
          <Suspense fallback={<CardSkeleton height={280} />}>
            <SocialStatsCard />
          </Suspense>
        </div>

      </div>
    </div>
  )
}