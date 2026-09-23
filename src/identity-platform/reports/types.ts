export type ReportAggregation = "sum" | "avg" | "count" | "min" | "max"
export type ReportTimeGrouping = "day" | "week" | "month" | "quarter" | "year" | "none"
export type ReportDisplayType = "number" | "line" | "bar" | "pie" | "table" | "gauge"
export type ReportSharing = "private" | "organization"
export type KpiStatus = "draft" | "active"
export type CustomReportStatus = "draft" | "active" | "stopped"
export type ReportFilterOperator = "eq" | "neq" | "contains"

export interface ReportFilter {
  field: string
  operator: ReportFilterOperator
  value: string
}

export interface KpiDefinition {
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
  compareAgainst: "previous_period"
  displayType: ReportDisplayType
  isSystem: boolean
  status: KpiStatus
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
  status: KpiStatus
  workspaceId: string | null
}

export interface ReportWidgetRef {
  id: string
  kpiId: string
  order: number
}

export interface CustomReportDefinition {
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
  defaultFilters: CustomReportDefinition["defaultFilters"]
  displayOptions: CustomReportDefinition["displayOptions"]
  sharing: ReportSharing
  status: CustomReportStatus
  workspaceId: string | null
  widgets: Array<{ kpiId: string; order: number }>
}

// A single time-bucketed point (line/bar charts) or a dimension-breakdown row (pie/table/ranked
// bar) -- the query builder picks which shape applies based on whether the KPI groups by time or
// by a dimension; a plain number/gauge KPI returns exactly one point with label "".
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
