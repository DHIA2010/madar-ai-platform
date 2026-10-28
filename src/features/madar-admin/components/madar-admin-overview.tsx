"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, ShoppingBag, TrendingUp, Users, Wallet } from "lucide-react"
import { Cell, Label, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

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
  ACTIVITY_LABEL,
  APPLICATION_LABEL,
  formatDate,
  formatRelative,
  formatSar,
  platformAdminService,
  STORE_PLATFORM_KEY,
} from "../services"
import type { AdminOverview } from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"
import { PlatformChip } from "./platform-chip"
import { SubscriptionStatusBadge } from "./subscription-status-badge"

const trendChartConfig: ChartConfig = {
  الإيرادات: { label: "الإيرادات (SAR)", color: "#2878ff" },
  "اشتراكات جديدة": { label: "اشتراكات جديدة", color: "#7c4dff" },
}

const APP_COLORS = [
  "#2878ff",
  "#7c4dff",
  "#16a34a",
  "#f97316",
  "#e11d48",
  "#0d9488",
  "#ca8a04",
  "#64748b",
]

const STATUS_META: Record<string, { label: string; barClassName: string }> = {
  active: { label: "نشط", barClassName: "bg-emerald-500" },
  trial: { label: "تجربة مجانية", barClassName: "bg-blue-500" },
  overdue: { label: "متأخر في الدفع", barClassName: "bg-amber-500" },
  expired: { label: "منتهي", barClassName: "bg-slate-400" },
  cancelled: { label: "ملغي", barClassName: "bg-rose-500" },
}

const MONTH_LABEL = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "short" })

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function share(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100)
}

// The Madar Admin home: headline numbers (with month-over-month change once a month of history
// exists), revenue and new subscriptions over 8 months, how subscriptions split by app and status,
// connected platforms, today's activity, and the latest customers and events.
export function MadarAdminOverview() {
  const [data, setData] = useState<AdminOverview | null>(null)

  useEffect(() => {
    platformAdminService
      .getOverview()
      .then(setData)
      .catch(() => toast.error("تعذر تحميل لوحة المتابعة."))
  }, [])

  const kpis: MadarAdminKpi[] = data
    ? [
        {
          label: "إجمالي العملاء",
          value: formatNumber(data.kpis.customers.value),
          deltaPct: data.kpis.customers.deltaPct,
          icon: Users,
          tone: "blue",
        },
        {
          label: "إجمالي المتاجر",
          value: formatNumber(data.kpis.stores.value),
          deltaPct: data.kpis.stores.deltaPct,
          icon: ShoppingBag,
          tone: "violet",
        },
        {
          label: "الاشتراكات النشطة",
          value: formatNumber(data.kpis.activeSubscriptions.value),
          deltaPct: data.kpis.activeSubscriptions.deltaPct,
          icon: CalendarClock,
          tone: "green",
        },
        {
          label: "الإيرادات الشهرية (MRR)",
          value: formatSar(data.kpis.mrrHalalas.value),
          deltaPct: data.kpis.mrrHalalas.deltaPct,
          icon: Wallet,
          tone: "indigo",
        },
        {
          label: "الزوار النشطون الآن",
          value: formatNumber(data.kpis.liveVisitors.value),
          deltaPct: null,
          icon: TrendingUp,
          tone: "orange",
        },
      ]
    : []

  const trend = (data?.trend ?? []).map((point) => ({
    month: MONTH_LABEL.format(new Date(`${point.month}-01T12:00:00Z`)),
    الإيرادات: Math.round(point.revenueHalalas / 100),
    "اشتراكات جديدة": point.newSubscriptions,
  }))
  const apps = (data?.subscriptionsByApplication ?? []).map((entry, index) => ({
    ...entry,
    label: APPLICATION_LABEL[entry.application] ?? entry.application,
    color: APP_COLORS[index % APP_COLORS.length],
  }))
  const appsTotal = apps.reduce((sum, entry) => sum + entry.count, 0)
  const statusTotal = (data?.subscriptionStatus ?? []).reduce((sum, entry) => sum + entry.count, 0)
  const storesTotal = (data?.storesByPlatform ?? []).reduce((sum, entry) => sum + entry.count, 0)
  const todayStats = data
    ? [
        { label: "الأحداث المستقبلة", value: formatNumber(data.today.events) },
        { label: "المشتريات (Purchases)", value: formatNumber(data.today.purchases) },
        { label: "العملاء الجدد", value: formatNumber(data.today.newCustomers) },
        { label: "مدفوعات ناجحة", value: formatNumber(data.today.paymentsToday) },
        { label: "الأخطاء في التكاملات", value: formatNumber(data.today.integrationErrors) },
      ]
    : []

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">نبني بيانات أكثر تأثيراً</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة العملاء، الاشتراكات، والتكاملات من مكان واحد.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data === null
          ? Array.from({ length: 5 }, (_, index) => (
              <AppCard
                key={index}
                state="loading"
                className="h-[150px] rounded-2xl border-border/60"
              />
            ))
          : kpis.map((kpi) => <MadarAdminKpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AppCard
          title="الإيرادات والاشتراكات الجديدة"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm lg:col-span-2"
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
                width={56}
              />
              <YAxis
                yAxisId="subs"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
                width={36}
                allowDecimals={false}
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
                dataKey="اشتراكات جديدة"
                type="monotone"
                stroke="#7c4dff"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </AppCard>

        <AppCard
          title="الاشتراكات النشطة حسب التطبيق"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {appsTotal === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              لا توجد اشتراكات نشطة.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ChartContainer config={{}} className="mx-auto aspect-square h-44 w-full" dir="ltr">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={apps}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={76}
                    strokeWidth={3}
                  >
                    {apps.map((entry) => (
                      <Cell key={entry.application} fill={entry.color} />
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
                              {formatNumber(appsTotal)}
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
                {apps.map((entry) => (
                  <div
                    key={entry.application}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-foreground">{entry.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {share(entry.count, appsTotal)}%
                      </span>
                      <span>{formatNumber(entry.count)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AppCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AppCard
          title="حالة الاشتراكات"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-3.5">
            {(data?.subscriptionStatus ?? []).map((entry) => (
              <div key={entry.status}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {STATUS_META[entry.status]?.label ?? entry.status}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatNumber(entry.count)}{" "}
                    <span className="text-muted-foreground">
                      ({share(entry.count, statusTotal)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${STATUS_META[entry.status]?.barClassName ?? "bg-slate-400"}`}
                    style={{ width: `${share(entry.count, statusTotal)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard
          title="المتاجر حسب المنصة"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {storesTotal === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد متاجر مربوطة.</p>
          ) : (
            <div className="space-y-3.5">
              {(data?.storesByPlatform ?? []).map((entry) => (
                <div key={entry.platform}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <PlatformChip platform={STORE_PLATFORM_KEY[entry.platform]} />
                    <span className="font-medium text-foreground">
                      {formatNumber(entry.count)}{" "}
                      <span className="text-muted-foreground">
                        ({share(entry.count, storesTotal)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${share(entry.count, storesTotal)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppCard>

        <AppCard
          title="إحصائيات اليوم"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <div className="space-y-3">
            {todayStats.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{stat.label}</span>
                <span className="font-semibold text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>
        </AppCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppCard
          title="أحدث العملاء"
          state={data === null ? "loading" : "idle"}
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
            {(data?.recentCustomers ?? []).map((customer) => (
              <div key={customer.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    سجّل {formatDate(customer.createdAt)}
                  </p>
                </div>
                <SubscriptionStatusBadge status={customer.status} />
              </div>
            ))}
          </div>
        </AppCard>

        <AppCard
          title="أحدث الأنشطة"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {(data?.recentActivity ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد نشاط بعد.</p>
          ) : (
            <div className="space-y-3">
              {data?.recentActivity.map((item, index) => (
                <div
                  key={`${item.createdAt}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {ACTIVITY_LABEL[item.action] ?? item.action}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[item.organizationName, item.actorName].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(item.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AppCard>
      </div>
    </div>
  )
}
