"use client"

import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import { AppDateRangeFilter, AppSearchableSelect } from "@/components/app"

import { useWorkspace } from "@/features/workspace"

import { PANEL } from "./ready-report-field"

export function ReadyReportFilterBar({
  dateRange,
  onDateRangeChange,
  workspaceId,
  onWorkspaceChange,
  children,
}: {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  workspaceId: string | "all"
  onWorkspaceChange: (value: string | "all") => void
  // Extra report-specific filter controls (e.g. the customer picker on Sales by Customer),
  // rendered inline after the shared ones.
  children?: React.ReactNode
}) {
  const { availableWorkspaces } = useWorkspace()

  return (
    <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-4")}>
      <AppDateRangeFilter value={dateRange} onChange={onDateRangeChange} />
      <AppSearchableSelect
        value={workspaceId}
        options={[
          { value: "all", label: "كل الفروع" },
          ...availableWorkspaces.map((workspace) => ({
            value: workspace.id,
            label: workspace.name,
          })),
        ]}
        onChange={(value) => onWorkspaceChange(value)}
        placeholder="الفرع"
        ariaLabel="الفرع"
        triggerClassName="w-[160px]"
      />
      {children}
    </div>
  )
}
