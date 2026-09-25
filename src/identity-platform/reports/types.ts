export type ReportAggregation = "sum" | "avg" | "count" | "min" | "max"
export type ReportTimeGrouping = "day" | "week" | "month" | "quarter" | "year" | "none"
export type ReportDisplayType = "number" | "line" | "bar" | "pie" | "table" | "gauge"
export type ReportSharing = "private" | "organization"
export type KpiStatus = "draft" | "active"
export type CustomReportStatus = "draft" | "active" | "stopped"
export type ReportFilterOperator = "eq" | "neq" | "contains" | "not_contains"

export interface ReportFilter {
  field: string
  operator: ReportFilterOperator
  value: string
}

// A filter applied at the whole-report level (the viewer's own filter bar), rather than baked
// into one specific KPI's saved definition. Since a report's widgets can pull from different data
// sources, this carries its own `dataSource` so executeKpi only merges it into a widget's filters
// when that widget's KPI actually reads from the same data source -- the same field key can exist
// (and mean something different) on more than one data source.
export interface ReportLevelFilter extends ReportFilter {
  dataSource: string
}

// An additional metric computed alongside a KPI's primary field/aggregation -- only table/line
// display types render these (see kpi-widget-renderer.tsx); other display types ignore them.
export interface KpiExtraField {
  field: string
  aggregation: ReportAggregation
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
  // Extra metrics beyond the primary field, in table/line KPIs only. Empty for every KPI created
  // before this existed.
  extraFields: KpiExtraField[]
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  compareAgainst: "previous_period"
  displayType: ReportDisplayType
  // A gauge KPI's goal, distinct from compareEnabled/compareAgainst (which compares against a
  // prior period's actuals, not a target). Null = no goal set.
  target: number | null
  // How many decimal places this KPI's values/percentages round to when displayed. Default 1
  // matches the fixed rounding every KPI used before this setting existed.
  decimalPlaces: number
  isSystem: boolean
  status: KpiStatus
  createdByUserId: string
  // The creator's real name, resolved via a join against `users` -- null for a system KPI (no
  // real creator) or if that user account has since been removed.
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
  // Optional; repository.ts coalesces a missing value to [] (every KPI before this existed).
  extraFields?: KpiExtraField[]
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
  displayType: ReportDisplayType
  // Optional so existing callers that only ever built number/line/bar KPIs don't need updating --
  // repository.ts coalesces a missing value to null before it ever reaches a query parameter.
  target?: number | null
  // Optional; repository.ts coalesces a missing value to 1 (matching every KPI's fixed rounding
  // before this setting existed).
  decimalPlaces?: number
  status: KpiStatus
  workspaceId: string | null
}

// x/y/w/h describe the widget's place on the builder's drag-and-resize grid (12 columns, x/w in
// column units, y/h in row units) -- the same grid the report viewer renders the saved report
// back into, so a report looks the same wherever it's opened. order is kept alongside purely as
// a stable tie-breaker for reading order when two widgets share a row.
export interface ReportWidgetRef {
  id: string
  kpiId: string
  order: number
  x: number
  y: number
  w: number
  h: number
}

export interface CustomReportDefinition {
  id: string
  organizationId: string
  workspaceId: string | null
  name: string
  description: string
  category: string
  // The report author's own saved baseline -- applied whenever anyone opens the report, before
  // any session-only adjustment from the viewer's own filter bar (see runCustomReport). `from`/`to`
  // are real ISO instants (not the `dateRange` preset key, which nothing currently reads back into
  // an actual range); `filters` mirrors the viewer's filter bar shape, each scoped to a
  // `dataSource` since the report's widgets can pull from more than one.
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
  // The creator's real name, resolved via a join against `users` -- null for a system report (no
  // real creator) or if that user account has since been removed.
  createdByName: string | null
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
  widgets: Array<{ kpiId: string; order: number; x: number; y: number; w: number; h: number }>
}

// A single time-bucketed point (line/bar charts) or a dimension-breakdown row (pie/table/ranked
// bar) -- the query builder picks which shape applies based on whether the KPI groups by time or
// by a dimension; a plain number/gauge KPI returns exactly one point with label "".
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
