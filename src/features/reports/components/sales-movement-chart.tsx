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

import type { SalesMovementHourRow } from "../types"
import { AXIS_TICK_STYLE, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, PANEL } from "./ready-report-field"

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "ص" : "م"
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12
  return `${twelveHour} ${period}`
}

export function SalesMovementChart({ hours }: { hours: SalesMovementHourRow[] }) {
  const data = hours.map((row) => ({ ...row, label: formatHourLabel(row.hour) }))

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>المبيعات خلال اليوم</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="salesMovementFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
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
              formatter={(value: number) => [formatCurrencyCompact(value), "المبيعات"]}
            />
            <Area
              type="monotone"
              dataKey="totalSales"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#salesMovementFill)"
              dot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
