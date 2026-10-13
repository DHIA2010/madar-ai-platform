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
// (seed.ts). A page can pass its own `getInitialRange` (e.g. the daily sales movement report
// defaults to "today", not 12 months) -- it's also what a cleared date picker falls back to.
export function useReadyReportFilters(getInitialRange: () => DateRange = defaultRange) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialRange)
  const [workspaceId, setWorkspaceId] = useState<string | "all">("all")

  const filters: ReadyReportFilters = useMemo(() => {
    const range = dateRange?.from && dateRange?.to ? dateRange : getInitialRange()
    return {
      from: (range.from as Date).toISOString(),
      to: (range.to as Date).toISOString(),
      workspaceId: workspaceId === "all" ? null : workspaceId,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, workspaceId])

  return { dateRange, setDateRange, workspaceId, setWorkspaceId, filters }
}
