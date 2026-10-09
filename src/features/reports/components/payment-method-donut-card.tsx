"use client"

import { useState } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { cn } from "@/lib/utils"

import { CHART_COLORS, formatCurrencyCompact, TOOLTIP_STYLE } from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

// Adapted from src/features/expenses/components/expense-category-donut-card.tsx, including this
// session's two fixes: the center-total label hides while a slice is hovered (so it never
// collides with the floating tooltip), and the legend's label/amount/percentage are grouped
// tightly instead of stretching across the card.
export function PaymentMethodDonutCard({
  title,
  data,
}: {
  title: string
  data: Array<{ label: string; value: number }>
}) {
  const total = data.reduce((sum, row) => sum + row.value, 0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{title}</h3>
      {data.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative mx-auto aspect-square w-full max-w-[200px] flex-1 basis-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={2}
                  onMouseEnter={(_, index) => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrencyCompact(value)}
                  contentStyle={TOOLTIP_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            {hoveredIndex === null ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className={cn("text-[10.5px]", MUTED)}>الإجمالي</p>
                <p className={cn("text-[14px] font-extrabold", HEADING)}>
                  {formatCurrencyCompact(total)}
                </p>
              </div>
            ) : null}
          </div>
          <div className="w-full shrink-0 space-y-1.5 sm:w-[190px]">
            {data.slice(0, 6).map((row, index) => {
              const pct = total > 0 ? Math.round((row.value / total) * 100) : 0
              return (
                <div key={row.label} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className={cn("min-w-0 shrink truncate font-semibold", HEADING)}>
                    {row.label}
                  </span>
                  <span className={cn("shrink-0 text-[11px] font-semibold", HEADING)}>
                    {formatCurrencyCompact(row.value)}
                  </span>
                  <span className={cn("ms-auto shrink-0 text-[11px]", MUTED)}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
