import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "reports", "catalog"].join(PATH_SEPARATOR)

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

export type ReportAggregation = "sum" | "avg" | "count" | "min" | "max"
export type ReportTimeGrouping = "day" | "week" | "month" | "quarter" | "year" | "none"
export type ReportDisplayType = "number" | "line" | "bar" | "pie" | "table" | "gauge"
export type ReportFilterOperator = "eq" | "neq" | "contains"

export interface CatalogFieldOption {
  key: string
  label: string
  allowedAggregations: ReportAggregation[]
}

export interface CatalogDimensionOption {
  key: string
  label: string
}

export interface CatalogFilterFieldOption {
  key: string
  label: string
  allowedOperators: ReportFilterOperator[]
}

export interface CatalogDataSourceOption {
  key: string
  label: string
  category: string
  fields: CatalogFieldOption[]
  dimensions: CatalogDimensionOption[]
  filterFields: CatalogFilterFieldOption[]
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const reportsCatalogService = {
  async get(): Promise<CatalogDataSourceOption[]> {
    return client.get<CatalogDataSourceOption[]>(ENDPOINT)
  },
}
