"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

import type { ReportDisplayType } from "../services/catalog.service"
import type { KpiResult } from "../services/kpi.service"

const PIE_COLORS = [
  "#2878ff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#64748b",
]

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value)
}

function formatLabel(label: string): string {
  if (!label) return ""
  const date = new Date(label)
  if (!Number.isNaN(date.getTime()) && label.includes("T")) {
    return new Intl.DateTimeFormat("ar-SA", { month: "short", year: "2-digit" }).format(date)
  }
  return label
}

export function KpiComparisonBadge({ result }: { result: KpiResult }) {
  if (result.changePercent === null) {
    return null
  }
  const isUp = result.changePercent >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isUp ? "text-emerald-600" : "text-red-600"
      )}
    >
      {isUp ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
      {formatNumber(Math.abs(result.changePercent))}%
    </span>
  )
}

// Renders a KPI's already-fetched result as whichever display type its definition chose --
// shared by the report builder's live canvas and the read-only report viewer, so the two never
// drift in how a given display type is drawn.
export function KpiWidgetRenderer({
  name,
  displayType,
  result,
}: {
  name: string
  displayType: ReportDisplayType
  result: KpiResult
}) {
  const chartData = result.points.map((point) => ({
    label: formatLabel(point.label),
    value: point.value,
  }))

  if (displayType === "number" || displayType === "gauge") {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-sm font-medium text-muted-foreground">{name}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold">{formatNumber(result.currentValue)}</p>
          <KpiComparisonBadge result={result} />
        </div>
      </div>
    )
  }

  if (displayType === "table") {
    return (
      <div className="p-4">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{name}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {chartData.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <td className="py-1.5 pe-3 text-muted-foreground">{row.label}</td>
                  <td className="py-1.5 text-end font-medium">{formatNumber(row.value)}</td>
                </tr>
              ))}
              {chartData.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-muted-foreground">لا توجد بيانات</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (displayType === "pie") {
    return (
      <div className="p-4">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={45} outerRadius={80}>
              {chartData.map((entry, index) => (
                <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatNumber(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (displayType === "bar") {
    return (
      <div className="p-4">
        <p className="mb-2 text-sm font-medium text-muted-foreground">{name}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => formatNumber(value)} />
            <Bar dataKey="value" fill="#2878ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // line (default for a time series)
  return (
    <div className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-muted-foreground">{name}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold">{formatNumber(result.currentValue)}</p>
          <KpiComparisonBadge result={result} />
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value: number) => formatNumber(value)} />
          <Line type="monotone" dataKey="value" stroke="#2878ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
