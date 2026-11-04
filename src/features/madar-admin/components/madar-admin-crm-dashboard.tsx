"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlarmClock, CalendarCheck, Inbox, Percent, Target, Trophy } from "lucide-react"
import { Line, LineChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ROUTES } from "@/constants/routes"

import {
  AppCard,
  type AppChartPrimitiveConfig as ChartConfig,
  AppChartPrimitiveContainer as ChartContainer,
  AppChartPrimitiveTooltip as ChartTooltip,
  AppChartPrimitiveTooltipContent as ChartTooltipContent,
} from "@/components/app"

import { crmService } from "../services"
import type { CrmDashboard } from "../types"
import { formatSarAmount, platformLabel, SOURCE_LABEL, stageColor } from "./crm-ui"
import { type MadarAdminKpi, MadarAdminKpiCard } from "./madar-admin-kpi-card"

const RANGES = [
  { days: 7, label: "7 أيام" },
  { days: 30, label: "30 يومًا" },
  { days: 90, label: "90 يومًا" },
]

const dailyChartConfig: ChartConfig = {
  "عملاء جدد": { label: "عملاء محتملون جدد", color: "#2878ff" },
  "صفقات رابحة": { label: "صفقات رابحة", color: "#10b981" },
}

const SOURCE_COLOR: Record<string, string> = {
  website: "bg-blue-500",
  signup: "bg-violet-500",
  manual: "bg-amber-500",
}

// The sales team's numbers: how many leads came in, how many booked, how many were won.
export function MadarAdminCrmDashboard() {
  const [rangeDays, setRangeDays] = useState(30)
  const [loaded, setLoaded] = useState<{ rangeDays: number; data: CrmDashboard } | null>(null)
  // Shows as loading while a different range is being fetched.
  const data = loaded?.rangeDays === rangeDays ? loaded.data : null

  useEffect(() => {
    let active = true
    crmService
      .dashboard(rangeDays)
      .then((result) => {
        if (active) setLoaded({ rangeDays, data: result })
      })
      .catch(() => toast.error("تعذر تحميل تقارير المبيعات."))
    return () => {
      active = false
    }
  }, [rangeDays])

  const delta =
    data && data.newLeadsPrevious > 0
      ? Math.round(((data.newLeads - data.newLeadsPrevious) / data.newLeadsPrevious) * 100)
      : null

  const kpis: MadarAdminKpi[] = data
    ? [
        {
          label: "عملاء محتملون جدد",
          value: String(data.newLeads),
          deltaPct: delta,
          icon: Inbox,
          tone: "blue",
        },
        {
          label: "اجتماعات محجوزة",
          value: String(data.meetingsBooked),
          deltaPct: null,
          icon: CalendarCheck,
          tone: "violet",
        },
        {
          label: "صفقات رابحة",
          value: String(data.won),
          deltaPct: null,
          icon: Trophy,
          tone: "green",
        },
        {
          label: "إيرادات الصفقات",
          value: formatSarAmount(data.wonValue),
          deltaPct: null,
          icon: Target,
          tone: "indigo",
        },
        {
          label: "نسبة الفوز",
          value: data.winRate === null ? "—" : `${data.winRate}٪`,
          deltaPct: null,
          icon: Percent,
          tone: "orange",
        },
        {
          label: "متابعات متأخرة",
          value: String(data.overdueTasks),
          deltaPct: null,
          icon: AlarmClock,
          tone: "rose",
        },
      ]
    : []

  const daily = (data?.daily ?? []).map((point) => ({
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit" }).format(
      new Date(point.date)
    ),
    "عملاء جدد": point.created,
    "صفقات رابحة": point.won,
  }))
  const sourceTotal = data?.bySource.reduce((sum, entry) => sum + entry.count, 0) ?? 0
  const stageMax = Math.max(1, ...(data?.byStage.map((entry) => entry.count) ?? [1]))

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تقارير المبيعات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أداء فريق المبيعات: العملاء الجدد والاجتماعات والصفقات.
          </p>
        </div>
        <div className="flex rounded-[10px] border border-border/60 bg-card p-1">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setRangeDays(range.days)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
                rangeDays === range.days
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data === null
          ? Array.from({ length: 6 }, (_, index) => (
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
          title="العملاء الجدد والصفقات يوميًا"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm lg:col-span-2"
        >
          <ChartContainer config={dailyChartConfig} className="h-72 w-full" dir="ltr">
            <LineChart data={daily} margin={{ left: 4, right: 4 }}>
              <XAxis
                dataKey="date"
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
                width={32}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Line
                dataKey="عملاء جدد"
                type="monotone"
                stroke="#2878ff"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="صفقات رابحة"
                type="monotone"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </AppCard>

        <AppCard
          title="مصادر العملاء الجدد"
          state={data === null ? "loading" : "idle"}
          className="rounded-2xl border-border/60 shadow-sm"
        >
          <ul className="space-y-4 pt-2">
            {(data?.bySource ?? []).map((entry) => {
              const share = sourceTotal > 0 ? Math.round((entry.count / sourceTotal) * 100) : 0
              return (
                <li key={entry.source}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{SOURCE_LABEL[entry.source]}</span>
                    <span className="text-muted-foreground">
                      {entry.count} ({share}٪)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-muted">
                    <div
                      className={cn("h-2 rounded-full", SOURCE_COLOR[entry.source])}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          {data ? (
            <p className="mt-5 text-xs text-muted-foreground">
              {data.openLeads} عميل محتمل مفتوح حاليًا •{" "}
              <Link
                href={ROUTES.madarAdminCrm}
                className="font-semibold text-primary hover:underline"
              >
                عرض اللوحة
              </Link>
            </p>
          ) : null}
        </AppCard>
      </div>

      <AppCard
        title="العملاء المحتملون حسب المرحلة"
        state={data === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-6">
          {(data?.byStage ?? []).map(({ stage, label, color, count }) => {
            return (
              <div key={stage} className="rounded-xl border border-border/60 p-4">
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{count}</p>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-1.5 rounded-full", stageColor(color).dot)}
                    style={{ width: `${Math.round((count / stageMax) * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </AppCard>

      <AppCard
        title="حسب الحملة"
        state={data === null ? "loading" : "idle"}
        className="rounded-2xl border-border/60 shadow-sm"
      >
        <p className="-mt-1 mb-3 text-sm text-muted-foreground">
          العملاء المحتملون المضافون في الفترة حسب المنصة والحملة التي جاؤوا منها أول مرة (من روابط
          UTM).
        </p>
        {data && data.byCampaign.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد عملاء في الفترة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="py-2 text-start font-semibold">المنصة</th>
                  <th className="py-2 text-start font-semibold">الحملة</th>
                  <th className="py-2 text-center font-semibold">العملاء</th>
                  <th className="py-2 text-center font-semibold">اجتماعات</th>
                  <th className="py-2 text-center font-semibold">صفقات رابحة</th>
                  <th className="py-2 text-end font-semibold">قيمة الصفقات</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byCampaign ?? []).map((row) => (
                  <tr
                    key={`${row.platform}-${row.campaign ?? ""}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-2.5 font-semibold text-foreground">
                      {platformLabel(row.platform)}
                    </td>
                    <td className="py-2.5 text-muted-foreground" dir="auto">
                      {row.campaign ?? "—"}
                    </td>
                    <td className="py-2.5 text-center font-bold">{row.leads}</td>
                    <td className="py-2.5 text-center">{row.meetings}</td>
                    <td className="py-2.5 text-center">{row.won}</td>
                    <td className="py-2.5 text-end font-semibold">
                      {row.wonValue ? formatSarAmount(row.wonValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppCard>
    </div>
  )
}
