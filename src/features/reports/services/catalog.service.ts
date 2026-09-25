import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "reports", "catalog"].join(PATH_SEPARATOR)
const FILTER_VALUES_ENDPOINT = [ENDPOINT, "filter-values"].join(PATH_SEPARATOR)

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
export type ReportFilterOperator = "eq" | "neq" | "contains" | "not_contains"

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

  // Distinct real values for a whitelisted filter field (e.g. every status actually seen on
  // pos_invoices), used to populate the wizard's searchable filter-value dropdown -- filter
  // values aren't part of the static catalog, only fields/operators are.
  async getFilterFieldValues(
    dataSource: string,
    field: string,
    workspaceId: string | null
  ): Promise<string[]> {
    const params = new URLSearchParams({ dataSource, field })
    if (workspaceId) params.set("workspaceId", workspaceId)
    return client.get<string[]>(`${FILTER_VALUES_ENDPOINT}?${params.toString()}`)
  },
}

// A KPI stores raw catalog keys (dataSource/field/groupByDimension), not their labels -- this
// resolves the exact catalog label ("إجمالي المبيعات", "حالة الفاتورة", ...) for a given key pair,
// so a widget's column headers can show the real metric/dimension name instead of the KPI's own
// (possibly customized, e.g. "test إجمالي المبيعات") display name.
export function buildCatalogLabelIndex(catalog: CatalogDataSourceOption[]) {
  const fieldLabels = new Map<string, string>()
  const dimensionLabels = new Map<string, string>()
  for (const source of catalog) {
    for (const field of source.fields) {
      fieldLabels.set(`${source.key}:${field.key}`, field.label)
    }
    for (const dimension of source.dimensions) {
      dimensionLabels.set(`${source.key}:${dimension.key}`, dimension.label)
    }
  }
  return {
    fieldLabel: (dataSource: string, field: string) => fieldLabels.get(`${dataSource}:${field}`),
    dimensionLabel: (dataSource: string, dimension: string | null) =>
      dimension ? dimensionLabels.get(`${dataSource}:${dimension}`) : undefined,
  }
}
