"use client"

import Link from "next/link"
import { CalendarClock, ShoppingBag, TrendingUp, Users, Wallet } from "lucide-react"
import { Cell, Label, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"

import { ROUTES } from "@/constants/routes"

import {
  AppButton,
  AppCard,
  type AppChartPrimitiveConfig as ChartConfig,
  AppChartPrimitiveContainer as ChartContainer,
  AppChartPrimitiveTooltip as ChartTooltip,
  AppChartPrimitiveTooltipContent as ChartTooltipContent,
} from "@/components/app"

import {
  getOverviewKpis,
  getPlanDistribution,
  getPlatformBreakdown,
  getRecentActivity,
  getRecentCustomers,
  getRevenueTrend,
  getSubscriptionStatusBreakdown,
  getTodayStats,
} from "../services"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

export function MadarAdminOverview() {
  const kpisRaw = getOverviewKpis()
  const trend = getRevenueTrend()
  const planDistribution = getPlanDistribution()
  const statusBreakdown = getSubscriptionStatusBreakdown()
  const platformBreakdown = getPlatformBreakdown()
  const todayStats = getTodayStats()
  const recentCustomers = getRecentCustomers(3)
  const recentActivity = getRecentActivity()

  const kpis: MadarAdminKpi[] = [
    {
      label: "إجمالي العملاء",
      value: formatNumber(kpisRaw.totalCustomers.value),
      deltaPct: kpisRaw.totalCustomers.deltaPct,
      icon: Users,
      tone: "blue",
    },
    {
      label: "إجمالي المتاجر",
      value: formatNumber(kpisRaw.totalStores.value),
      deltaPct: kpisRaw.totalStores.deltaPct,
      icon: ShoppingBag,
      tone: "violet",
    },
    {
      label: "الاشتراكات النشطة",
      value: formatNumber(kpisRaw.activeSubscriptions.value),
      deltaPct: kpisRaw.activeSubscriptions.deltaPct,
      icon: CalendarClock,
      tone: "green",
    },
    {
      label: "الإيرادات الشهرية (MRR)",
      value: `SAR ${formatNumber(kpisRaw.mrr.value)}`,
      deltaPct: kpisRaw.mrr.deltaPct,
      icon: Wallet,
      tone: "indigo",
    },
    {
      label: "الزوار النشطون الآن",
      value: formatNumber(kpisRaw.liveVisitors.value),
      deltaPct: kpisRaw.liveVisitors.deltaPct,
      icon: TrendingUp,
      tone: "orange",
    },
  ]

  const trendChartConfig = {
    الإيرادات: { label: "الإيرادات (SAR)", color: "#2878ff" },
    الاشتراكات: { label: "الاشتراكات", color: "#7c4dff" },
  } satisfies ChartConfig

  const planChartConfig = Object.fromEntries(
    planDistribution.map((entry) => [entry.label, { label: entry.label, color: entry.color }])
  ) satisfies ChartConfig

  const totalPlanCustomers = planDistribution.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">نبني بيانات أكثر تأثيراً</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة العملاء، الاشتراكات، والتكاملات من مكان واحد.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[7fr_3fr]">
        <AppCard
          title="نمو الإيرادات والاشتراكات"
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <ChartContainer config={trendChartConfig} className="h-72 w-full" dir="ltr">
            <LineChart data={trend} margin={{ left: 4, right: 4 }}>
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis
                yAxisId="revenue"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                width={50}
              />
              <YAxis
                yAxisId="subs"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                width={40}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Line
                yAxisId="revenue"
                dataKey="الإيرادات"
                type="monotone"
                stroke="#2878ff"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="subs"
                dataKey="الاشتراكات"
                type="monotone"
                stroke="#7c4dff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </AppCard>

        <AppCard
          title="توزيع العملاء حسب الباقة"
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="flex flex-col items-center gap-4">
            <ChartContainer
              config={planChartConfig}
              className="mx-auto aspect-square h-44 w-full"
              dir="ltr"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={planDistribution}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={52}
                  outerRadius={76}
                  strokeWidth={3}
                >
                  {planDistribution.map((entry) => (
                    <Cell key={entry.tier} fill={entry.color} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox)) return null
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) - 8}
                            className="fill-foreground text-xl font-bold"
                          >
                            {formatNumber(totalPlanCustomers)}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy ?? 0) + 14}
                            className="fill-muted-foreground text-xs"
                          >
                            اشتراك
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="w-full space-y-2">
              {planDistribution.map((entry) => (
                <div key={entry.tier} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-foreground">{entry.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.share}%</span>
                    <span>{formatNumber(entry.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AppCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AppCard title="حالة الاشتراكات" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-3.5">
            {statusBreakdown.map((entry) => (
              <div key={entry.status}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-foreground">{entry.label}</span>
                  <span className="font-medium text-foreground">
                    {formatNumber(entry.value)}{" "}
                    <span className="text-muted-foreground">({entry.share}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${entry.barClassName}`}
                    style={{ width: `${entry.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard title="أهم المنصات" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-3.5">
            {platformBreakdown.map((entry) => (
              <div key={entry.platform}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <PlatformChip platform={entry.platform} />
                  <span className="font-medium text-foreground">
                    {formatNumber(entry.value)}{" "}
                    <span className="text-muted-foreground">({entry.share}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${entry.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard title="إحصائيات اليوم" className="rounded-2xl border-border/60 shadow-sm">
          <div className="space-y-3">
            {todayStats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{stat.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{stat.value}</span>
                  <span
                    className={
                      stat.deltaPct >= 0
                        ? "text-xs font-medium text-emerald-600"
                        : "text-xs font-medium text-rose-600"
                    }
                  >
                    {stat.deltaPct > 0 ? "+" : ""}
                    {stat.deltaPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppCard
          title="أحدث العملاء"
          className="rounded-2xl border-border/60 shadow-sm"
          actions={
            <Link href={ROUTES.madarAdminCustomers}>
              <AppButton variant="ghost" size="sm">
                عرض الكل
              </AppButton>
            </Link>
          }
        >
          <div className="space-y-3">
            {recentCustomers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{customer.storeName}</p>
                  <p className="text-xs text-muted-foreground">{customer.subscriptionDate}</p>
                </div>
                <SubscriptionStatusBadge status={customer.status} />
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard
          title="أحدث الأنشطة"
          className="rounded-2xl border-border/60 shadow-sm"
          actions={
            <AppButton variant="ghost" size="sm">
              عرض الكل
            </AppButton>
          }
        >
          <div className="space-y-3">
            {recentActivity.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{item.activity}</p>
                  <p className="text-xs text-muted-foreground">{item.details}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </AppCard>
      </div>
    </div>
  )
}
