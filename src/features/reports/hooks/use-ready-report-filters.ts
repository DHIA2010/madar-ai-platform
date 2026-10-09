"use client"

import { useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"

import type { ReadyReportFilters } from "../types"

function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - 12)
  return { from, to }
}

// Shared "الفترة + الفرع" filter state for every ready-report page -- date range defaults to the
// last 12 months, matching the system-seeded reports' own defaultFilters.dateRange convention
// (seed.ts).
export function useReadyReportFilters() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange)
  const [workspaceId, setWorkspaceId] = useState<string | "all">("all")

  const filters: ReadyReportFilters = useMemo(() => {
    const range = dateRange?.from && dateRange?.to ? dateRange : defaultRange()
    return {
      from: (range.from as Date).toISOString(),
      to: (range.to as Date).toISOString(),
      workspaceId: workspaceId === "all" ? null : workspaceId,
    }
  }, [dateRange, workspaceId])

  return { dateRange, setDateRange, workspaceId, setWorkspaceId, filters }
}
