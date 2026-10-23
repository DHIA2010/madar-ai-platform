"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

import { AXIS_TICK_STYLE, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

import type { Locale } from "@/i18n/locales"

// Always a real daily series (ready-reports-repository.ts's posSummaryDailyTrend) over whatever
// range the filter bar selects -- unlike salesMovementByHour's hour-of-day bucketing, this is a
// genuine per-day timeline, so a 30-day range shows 30 points, not 24.
export function PosSummaryTrendChart({
  trend,
}: {
  trend: Array<{ date: string; totalSales: number }>
}) {
  const t = useTranslations("dashboard.posSummary")
  const locale = useLocale() as Locale

  const data = trend.map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      day: "numeric",
      month: "short",
    }),
  }))

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{t("trendTitle")}</h3>
      {data.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="posSummaryTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2878ff" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#2878ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
              <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
                tick={AXIS_TICK_STYLE}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [formatCurrencyCompact(value), t("tooltipSales")]}
              />
              <Area
                type="monotone"
                dataKey="totalSales"
                stroke="#2878ff"
                strokeWidth={2}
                fill="url(#posSummaryTrendFill)"
                dot={{ r: 3, fill: "#2878ff", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
