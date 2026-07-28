"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"

const METRIC_COLORS = {
  spend: "var(--chart-1)",
  revenue: "var(--chart-2)",
  roas: "var(--chart-3)",
  ctr: "var(--chart-4)",
  cpc: "var(--chart-5)",
  conversions: "hsl(var(--primary))",
} as const

interface CampaignPerformanceChartProps {
  values: number[]
  labels: string[]
  metric: keyof typeof METRIC_COLORS
}

export function CampaignPerformanceChart({
  values,
  labels,
  metric,
}: CampaignPerformanceChartProps) {
  const points = useMemo(() => {
    if (values.length === 0) {
      return ""
    }

    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    const range = Math.max(max - min, 1)

    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100
        const y = 100 - ((value - min) / range) * 100
        return `${x},${y}`
      })
      .join(" ")
  }, [values])

  return (
    <div className="space-y-3">
      <div className="relative h-72 overflow-hidden rounded-xl border border-border/70 bg-background/60 p-4">
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_24%,hsl(var(--border))_25%,transparent_26%),linear-gradient(to_right,transparent_24%,hsl(var(--border))_25%,transparent_26%)] bg-[length:100%_52px,72px_100%] opacity-35" />
        <svg
          viewBox="0 0 100 100"
          className="relative z-10 h-full w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Performance trend chart"
        >
          <polyline
            points={points}
            fill="none"
            stroke={METRIC_COLORS[metric]}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4 md:grid-cols-8">
        {labels.map((label) => (
          <div
            key={label}
            className={cn(
              "truncate rounded-md border border-border/60 bg-card px-2 py-1 text-center"
            )}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
