"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { cn } from "@/lib/utils"

import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  formatCurrencyCompact,
  TOOLTIP_STYLE,
} from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./expense-field"

export function ExpenseCategoryStackedBarCard({
  data,
  seriesKeys,
}: {
  data: Array<Record<string, string | number>>
  seriesKeys: string[]
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-1 text-[13.5px] font-bold", HEADING)}>المصروفات الشهرية حسب الفئة</h3>
      {seriesKeys.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            {seriesKeys.map((key, index) => (
              <span key={key} className="flex items-center gap-1.5 text-[11px] font-semibold">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className={HEADING}>{key}</span>
              </span>
            ))}
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
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
                  formatter={(value: number) => formatCurrencyCompact(value)}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "#eef4ff" }}
                />
                {seriesKeys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="expenses"
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={index === seriesKeys.length - 1 ? [6, 6, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
