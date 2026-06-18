"use client"

import React, { Suspense, lazy } from "react"

// Clean default-based lazy imports
const WebsiteVisitorsCard = lazy(() =>
  import("../../widgets/data/WebsiteVisitorsCard")
)

const NewCustomersCard = lazy(() =>
  import("../..//widgets/data/NewCustomersCard")
)

const TotalSessionsCard = lazy(() =>
  import("../..//widgets/data/TotalSessionsCard")
)

const AreaStatsCard = lazy(() =>
  import("../..//widgets/data/AreaStatsCard")
)

const VisitorsSalesStackedCard = lazy(() =>
  import("../..//widgets/data/VisitorsSalesStackedCard")
)

const TopTrafficChannelsCard = lazy(() =>
  import("../..//widgets/data/TopTrafficChannelsCard")
)

const NewVsOldVisitors = lazy(() =>
  import("../..//widgets/data/NewVsOldVisitors")
)

const TicketSupport = lazy(() =>
  import("../..//widgets/data/TicketSupport")
)

const TrafficTable = lazy(() =>
  import("../..//dashboard/analytics/TrafficTable")
)

// Skeleton
function CardSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-muted animate-pulse"
      style={{ height }}
    />
  )
}

export default function CrmDashboard() {
  return (
    <div className="space-y-6 crm-dashboard-wrapper">

      {/* Top Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">

        <Suspense fallback={<CardSkeleton height={160} />}>
          <WebsiteVisitorsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <NewCustomersCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <TotalSessionsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <AreaStatsCard />
        </Suspense>

      </div>

      {/* Large Chart */}
      <Suspense fallback={<CardSkeleton height={350} />}>
        <VisitorsSalesStackedCard />
      </Suspense>

      {/* Mid Section */}
      <div className="grid grid-cols-12 gap-6">

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={280} />}>
            <NewVsOldVisitors />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={280} />}>
            <TicketSupport />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={280} />}>
            <TopTrafficChannelsCard />
          </Suspense>
        </div>

      </div>

      {/* Table */}
      <Suspense fallback={<CardSkeleton height={400} />}>
        <TrafficTable />
      </Suspense>

    </div>
  )
}