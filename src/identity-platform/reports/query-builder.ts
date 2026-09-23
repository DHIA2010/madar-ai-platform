import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import {
  aggregationSqlFn,
  findDataSource,
  findDimension,
  findField,
  findFilterField,
} from "./catalog"
import type {
  KpiDataPoint,
  KpiResult,
  ReportAggregation,
  ReportFilter,
  ReportTimeGrouping,
} from "./types"

export interface KpiExecutionInput {
  dataSource: string
  field: string
  aggregation: ReportAggregation
  filters: ReportFilter[]
  timeGrouping: ReportTimeGrouping
  groupByDimension: string | null
  compareEnabled: boolean
}

export interface KpiExecutionRange {
  from: string
  to: string
}

function invalid(message: string): never {
  throw new IdentityError("REPORT_DEFINITION_INVALID", 400, "validation", message)
}

const FILTER_SQL_OPERATOR: Record<ReportFilter["operator"], string> = {
  eq: "=",
  neq: "!=",
  contains: "ilike",
}

// Builds a validated WHERE clause: table/column names always come from the catalog (never from
// `definition`/`filters` directly), only filter VALUES and the date range are ever bound as
// parameters. Returns the clause plus the running param list/index so callers can append more.
function buildScopeAndFilters(
  dataSourceKey: string,
  organizationId: string,
  workspaceId: string | null,
  filters: ReportFilter[],
  range: KpiExecutionRange | null
) {
  const dataSource = findDataSource(dataSourceKey)
  if (!dataSource) {
    invalid(`Unknown data source: ${dataSourceKey}`)
  }

  const conditions: string[] = [`${dataSource.orgScopeExpr} = $1`]
  const params: unknown[] = [organizationId]

  if (workspaceId && dataSource.workspaceScopeExpr) {
    params.push(workspaceId)
    conditions.push(`${dataSource.workspaceScopeExpr} = $${params.length}`)
  }

  if (range && dataSource.dateExpr) {
    params.push(range.from)
    conditions.push(`${dataSource.dateExpr} >= $${params.length}`)
    params.push(range.to)
    conditions.push(`${dataSource.dateExpr} < $${params.length}`)
  }

  for (const filter of filters) {
    const filterField = findFilterField(dataSource, filter.field)
    if (!filterField) {
      invalid(`Unknown filter field: ${filter.field}`)
    }
    if (!filterField.allowedOperators.includes(filter.operator)) {
      invalid(`Operator "${filter.operator}" is not allowed on filter field "${filter.field}"`)
    }
    const sqlOperator = FILTER_SQL_OPERATOR[filter.operator]
    if (filter.operator === "contains") {
      params.push(`%${filter.value}%`)
    } else {
      params.push(filter.value)
    }
    conditions.push(`${filterField.sqlExpr} ${sqlOperator} $${params.length}`)
  }

  return { dataSource, conditions, params }
}

function computePreviousRange(range: KpiExecutionRange): KpiExecutionRange {
  const fromMs = new Date(range.from).getTime()
  const toMs = new Date(range.to).getTime()
  const durationMs = Math.max(toMs - fromMs, 0)
  return {
    from: new Date(fromMs - durationMs).toISOString(),
    to: range.from,
  }
}

async function runAggregate(
  db: PostgresDatabase,
  dataSourceKey: string,
  fieldExpr: string,
  aggregation: ReportAggregation,
  organizationId: string,
  workspaceId: string | null,
  filters: ReportFilter[],
  range: KpiExecutionRange | null
): Promise<number> {
  const { dataSource, conditions, params } = buildScopeAndFilters(
    dataSourceKey,
    organizationId,
    workspaceId,
    filters,
    range
  )
  const aggFn = aggregationSqlFn(aggregation)
  const sql = `select ${aggFn}(${fieldExpr}) as value from ${dataSource.fromClause} where ${conditions.join(" and ")}`
  const result = await db.query<{ value: string | number | null }>(sql, params)
  const raw = result.rows[0]?.value
  return raw === null || raw === undefined ? 0 : Number(raw)
}

// Validates a KPI definition against the whitelisted catalog and executes it, returning either a
// dimension breakdown (groupByDimension set -- a ranked list for pie/bar/table), a time series
// (timeGrouping set -- for a line/bar-over-time chart), or a single aggregate (a plain number
// card/gauge), plus a period-over-period comparison when requested and applicable.
export async function executeKpi(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null,
  definition: KpiExecutionInput,
  range: KpiExecutionRange
): Promise<KpiResult> {
  const dataSource = findDataSource(definition.dataSource)
  if (!dataSource) {
    invalid(`Unknown data source: ${definition.dataSource}`)
  }
  const field = findField(dataSource, definition.field)
  if (!field) {
    invalid(`Unknown field "${definition.field}" for data source "${definition.dataSource}"`)
  }
  if (!field.allowedAggregations.includes(definition.aggregation)) {
    invalid(`Aggregation "${definition.aggregation}" is not allowed on field "${definition.field}"`)
  }

  let points: KpiDataPoint[]

  if (definition.groupByDimension) {
    const dimension = findDimension(dataSource, definition.groupByDimension)
    if (!dimension) {
      invalid(
        `Unknown dimension "${definition.groupByDimension}" for data source "${definition.dataSource}"`
      )
    }
    const { conditions, params } = buildScopeAndFilters(
      definition.dataSource,
      organizationId,
      workspaceId,
      definition.filters,
      range
    )
    const aggFn = aggregationSqlFn(definition.aggregation)
    const sql = `
      select ${dimension.sqlExpr} as label, ${aggFn}(${field.sqlExpr}) as value
      from ${dataSource.fromClause}
      where ${conditions.join(" and ")}
      group by ${dimension.sqlExpr}
      order by value desc
      limit 10
    `
    const result = await db.query<{ label: string | null; value: string | number | null }>(
      sql,
      params
    )
    points = result.rows.map((row) => ({
      label: row.label ?? "غير محدد",
      value: row.value === null ? 0 : Number(row.value),
    }))
  } else if (definition.timeGrouping !== "none" && dataSource.dateExpr) {
    const { conditions, params } = buildScopeAndFilters(
      definition.dataSource,
      organizationId,
      workspaceId,
      definition.filters,
      range
    )
    const aggFn = aggregationSqlFn(definition.aggregation)
    const sql = `
      select date_trunc('${definition.timeGrouping}', ${dataSource.dateExpr}) as bucket, ${aggFn}(${field.sqlExpr}) as value
      from ${dataSource.fromClause}
      where ${conditions.join(" and ")}
      group by bucket
      order by bucket
    `
    const result = await db.query<{ bucket: string; value: string | number | null }>(sql, params)
    points = result.rows.map((row) => ({
      label: new Date(row.bucket).toISOString(),
      value: row.value === null ? 0 : Number(row.value),
    }))
  } else {
    points = []
  }

  const currentValue = await runAggregate(
    db,
    definition.dataSource,
    field.sqlExpr,
    definition.aggregation,
    organizationId,
    workspaceId,
    definition.filters,
    range
  )

  if (points.length === 0) {
    points = [{ label: "", value: currentValue }]
  }

  let previousValue: number | null = null
  let changePercent: number | null = null
  if (definition.compareEnabled && !definition.groupByDimension) {
    const previousRange = computePreviousRange(range)
    previousValue = await runAggregate(
      db,
      definition.dataSource,
      field.sqlExpr,
      definition.aggregation,
      organizationId,
      workspaceId,
      definition.filters,
      previousRange
    )
    changePercent =
      previousValue === 0 ? null : ((currentValue - previousValue) / previousValue) * 100
  }

  return { points, currentValue, previousValue, changePercent }
}
