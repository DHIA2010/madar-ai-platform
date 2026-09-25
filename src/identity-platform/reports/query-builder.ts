import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import {
  aggregationSqlFn,
  type CatalogDataSource,
  findDataSource,
  findDimension,
  findField,
  findFilterField,
} from "./catalog"
import type {
  KpiDataPoint,
  KpiExtraField,
  KpiResult,
  ReportAggregation,
  ReportFilter,
  ReportTimeGrouping,
} from "./types"

export interface KpiExecutionInput {
  dataSource: string
  field: string
  aggregation: ReportAggregation
  extraFields?: KpiExtraField[]
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
  not_contains: "not ilike",
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
    invalid(`مصدر بيانات غير معروف: ${dataSourceKey}`)
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
      invalid(`حقل فلترة غير معروف: ${filter.field}`)
    }
    if (!filterField.allowedOperators.includes(filter.operator)) {
      invalid(`عامل التصفية "${filter.operator}" غير مسموح به على حقل الفلترة "${filter.field}"`)
    }
    const sqlOperator = FILTER_SQL_OPERATOR[filter.operator]
    if (filter.operator === "contains" || filter.operator === "not_contains") {
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

// Resolves + validates each extraField against the catalog once, up front, returning the SQL
// select fragment ("aggFn(expr) as extra_0") and the field key to attach each value under on the
// result -- shared by both the dimension-breakdown and time-series queries below.
function resolveExtraFields(
  dataSource: CatalogDataSource,
  extraFields: KpiExtraField[]
): Array<{ alias: string; selectSql: string; key: string }> {
  return extraFields.map((extra, index) => {
    const catalogField = findField(dataSource, extra.field)
    if (!catalogField) {
      invalid(`حقل غير معروف "${extra.field}" لمصدر البيانات "${dataSource.key}"`)
    }
    if (!catalogField.allowedAggregations.includes(extra.aggregation)) {
      invalid(`طريقة التجميع "${extra.aggregation}" غير مسموح بها على الحقل "${extra.field}"`)
    }
    const alias = `extra_${index}`
    return {
      alias,
      selectSql: `${aggregationSqlFn(extra.aggregation)}(${catalogField.sqlExpr}) as ${alias}`,
      key: extra.field,
    }
  })
}

function extractExtraValues(
  row: Record<string, string | number | null>,
  extraParts: Array<{ alias: string; key: string }>
): Record<string, number> | undefined {
  if (extraParts.length === 0) return undefined
  const values: Record<string, number> = {}
  for (const part of extraParts) {
    const raw = row[part.alias]
    values[part.key] = raw === null || raw === undefined ? 0 : Number(raw)
  }
  return values
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
    invalid(`مصدر بيانات غير معروف: ${definition.dataSource}`)
  }
  const field = findField(dataSource, definition.field)
  if (!field) {
    invalid(`حقل غير معروف "${definition.field}" لمصدر البيانات "${definition.dataSource}"`)
  }
  if (!field.allowedAggregations.includes(definition.aggregation)) {
    invalid(
      `طريقة التجميع "${definition.aggregation}" غير مسموح بها على الحقل "${definition.field}"`
    )
  }
  const extraFields = definition.extraFields ?? []
  const extraParts = resolveExtraFields(dataSource, extraFields)

  let points: KpiDataPoint[]

  if (definition.groupByDimension) {
    const dimension = findDimension(dataSource, definition.groupByDimension)
    if (!dimension) {
      invalid(
        `بُعد غير معروف "${definition.groupByDimension}" لمصدر البيانات "${definition.dataSource}"`
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
    const extraSelect = extraParts.map((part) => `, ${part.selectSql}`).join("")
    const sql = `
      select ${dimension.sqlExpr} as label, ${aggFn}(${field.sqlExpr}) as value${extraSelect}
      from ${dataSource.fromClause}
      where ${conditions.join(" and ")}
      group by ${dimension.sqlExpr}
      order by value desc
      limit 10
    `
    const result = await db.query<Record<string, string | number | null>>(sql, params)
    points = result.rows.map((row) => ({
      label: (row.label as string | null) ?? "غير محدد",
      value: row.value === null ? 0 : Number(row.value),
      extraValues: extractExtraValues(row, extraParts),
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
    const extraSelect = extraParts.map((part) => `, ${part.selectSql}`).join("")
    const sql = `
      select date_trunc('${definition.timeGrouping}', ${dataSource.dateExpr}) as bucket, ${aggFn}(${field.sqlExpr}) as value${extraSelect}
      from ${dataSource.fromClause}
      where ${conditions.join(" and ")}
      group by bucket
      order by bucket
    `
    const result = await db.query<Record<string, string | number | null>>(sql, params)
    points = result.rows.map((row) => ({
      label: new Date(row.bucket as string).toISOString(),
      value: row.value === null ? 0 : Number(row.value),
      extraValues: extractExtraValues(row, extraParts),
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
    let extraValues: Record<string, number> | undefined
    if (extraFields.length > 0) {
      extraValues = {}
      for (const extra of extraFields) {
        const catalogField = findField(dataSource, extra.field)
        if (!catalogField) {
          invalid(`حقل غير معروف "${extra.field}" لمصدر البيانات "${definition.dataSource}"`)
        }
        extraValues[extra.field] = await runAggregate(
          db,
          definition.dataSource,
          catalogField.sqlExpr,
          extra.aggregation,
          organizationId,
          workspaceId,
          definition.filters,
          range
        )
      }
    }
    points = [{ label: "", value: currentValue, extraValues }]
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

// Distinct real values seen for a catalog-whitelisted filter field, used to populate the wizard's
// searchable filter-value dropdown. Filter values themselves aren't part of the static catalog
// (only fields/operators are), so this runs a scoped `SELECT DISTINCT` against live data instead.
export async function getFilterFieldValues(
  db: PostgresDatabase,
  organizationId: string,
  workspaceId: string | null,
  dataSourceKey: string,
  fieldKey: string
): Promise<string[]> {
  const dataSource = findDataSource(dataSourceKey)
  if (!dataSource) {
    invalid(`مصدر بيانات غير معروف: ${dataSourceKey}`)
  }
  const filterField = findFilterField(dataSource, fieldKey)
  if (!filterField) {
    invalid(`حقل فلترة غير معروف "${fieldKey}" لمصدر البيانات "${dataSourceKey}"`)
  }
  const { conditions, params } = buildScopeAndFilters(
    dataSourceKey,
    organizationId,
    workspaceId,
    [],
    null
  )
  const sql = `
    select distinct ${filterField.sqlExpr} as value
    from ${dataSource.fromClause}
    where ${conditions.join(" and ")} and ${filterField.sqlExpr} is not null
    order by value
    limit 50
  `
  const result = await db.query<{ value: string | number | null }>(sql, params)
  return result.rows.map((row) => String(row.value)).filter((value) => value.length > 0)
}
