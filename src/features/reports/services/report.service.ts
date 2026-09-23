import type { KpiResult } from "./kpi.service"

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

export interface ReportWidgetRef {
  id: string
  kpiId: string
  order: number
}

export interface CustomReport {
  id: string
  organizationId: string
  workspaceId: string | null
  name: string
  description: string
  category: string
  defaultFilters: { dateRange?: string; workspaceId?: string | null }
  displayOptions: { showFilterBar?: boolean; allowExport?: boolean; showComparison?: boolean }
  sharing: ReportSharing
  isSystem: boolean
  status: CustomReportStatus
  createdByUserId: string
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
  widgets: Array<{ kpiId: string; order: number }>
}

export interface CustomReportData {
  report: CustomReport
  results: Record<string, KpiResult>
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

  async getData(id: string): Promise<CustomReportData> {
    return client.get<CustomReportData>(`${reportUrl(id)}/data`)
  },
}
