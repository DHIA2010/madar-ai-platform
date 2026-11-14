"use client"

import { useState } from "react"
import {
  FileText,
  type LucideIcon,
  Package,
  ReceiptText,
  ScrollText,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"

import { cn } from "@/lib/utils"

import {
  AppCard,
  type AppChartPrimitiveConfig as ChartConfig,
  AppChartPrimitiveContainer as ChartContainer,
  AppChartPrimitiveTooltip as ChartTooltip,
  AppChartPrimitiveTooltipContent as ChartTooltipContent,
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/app"

import type {
  AdminUsageLevel,
  AdminUtilizationDailyPoint,
  AdminUtilizationMetric,
} from "../types/platform-admin.types"
import { CrmDateRange, toDay } from "./crm-filters"
import type { MadarAdminKpiTone } from "./madar-admin-kpi-card"

// Shared pieces of the two utilization pages (all customers, and one customer over time).

export const UTILIZATION_METRICS: Array<{
  key: AdminUtilizationMetric
  label: string
  icon: LucideIcon
  tone: MadarAdminKpiTone
  color: string
}> = [
  { key: "products", label: "المنتجات", icon: Package, tone: "blue", color: "#2878ff" },
  {
    key: "posInvoices",
    label: "فواتير نقاط البيع",
    icon: ReceiptText,
    tone: "green",
    color: "#10b981",
  },
  {
    key: "salesInvoices",
    label: "فواتير المبيعات",
    icon: FileText,
    tone: "indigo",
    color: "#6366f1",
  },
  { key: "quotations", label: "عروض الأسعار", icon: ScrollText, tone: "violet", color: "#8b5cf6" },
  { key: "orders", label: "الطلبات", icon: ShoppingCart, tone: "orange", color: "#f97316" },
  { key: "customers", label: "عملاء المتجر", icon: Users, tone: "rose", color: "#f43f5e" },
  { key: "purchases", label: "المشتريات", icon: Truck, tone: "blue", color: "#0ea5e9" },
  { key: "expenses", label: "المصروفات", icon: Wallet, tone: "orange", color: "#f59e0b" },
]

export const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value)

const USAGE_META: Record<AdminUsageLevel, { label: string; className: string; bar: string }> = {
  active: { label: "نشط", className: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  idle: { label: "خامل", className: "bg-amber-50 text-amber-600", bar: "bg-amber-500" },
  never: { label: "لم يبدأ", className: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
}
export const usageMeta = (level: AdminUsageLevel) => USAGE_META[level]

export function UsageBadge({ level }: { level: AdminUsageLevel }) {
  const meta = USAGE_META[level]
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        meta.className
      )}
    >
      {meta.label}
    </span>
  )
}

// ---- The range the numbers cover ----

export interface UtilizationRange {
  from: string
  to: string
  // Which quick range is selected; null when the dates were picked by hand.
  presetDays: number | null
}

const PRESETS = [
  { days: 7, label: "7 أيام" },
  { days: 30, label: "30 يومًا" },
  { days: 90, label: "90 يومًا" },
  { days: 365, label: "12 شهرًا" },
]

export function presetRange(days: number): UtilizationRange {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
  return { from: toDay(first) ?? "", to: toDay(today) ?? "", presetDays: days }
}

export function UtilizationRangeControl({
  range,
  onChange,
}: {
  range: UtilizationRange
  onChange: (range: UtilizationRange) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-[10px] border border-border/60 bg-card p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.days}
            type="button"
            onClick={() => onChange(presetRange(preset.days))}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              range.presetDays === preset.days
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <CrmDateRange
        from={range.presetDays === null ? range.from : undefined}
        to={range.presetDays === null ? range.to : undefined}
        placeholder="فترة مخصصة"
        onChange={(next) => {
          // Clearing the custom dates goes back to the default range.
          if (!next.from || !next.to) onChange(presetRange(30))
          else onChange({ from: next.from, to: next.to, presetDays: null })
        }}
      />
    </div>
  )
}

// ---- Usage over time ----

type Granularity = "day" | "week" | "month"
const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "يومي",
  week: "أسبوعي",
  month: "شهري",
}
type ChartSeries = AdminUtilizationMetric | "activeCustomers"

const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

// Adds the days up into weeks (seven days from the range's first day) or calendar months.
function bucket(
  daily: AdminUtilizationDailyPoint[],
  series: ChartSeries,
  granularity: Granularity
): Array<{ label: string; value: number }> {
  const buckets: Array<{ label: string; value: number }> = []
  const index = new Map<string, number>()
  daily.forEach((point, position) => {
    const key =
      granularity === "day"
        ? point.date
        : granularity === "week"
          ? String(Math.floor(position / 7))
          : point.date.slice(0, 7)
    let at = index.get(key)
    if (at === undefined) {
      at = buckets.length
      index.set(key, at)
      buckets.push({
        label:
          granularity === "month"
            ? `${point.date.slice(5, 7)}/${point.date.slice(0, 4)}`
            : shortDay(point.date),
        value: 0,
      })
    }
    buckets[at].value += point[series]
  })
  return buckets
}

export function UtilizationChart({
  daily,
  loading,
  title,
  showActiveCustomers = false,
  className,
}: {
  daily: AdminUtilizationDailyPoint[]
  loading: boolean
  title: string
  // "Customers who created something that day" only makes sense across many customers.
  showActiveCustomers?: boolean
  className?: string
}) {
  const [series, setSeries] = useState<ChartSeries>("products")
  const [picked, setPicked] = useState<Granularity | null>(null)
  // Long ranges start grouped so the bars stay readable; the choice can always be changed.
  const granularity: Granularity =
    picked ?? (daily.length > 120 ? "month" : daily.length > 45 ? "week" : "day")
  const metric = UTILIZATION_METRICS.find((entry) => entry.key === series)
  const label = metric?.label ?? "عملاء نشطون"
  const color = metric?.color ?? "#0f172a"
  const data = bucket(daily, series, granularity).map((entry) => ({
    label: entry.label,
    [label]: entry.value,
  }))
  const config: ChartConfig = { [label]: { label, color } }
  // A week or month of "active customers" would count the same customer once per day.
  const canGroup = series !== "activeCustomers"

  return (
    <AppCard
      title={title}
      state={loading ? "loading" : "idle"}
      className={cn("rounded-2xl border-border/60 shadow-sm", className)}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AppSelect
            value={series}
            onValueChange={(value) => {
              setSeries(value as ChartSeries)
              if (value === "activeCustomers") setPicked("day")
            }}
          >
            <AppSelectTrigger className="h-9 w-[170px] rounded-[10px] text-sm">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {showActiveCustomers ? (
                <AppSelectItem value="activeCustomers">عملاء نشطون</AppSelectItem>
              ) : null}
              {UTILIZATION_METRICS.map((entry) => (
                <AppSelectItem key={entry.key} value={entry.key}>
                  {entry.label}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
          <div className="flex rounded-[10px] border border-border/60 p-1">
            {(Object.keys(GRANULARITY_LABEL) as Granularity[]).map((option) => (
              <button
                key={option}
                type="button"
                disabled={!canGroup && option !== "day"}
                onClick={() => setPicked(option)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40",
                  granularity === option
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {GRANULARITY_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <ChartContainer config={config} className="h-72 w-full" dir="ltr">
        <BarChart data={data} margin={{ left: 4, right: 4 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            width={36}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <Bar dataKey={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
    </AppCard>
  )
}
