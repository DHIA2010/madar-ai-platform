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

// react-day-picker (the date-range calendar) returns a Date at LOCAL MIDNIGHT for whatever day
// was clicked -- converting that straight to .toISOString() shifts it into the *previous* UTC
// calendar day for any timezone ahead of UTC (e.g. Saudi Arabia, UTC+3), which then silently
// excludes that entire day's records once the backend casts it back to a plain date (expense_date
// <= '...'::date). Re-anchoring to local start/end-of-day before converting guarantees the
// intended calendar day is always fully covered in UTC, regardless of the picker's own time-of-day
// or the viewer's timezone offset.
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
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
      from: startOfLocalDay(range.from as Date).toISOString(),
      to: endOfLocalDay(range.to as Date).toISOString(),
      workspaceId: workspaceId === "all" ? null : workspaceId,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, workspaceId])

  return { dateRange, setDateRange, workspaceId, setWorkspaceId, filters }
}
