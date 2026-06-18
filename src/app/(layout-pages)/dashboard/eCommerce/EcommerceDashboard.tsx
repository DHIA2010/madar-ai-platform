"use client"

import React, { Suspense, lazy } from "react"

// Clean default-based lazy imports
const TottalOrdersCard = lazy(() => import("./TotalOrdersCard"))
const TotalRevenueCard = lazy(() => import("./TotalRevenueCard"))
const VisitorsCard = lazy(() => import("./VisitorsCard"))
const ConversionRateCard = lazy(() => import("./ConversionRateCard"))
const SalesAnalysisCard = lazy(() => import("./SalesAnalysisCard"))
const RecentOrdersCard = lazy(() => import("./RecentOrdersCard"))
const SalesByCountriesCard = lazy(() => import("./SalesByCountriesCard"))
const OrderStatus = lazy(() => import("./OrderStatus"))
const RecentOrdersTable = lazy(() => import("./RecentOrdersTable"))
const PopularProductsCard = lazy(() => import("./PopularProductsCard"))

// Reusable Skeleton
function CardSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-muted animate-pulse"
      style={{ height }}
    />
  )
}

export default function EcommerceDashboard() {
  return (
    <div className="ecommerce-dashboard">

      {/* Top Stats */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 mb-6">

        <Suspense fallback={<CardSkeleton height={160} />}>
          <TottalOrdersCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <TotalRevenueCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <VisitorsCard />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <ConversionRateCard />
        </Suspense>

      </div>

      {/* Main Section */}
      <div className="grid grid-cols-12 gap-6">

        <div className="col-span-12">
          <Suspense fallback={<CardSkeleton height={350} />}>
            <SalesAnalysisCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <RecentOrdersCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <OrderStatus />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={260} />}>
            <SalesByCountriesCard />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-8">
          <Suspense fallback={<CardSkeleton height={400} />}>
            <RecentOrdersTable />
          </Suspense>
        </div>

        <div className="col-span-12 xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <PopularProductsCard />
          </Suspense>
        </div>

      </div>

    </div>
  )
}