"use client"

import { useEffect, useState } from "react"
import { Activity, Radio, ShoppingCart, Users } from "lucide-react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import {
  AppCard,
  type AppChartPrimitiveConfig as ChartConfig,
  AppChartPrimitiveContainer as ChartContainer,
  AppChartPrimitiveTooltip as ChartTooltip,
  AppChartPrimitiveTooltipContent as ChartTooltipContent,
} from "@/components/app"

import { platformAdminService } from "../services"
import type { AdminTracking } from "../types/platform-admin.types"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

const chartConfig: ChartConfig = {
  الأحداث: { label: "الأحداث", color: "#2878ff" },
  المشتريات: { label: "المشتريات", color: "#16a34a" },
}

const EVENT_LABEL: Record<string, string> = {
  PAGE_VIEW: "مشاهدة صفحة",
  PRODUCT_VIEW: "مشاهدة منتج",
  PRODUCT_LIST_VIEW: "مشاهدة قائمة",
  SEARCH: "بحث",
  ADD_TO_CART: "إضافة للسلة",
  REMOVE_FROM_CART: "حذف من السلة",
  CART_VIEW: "مشاهدة السلة",
  CHECKOUT_STARTED: "بدء الدفع",
  CHECKOUT_COMPLETED: "إتمام الدفع",
  PURCHASE: "شراء",
  CLICK: "نقرة",
  IDENTIFY: "تعريف زائر",
  HEARTBEAT: "نبض جلسة",
}

const number = (value: number) => new Intl.NumberFormat("en-US").format(value)

// Platform-wide tracking volume from every customer's storefront snippet: today's events and
// purchases, who's on a store right now, and the last seven days.
export function MadarAdminTracking() {
  const [data, setData] = useState<AdminTracking | null>(null)

  useEffect(() => {
    platformAdminService
      .getTracking()
      .then(setData)
      .catch(() => toast.error("تعذر تحميل بيانات التتبع."))
  }, [])

  const kpis: MadarAdminKpi[] = [
    {
      label: "الأحداث اليوم",
      value: data ? number(data.eventsToday) : "—",
      deltaPct: null,
      icon: Activity,
      tone: "blue",
    },
    {
      label: "المشتريات اليوم",
      value: data ? number(data.purchasesToday) : "—",
      deltaPct: null,
      icon: ShoppingCart,
      tone: "green",
    },
    {
      label: "الزوار النشطون الآن",
      value: data ? number(data.liveVisitorsNow) : "—",
      deltaPct: null,
      icon: Radio,
      tone: "orange",
    },
    {
      label: "عملاء يرسلون أحداثاً اليوم",
      value: data ? number(data.trackingCustomersToday) : "—",
      deltaPct: null,
      icon: Users,
      tone: "violet",
    },
  ]
  const chartData = (data?.last7Days ?? []).map((day) => ({
    day: day.day.slice(5),
    الأحداث: day.events,
    المشتريات: day.purchases,
  }))
  const byType = Object.entries(data?.eventsByTypeToday ?? {}).sort(
    (left, right) => right[1] - left[1]
  )

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tracking & Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الأحداث والتتبع على مستوى المنصة من متاجر جميع العملاء.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <MadarAdminKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <AppCard
        title="آخر 7 أيام"
        state={data === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <ChartContainer config={chartConfig} className="h-72 w-full" dir="ltr">
          <BarChart data={chartData} margin={{ left: 4, right: 4 }}>
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} width={44} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="الأحداث" fill="#2878ff" radius={[6, 6, 0, 0]} />
            <Bar dataKey="المشتريات" fill="#16a34a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AppCard
          title="الأحداث اليوم حسب النوع"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {byType.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد أحداث اليوم.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {byType.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-foreground">{EVENT_LABEL[type] ?? type}</span>
                  <span className="font-semibold">{number(count)}</span>
                </li>
              ))}
            </ul>
          )}
        </AppCard>

        <AppCard
          title="أكثر العملاء نشاطاً اليوم"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          {(data?.topCustomersToday ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد أحداث اليوم.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data?.topCustomersToday.map((customer) => (
                <li
                  key={customer.organizationId}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="text-foreground">{customer.organizationName}</span>
                  <span className="font-semibold">{number(customer.events)}</span>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>
    </div>
  )
}
