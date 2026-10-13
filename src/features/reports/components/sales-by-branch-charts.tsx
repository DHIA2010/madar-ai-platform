"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

import type { SalesByBranchRow } from "../types"
import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  formatCurrencyCompact,
  TOOLTIP_STYLE,
} from "./chart-constants"
import { HEADING, MUTED, PANEL } from "./ready-report-field"

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)} ر.س`
}

export function SalesByBranchBarChart({ branches }: { branches: SalesByBranchRow[] }) {
  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>المبيعات حسب الفرع</h3>
      {branches.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
      ) : (
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={branches} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
              <XAxis
                dataKey="workspaceName"
                tick={AXIS_TICK_STYLE}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value: number) => formatCurrencyCompact(value)}
                tick={AXIS_TICK_STYLE}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "#f4f7fb" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [formatCurrencyCompact(value), "المبيعات"]}
              />
              <Bar dataKey="totalSales" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {branches.map((branch, index) => (
                  <Cell key={branch.workspaceId} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function SalesByBranchDonutChart({ branches }: { branches: SalesByBranchRow[] }) {
  const total = branches.reduce((sum, branch) => sum + branch.totalSales, 0)

  return (
    <div className={cn(PANEL, "p-4")}>
      <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>توزيع المبيعات حسب الفرع</h3>
      {branches.length === 0 ? (
        <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>لا توجد بيانات</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={branches}
                  dataKey="totalSales"
                  nameKey="workspaceName"
                  innerRadius="62%"
                  outerRadius="100%"
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {branches.map((branch, index) => (
                    <Cell
                      key={branch.workspaceId}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, item) => [
                    formatCurrencyCompact(value),
                    (item.payload as SalesByBranchRow).workspaceName,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className={cn("text-[10.5px]", MUTED)}>الإجمالي</p>
              <p className={cn("text-[13px] font-extrabold", HEADING)}>
                {formatCurrencyCompact(total)}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {branches.map((branch, index) => (
              <div key={branch.workspaceId} className="flex items-center gap-2 text-[12px]">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className={cn("min-w-0 flex-1 truncate font-semibold", HEADING)}>
                  {branch.workspaceName}
                </span>
                <span className={cn("shrink-0 font-semibold", MUTED)}>
                  {formatCurrency(branch.totalSales)} ({branch.contributionPercent.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
