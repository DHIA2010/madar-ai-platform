"use client"

import { useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { cn } from "@/lib/utils"

import type { NetIncomeByBranchRow } from "../types"
import { CHART_COLORS, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

// Ranks branches by net income so the best/worst performing branch is immediately obvious --
// always covers every branch for the selected period, ignoring the page's own branch filter (see
// NetIncomeReportDto.byBranch). Pie slices are sized by sqrt(magnitude) (exact signed value shown
// via the center label, tooltip, and legend) -- a plain magnitude would let one outlier branch
// collapse every other slice into an unreadable sliver, since net income figures can differ by
// orders of magnitude across branches. Styled to match this feature's established donut pattern
// (see PaymentMethodDonutCard): the app's own CHART_COLORS palette, a center total that swaps to
// the hovered slice's own value, and a horizontal legend row below the chart.
export function NetIncomeByBranchChart({ branches }: { branches: NetIncomeByBranchRow[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const slices = branches.map((branch) => ({
    ...branch,
    magnitude: Math.sqrt(Math.abs(branch.netIncome)) || 1,
  }))
  const total = branches.reduce((sum, branch) => sum + branch.netIncome, 0)
  const hovered = hoveredIndex !== null ? slices[hoveredIndex] : null

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>مقارنة صافي الدخل حسب الفرع</h3>
      {branches.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
      ) : (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="relative mx-auto aspect-square w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="magnitude"
                  nameKey="workspaceName"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={3}
                  isAnimationActive={false}
                  onMouseEnter={(_, index) => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {slices.map((branch, index) => (
                    <Cell
                      key={branch.workspaceId}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                      opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.35}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(_value: number, _name: string, item) => {
                    const payload = item.payload as (typeof slices)[number]
                    return [formatCurrencyCompact(payload.netIncome), payload.workspaceName]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className={cn("text-[10.5px]", MUTED)}>
                {hovered ? hovered.workspaceName : "الإجمالي"}
              </p>
              <p
                className={cn(
                  "text-[14px] font-extrabold",
                  hovered
                    ? hovered.netIncome >= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                    : HEADING
                )}
              >
                {formatCurrencyCompact(hovered ? hovered.netIncome : total)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {slices.map((branch, index) => (
              <div key={branch.workspaceId} className="flex items-center gap-1.5 text-[12px]">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className={cn("font-semibold", HEADING)}>{branch.workspaceName}</span>
                <span
                  className={cn(
                    "font-semibold",
                    branch.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {formatCurrencyCompact(branch.netIncome)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
