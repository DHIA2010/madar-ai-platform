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
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  displayType: ReportDisplayType
  isSystem: boolean
  status: "draft" | "active"
  createdByUserId: string
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
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  displayType: ReportDisplayType
  status: "draft" | "active"
  workspaceId: string | null
}

export interface KpiPreviewInput {
  dataSource: string
  field: string
  aggregation: ReportAggregation
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  workspaceId: string | null
}

export interface KpiDataPoint {
  label: string
  value: number
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
