"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

import type { WaterfallStep } from "../types"
import { AXIS_TICK_STYLE, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, PANEL } from "./ready-report-field"

const COLOR_INCREASE = "#22c55e"
const COLOR_DECREASE = "#ef4444"
const COLOR_TOTAL = "#2878ff"

// No Recharts-native waterfall/bridge chart type -- built as a stacked BarChart with an invisible
// "base" series under a colored "delta" series per step: each step's base is the lower of its
// before/after running total, and the delta is the height between them. "start"/"total" steps
// render as a full bar from 0 instead of floating.
export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const { rows } = steps.reduce<{
    cumulative: number
    rows: Array<{ label: string; base: number; delta: number; rawValue: number; color: string }>
  }>(
    (acc, step) => {
      if (step.kind === "start" || step.kind === "total") {
        const nextCumulative = step.kind === "start" ? step.value : acc.cumulative
        return {
          cumulative: nextCumulative,
          rows: [
            ...acc.rows,
            {
              label: step.label,
              base: 0,
              delta: Math.abs(step.value),
              rawValue: step.value,
              color:
                step.kind === "total"
                  ? COLOR_TOTAL
                  : step.value >= 0
                    ? COLOR_INCREASE
                    : COLOR_DECREASE,
            },
          ],
        }
      }
      const before = acc.cumulative
      const after = acc.cumulative + step.value
      return {
        cumulative: after,
        rows: [
          ...acc.rows,
          {
            label: step.label,
            base: Math.min(before, after),
            delta: Math.abs(after - before),
            rawValue: step.value,
            color: step.value >= 0 ? COLOR_INCREASE : COLOR_DECREASE,
          },
        ],
      }
    },
    { cumulative: 0, rows: [] }
  )

  // The math above must stay in logical order (each step's base/delta depends on the running
  // total before it) -- reversed only for display, so the page's RTL reading direction is
  // honored: المبيعات starts on the right, صافي الدخل ends on the left.
  const displayRows = [...rows].reverse()

  return (
    <div className={cn(PANEL, "flex h-full flex-col p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>توزيع حسابات صافي الدخل</h3>
      <div className="min-h-[260px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayRows} margin={{ top: 24, right: 4, left: -12, bottom: 0 }}>
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
              cursor={{ fill: "#eef4ff" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(_value: number, _name: string, item) => {
                const payload = item.payload as { rawValue: number }
                return [formatCurrencyCompact(payload.rawValue), "القيمة"]
              }}
            />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
            <Bar
              dataKey="delta"
              stackId="waterfall"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            >
              {displayRows.map((row) => (
                <Cell key={row.label} fill={row.color} />
              ))}
              <LabelList
                dataKey="rawValue"
                position="top"
                formatter={(value: number) => formatCurrencyCompact(value)}
                style={{ fontSize: 11, fontWeight: 700, fill: "#0b1738" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: COLOR_INCREASE }} />
          زيادة
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: COLOR_DECREASE }} />
          نقصان
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: COLOR_TOTAL }} />
          الإجمالي
        </span>
      </div>
    </div>
  )
}
