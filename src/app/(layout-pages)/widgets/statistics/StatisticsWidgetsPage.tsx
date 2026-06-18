"use client"

import React, { Suspense, lazy } from "react"
import {
  Chromium,
  CreditCard,
  ShoppingCart,
  Users,
  BriefcaseBusiness,
  ShoppingBag,
  Wallet,
  Box,
  CircleCheckBig,
} from "lucide-react"

// Lazy imports
const StatCardWidgets = lazy(() => import("./StatCardWidgets"))
const IconColorWidget = lazy(() => import("./IconColorWidget"))
const ProjectProgressCard = lazy(() => import("./ProjectProgressCard"))
const ColorStatCard = lazy(() => import("./ColorStatCard"))

const RecentOrdersCard = lazy(() =>
  import("../../dashboard/eCommerce/RecentOrdersCard")
)
const SalesByCountriesCard = lazy(() =>
  import("../../dashboard/eCommerce/SalesByCountriesCard")
)
const PopularProductsCard = lazy(() =>
  import("../../dashboard/eCommerce/PopularProductsCard")
)
const TransactionsCard = lazy(() =>
  import("../../dashboard/analytics/transactions-card")
)
const RecentOrdersTable = lazy(() =>
  import("../../dashboard/eCommerce/RecentOrdersTable")
)

// Skeleton
function CardSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-xl bg-muted animate-pulse"
      style={{ height }}
    />
  )
}

export default function StatisticsWidgetsPage() {
  return (
    <div className="data-widgets-page">

      {/* Simple Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<CardSkeleton height={140} />}>
          <StatCardWidgets title="Total Visitors" value="4,582" icon={Users} />
        </Suspense>
        <Suspense fallback={<CardSkeleton height={140} />}>
          <StatCardWidgets title="Pageviews" value="15,743" icon={Chromium} />
        </Suspense>
        <Suspense fallback={<CardSkeleton height={140} />}>
          <StatCardWidgets title="Bounce Rate" value="47.8%" icon={BriefcaseBusiness} />
        </Suspense>
        <Suspense fallback={<CardSkeleton height={140} />}>
          <StatCardWidgets title="Conversion Rate" value="5.2%" icon={CircleCheckBig} />
        </Suspense>
      </div>

      {/* Icon Stats */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<CardSkeleton height={160} />}>
          <IconColorWidget title="Customers" value="8.549k" icon={Users} iconBg="bg-cyan-100 dark:bg-cyan-900" iconColor="text-cyan-600 dark:text-cyan-300" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <IconColorWidget title="Products" value="1.423k" icon={ShoppingCart} iconBg="bg-rose-100 dark:bg-rose-900" iconColor="text-rose-600 dark:text-rose-300" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <IconColorWidget title="Revenue" value="₹1.423k" icon={CreditCard} iconBg="bg-blue-100 dark:bg-blue-900" iconColor="text-blue-600 dark:text-blue-300" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <IconColorWidget title="Notifications" value="8967" icon={ShoppingBag} iconBg="bg-green-100 dark:bg-green-900" iconColor="text-green-600 dark:text-green-300" />
        </Suspense>
      </div>

      {/* Progress Cards */}
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<CardSkeleton height={200} />}>
          <ProjectProgressCard title="Mobile App Design" name="Hira R." role="UX/UI Designer" avatar="https://i.pravatar.cc/100?img=1" progress={75} progressColor="bg-green-500" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={200} />}>
          <ProjectProgressCard title="eCommerce Website" name="Alex M." role="Frontend Developer" avatar="https://i.pravatar.cc/100?img=2" progress={62} progressColor="bg-yellow-500" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={200} />}>
          <ProjectProgressCard title="Admin Dashboard" name="Sophia L." role="Product Manager" avatar="https://i.pravatar.cc/100?img=3" progress={38} progressColor="bg-red-500" />
        </Suspense>
      </div>

      {/* Color Stats */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Suspense fallback={<CardSkeleton height={160} />}>
          <ColorStatCard title="Total Orders" subtitle="All Regions" value="8,542" trendText="+3.5% since last month" icon={ShoppingBag} iconColor="text-emerald-600" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <ColorStatCard title="Total Revenue" subtitle="This Quarter" value="$23,456" trendText="+8.5% since last month" icon={Wallet} cardClassName="bg-blue-600 text-white border-blue-500/30" iconColor="text-white" textClassName="text-white" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <ColorStatCard title="Total Customers" subtitle="Worldwide" value="5,678" trendText="-2.5% since last month" icon={Users} iconColor="text-rose-600" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <ColorStatCard title="Total Products" subtitle="Inventory" value="1,234" trendText="+5.0% since last month" icon={Box} cardClassName="bg-rose-500 text-white border-rose-500/30" iconColor="text-white" textClassName="text-white" />
        </Suspense>

        <Suspense fallback={<CardSkeleton height={160} />}>
          <ColorStatCard title="Active Shoppers" subtitle="Live Now" value="179" trendText="44% today" icon={Users} cardClassName="bg-yellow-50 border border-yellow-400 text-yellow-900" iconColor="text-yellow-600" showMenu={false} />
        </Suspense>
      </div>

      {/* Heavy Components */}
      <div className="grid grid-cols-12 gap-6 mt-6">

        <div className="col-span-12 lg:col-span-6 2xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <RecentOrdersCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 2xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <SalesByCountriesCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 2xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <PopularProductsCard />
          </Suspense>
        </div>

        <div className="col-span-12 lg:col-span-6 2xl:col-span-4">
          <Suspense fallback={<CardSkeleton height={300} />}>
            <TransactionsCard />
          </Suspense>
        </div>

        <div className="col-span-12 2xl:col-span-8">
          <Suspense fallback={<CardSkeleton height={400} />}>
            <RecentOrdersTable />
          </Suspense>
        </div>

      </div>

    </div>
  )
}