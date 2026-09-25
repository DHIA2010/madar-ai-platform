import type { KpiResult, ReportFilter } from "./kpi.service"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "reports", "custom"].join(PATH_SEPARATOR)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

export type ReportSharing = "private" | "organization"
export type CustomReportStatus = "draft" | "active" | "stopped"

// x/y/w/h place the widget on the builder's 12-column drag-and-resize grid (x/w in column
// units, y/h in row units) -- the same grid the viewer renders the saved report back into.
export interface ReportWidgetRef {
  id: string
  kpiId: string
  order: number
  x: number
  y: number
  w: number
  h: number
}

export interface CustomReport {
  id: string
  organizationId: string
  workspaceId: string | null
  name: string
  description: string
  category: string
  // The report author's own saved baseline (set in the builder) -- applied whenever anyone opens
  // the report, before any session-only adjustment from the viewer's own filter bar.
  defaultFilters: {
    dateRange?: string
    workspaceId?: string | null
    from?: string
    to?: string
    filters?: ReportLevelFilter[]
  }
  displayOptions: { showFilterBar?: boolean; allowExport?: boolean; showComparison?: boolean }
  sharing: ReportSharing
  isSystem: boolean
  status: CustomReportStatus
  createdByUserId: string
  // The creator's real name -- null for a system report or a removed user account.
  createdByName: string | null
  createdAt: string
  updatedAt: string
  widgets: ReportWidgetRef[]
}

export interface SaveCustomReportInput {
  name: string
  description: string
  category: string
  defaultFilters: CustomReport["defaultFilters"]
  displayOptions: CustomReport["displayOptions"]
  sharing: ReportSharing
  status: CustomReportStatus
  workspaceId: string | null
  widgets: Array<{ kpiId: string; order: number; x: number; y: number; w: number; h: number }>
}

export interface CustomReportData {
  report: CustomReport
  results: Record<string, KpiResult>
}

// A filter from the viewer's own filter bar (not one baked into a saved KPI) -- scoped to a
// `dataSource` since a report's widgets can pull from more than one, and this filter only makes
// sense applied to the ones that actually have this field.
export interface ReportLevelFilter extends ReportFilter {
  dataSource: string
}

export interface ReportDataOverrides {
  from?: string
  to?: string
  filters?: ReportLevelFilter[]
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

function reportUrl(id: string) {
  return [ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR)
}

export const reportService = {
  async list(isSystem: boolean): Promise<CustomReport[]> {
    return client.get<CustomReport[]>(`${ENDPOINT}?isSystem=${isSystem ? "true" : "false"}`)
  },

  async get(id: string): Promise<CustomReport> {
    return client.get<CustomReport>(reportUrl(id))
  },

  async create(input: SaveCustomReportInput): Promise<CustomReport> {
    return client.post<SaveCustomReportInput, CustomReport>(ENDPOINT, input)
  },

  async update(id: string, input: SaveCustomReportInput): Promise<CustomReport> {
    return client.patch<SaveCustomReportInput, CustomReport>(reportUrl(id), input)
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>(reportUrl(id))
  },

  async getData(id: string, overrides?: ReportDataOverrides): Promise<CustomReportData> {
    const params = new URLSearchParams()
    if (overrides?.from) params.set("from", overrides.from)
    if (overrides?.to) params.set("to", overrides.to)
    if (overrides?.filters?.length) params.set("filters", JSON.stringify(overrides.filters))
    const query = params.toString()
    return client.get<CustomReportData>(`${reportUrl(id)}/data${query ? `?${query}` : ""}`)
  },
}
