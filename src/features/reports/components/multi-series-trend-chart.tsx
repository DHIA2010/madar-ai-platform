"use client"

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

import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  formatCurrencyCompact,
  TOOLTIP_STYLE,
} from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

// Generalized trend chart: one Area per series (top-5 customers/products), adapting the
// AreaChart styling already established in src/features/expenses/components/
// expense-trend-chart-card.tsx to a multi-series shape.
export function MultiSeriesTrendChart({
  title,
  data,
  seriesKeys,
}: {
  title: string
  data: Array<Record<string, string | number>>
  seriesKeys: string[]
}) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-1 text-[13.5px] font-bold", HEADING)}>{title}</h3>
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
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <defs>
                  {seriesKeys.map((key, index) => (
                    <linearGradient key={key} id={`trend-${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                        stopOpacity={0.22}
                      />
                      <stop
                        offset="100%"
                        stopColor={CHART_COLORS[index % CHART_COLORS.length]}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  ))}
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
                  formatter={(value: number) => formatCurrencyCompact(value)}
                  contentStyle={TOOLTIP_STYLE}
                />
                {seriesKeys.map((key, index) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={key}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2.5}
                    fill={`url(#trend-${index})`}
                    dot={{
                      r: 3,
                      stroke: CHART_COLORS[index % CHART_COLORS.length],
                      strokeWidth: 1.5,
                      fill: "#fff",
                    }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
