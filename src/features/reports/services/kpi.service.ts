import type {
  ReportAggregation,
  ReportDisplayType,
  ReportFilterOperator,
  ReportTimeGrouping,
} from "./catalog.service"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "reports", "kpis"].join(PATH_SEPARATOR)
const PREVIEW_ENDPOINT = ["", "v1", "reports", "kpis", "preview"].join(PATH_SEPARATOR)

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

export interface ReportFilter {
  field: string
  operator: ReportFilterOperator
  value: string
}

// An additional metric computed alongside a KPI's primary field/aggregation -- only table/line
// display types render these (see kpi-widget-renderer.tsx); other display types ignore them.
export interface KpiExtraField {
  field: string
  aggregation: ReportAggregation
}

export interface Kpi {
  id: string
  organizationId: string
  workspaceId: string | null
  name: string
  description: string
  category: string
  dataSource: string
  field: string
  aggregation: ReportAggregation
  extraFields: KpiExtraField[]
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  displayType: ReportDisplayType
  // A gauge KPI's goal, distinct from compareEnabled (which compares against a prior period's
  // actuals, not a target). Null = no goal set, gauge falls back to a plain current-value display.
  target: number | null
  // How many decimal places this KPI's values/percentages round to when displayed.
  decimalPlaces: number
  isSystem: boolean
  status: "draft" | "active"
  createdByUserId: string
  // The creator's real name -- null for a system KPI or a removed user account.
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveKpiInput {
  name: string
  description: string
  category: string
  dataSource: string
  field: string
  aggregation: ReportAggregation
  extraFields: KpiExtraField[]
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  displayType: ReportDisplayType
  target: number | null
  decimalPlaces: number
  status: "draft" | "active"
  workspaceId: string | null
}

export interface KpiPreviewInput {
  dataSource: string
  field: string
  aggregation: ReportAggregation
  extraFields: KpiExtraField[]
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  workspaceId: string | null
}

export interface KpiDataPoint {
  label: string
  value: number
  // This point's value for each of the KPI's extraFields, keyed by field key -- present only when
  // the KPI has extraFields set.
  extraValues?: Record<string, number>
}

export interface KpiResult {
  points: KpiDataPoint[]
  currentValue: number
  previousValue: number | null
  changePercent: number | null
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

function kpiUrl(id: string) {
  return [ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR)
}

export const kpiService = {
  async list(): Promise<Kpi[]> {
    return client.get<Kpi[]>(ENDPOINT)
  },

  async get(id: string): Promise<Kpi> {
    return client.get<Kpi>(kpiUrl(id))
  },

  async create(input: SaveKpiInput): Promise<Kpi> {
    return client.post<SaveKpiInput, Kpi>(ENDPOINT, input)
  },

  async update(id: string, input: SaveKpiInput): Promise<Kpi> {
    return client.patch<SaveKpiInput, Kpi>(kpiUrl(id), input)
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>(kpiUrl(id))
  },

  async preview(input: KpiPreviewInput): Promise<KpiResult> {
    return client.post<KpiPreviewInput, KpiResult>(PREVIEW_ENDPOINT, input)
  },
}
