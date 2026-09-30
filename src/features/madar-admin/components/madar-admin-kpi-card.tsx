import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppCard } from "@/components/app"

// Ported from HomeDashboard.tsx's KpiCard/KPI_TONE_CLASSNAMES (this app's real dashboard) rather
// than reinvented, so Madar Admin's KPI rows match the existing design system exactly.
export const MADAR_ADMIN_KPI_TONE_CLASSNAMES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  indigo: "bg-indigo-50 text-indigo-600",
} as const

export type MadarAdminKpiTone = keyof typeof MADAR_ADMIN_KPI_TONE_CLASSNAMES

export interface MadarAdminKpi {
  label: string
  value: string
  unit?: string
  deltaPct: number | null
  icon: LucideIcon
  tone: MadarAdminKpiTone
}

export function MadarAdminKpiCard({ kpi }: { kpi: MadarAdminKpi }) {
  const Icon = kpi.icon
  const trend = kpi.deltaPct === null ? null : kpi.deltaPct >= 0 ? "up" : "down"
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight

  return (
    <AppCard className="rounded-2xl border-border/60 p-5 shadow-sm">
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-xl",
          MADAR_ADMIN_KPI_TONE_CLASSNAMES[kpi.tone]
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        {kpi.value}
        {kpi.unit ? (
          <span className="ms-1 text-sm font-medium text-muted-foreground">{kpi.unit}</span>
        ) : null}
      </p>
      {trend ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              trend === "up" ? "text-emerald-600" : "text-rose-600"
            )}
          >
            <TrendIcon className="size-3.5" />
            {kpi.deltaPct !== null ? `${kpi.deltaPct > 0 ? "+" : ""}${kpi.deltaPct}%` : ""}
          </span>
          <span className="text-muted-foreground">مقارنة بالشهر الماضي</span>
        </div>
      ) : null}
    </AppCard>
  )
}
