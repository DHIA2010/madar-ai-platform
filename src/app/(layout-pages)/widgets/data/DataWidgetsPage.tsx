"use client"

import React, { Suspense, lazy } from "react"

// Clean default-based lazy imports
const TicketSupport = lazy(() => import("./TicketSupport"))
const AreaStatsCard = lazy(() => import("./AreaStatsCard"))
const DeviceViewStatusCard = lazy(() => import("./DeviceViewStatusCard"))
const NewCustomersCard = lazy(() => import("./NewCustomersCard"))
const NewVsOldVisitors = lazy(() => import("./NewVsOldVisitors"))
const ProgressStatCard = lazy(() => import("./ProgressStatCard"))
const TotalSessionsCard = lazy(() => import("./TotalSessionsCard"))
const TopTrafficChannelsCard = lazy(() => import("./TopTrafficChannelsCard"))
const VisitorsSalesCard = lazy(() => import("./VisitorsSalesCard"))
const VisitorsSalesStackedCard = lazy(() => import("./VisitorsSalesStackedCard"))
const WebsiteVisitorsCard = lazy(() => import("./WebsiteVisitorsCard"))
const RadialStatCard = lazy(() => import("./RadialStatCard"))

// Skeleton
function CardSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-muted animate-pulse"
      style={{ height }}
    />
  )
}

export default function DataWidgetsPage() {
  return (
    <div className="data-widgets-page">

      {/* Top Grid */}
      <div className="grid grid-cols-12 gap-6">

        <div className="col-span-12 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <TopTrafficChannelsCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <NewVsOldVisitors />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <TicketSupport />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-6">
          <Suspense fallback={<CardSkeleton height={180} />}>
            <DeviceViewStatusCard />
          </Suspense>

          <Suspense fallback={<CardSkeleton height={140} />}>
            <ProgressStatCard
              title="Total sessions"
              value="789"
              progress={68}
              badgeText="12% remaining"
              variant="info"
            />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-8">
          <Suspense fallback={<CardSkeleton height={320} />}>
            <VisitorsSalesCard />
          </Suspense>
        </div>

        <div className="col-span-12">
          <Suspense fallback={<CardSkeleton height={350} />}>
            <VisitorsSalesStackedCard />
          </Suspense>
        </div>

      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 mt-6">

        <Suspense fallback={<CardSkeleton height={180} />}>
          <WebsiteVisitorsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={180} />}>
          <NewCustomersCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={180} />}>
          <TotalSessionsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={180} />}>
          <AreaStatsCard />
        </Suspense>

      </div>

      {/* Radial Stats */}
      <div className="grid gap-6 md:grid-cols-2 mt-6">

        <Suspense fallback={<CardSkeleton height={220} />}>
          <RadialStatCard
            title="Revenue Target"
            value={72}
            label="Achieved"
            color="#6366f1"
          />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={220} />}>
          <RadialStatCard
            title="Goal Completion"
            value={86}
            label="Completed"
            color="#22c55e"
          />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={220} />}>
          <RadialStatCard
            title="Server Usage"
            value={64}
            label="Used"
            color="#f59e0b"
          />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={220} />}>
          <RadialStatCard
            title="Growth Rate"
            value={41}
            label="This Month"
            color="#0ea5e9"
          />
        </Suspense>

      </div>

    </div>
  )
}