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

import { AXIS_TICK_STYLE, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, PANEL } from "./expense-field"

export function ExpenseTrendChartCard({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>اتجاه المصروفات</h3>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="expenseTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2878ff" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2878ff" stopOpacity={0} />
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
              formatter={(value: number) => formatCurrencyCompact(value)}
              contentStyle={TOOLTIP_STYLE}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2878ff"
              strokeWidth={2.5}
              fill="url(#expenseTrendFill)"
              dot={{ r: 3, stroke: "#2878ff", strokeWidth: 1.5, fill: "#fff" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
