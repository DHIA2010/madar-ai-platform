import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS, IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { findDataSource, findField, REPORT_CATALOG } from "./catalog"
import { executeKpi, getFilterFieldValues } from "./query-builder"
import { ReportsRepository } from "./repository"
import { ensureSystemReportsSeeded } from "./seed"
import type {
  CustomReportDefinition,
  KpiDefinition,
  KpiExtraField,
  KpiResult,
  ReportFilter,
  ReportLevelFilter,
  SaveCustomReportInput,
  SaveKpiInput,
} from "./types"

const DEFAULT_RANGE_MONTHS = 12

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to)
  from.setMonth(from.getMonth() - DEFAULT_RANGE_MONTHS)
  return { from: from.toISOString(), to: to.toISOString() }
}

// Matches the "manage" grant on the reports module in system-roles.ts (owner/admin/manager) --
// kept here too, not just at the route's modulePermissions check, as defense in depth for any
// other caller of this service.
function assertActorCanManageReports(actor: AuthenticatedActor) {
  if (
    !actor.roles.includes("owner") &&
    !actor.roles.includes("admin") &&
    !actor.roles.includes("manager")
  ) {
    throw ERRORS.forbidden()
  }
}

function validateDefinitionShape(input: {
  dataSource: string
  field: string
  extraFields?: KpiExtraField[]
  filters: ReportFilter[]
  groupByDimension: string | null
}) {
  const dataSource = findDataSource(input.dataSource)
  if (!dataSource) {
    throw new IdentityError(
      "REPORT_DEFINITION_INVALID",
      400,
      "validation",
      "مصدر بيانات غير معروف."
    )
  }
  const field = findField(dataSource, input.field)
  if (!field) {
    throw new IdentityError("REPORT_DEFINITION_INVALID", 400, "validation", "حقل غير معروف.")
  }
  for (const extra of input.extraFields ?? []) {
    if (!findField(dataSource, extra.field)) {
      throw new IdentityError("REPORT_DEFINITION_INVALID", 400, "validation", "حقل غير معروف.")
    }
  }
}

export class ReportsService {
  private readonly repository: ReportsRepository

  constructor(private readonly db: PostgresDatabase) {
    this.repository = new ReportsRepository(db)
  }

  getCatalog() {
    return REPORT_CATALOG.map((source) => ({
      key: source.key,
      label: source.label,
      category: source.category,
      fields: source.fields.map((field) => ({
        key: field.key,
        label: field.label,
        allowedAggregations: field.allowedAggregations,
      })),
      dimensions: source.dimensions.map((dimension) => ({
        key: dimension.key,
        label: dimension.label,
      })),
      filterFields: source.filterFields.map((filterField) => ({
        key: filterField.key,
        label: filterField.label,
        allowedOperators: filterField.allowedOperators,
      })),
    }))
  }

  async listKpis(actor: AuthenticatedActor): Promise<KpiDefinition[]> {
    return this.repository.listKpis(actor.organizationId)
  }

  async getKpi(actor: AuthenticatedActor, id: string): Promise<KpiDefinition> {
    const kpi = await this.repository.findKpi(actor.organizationId, id)
    if (!kpi) {
      throw ERRORS.notFound("KPI")
    }
    return kpi
  }

  async createKpi(actor: AuthenticatedActor, input: SaveKpiInput): Promise<KpiDefinition> {
    assertActorCanManageReports(actor)
    validateDefinitionShape(input)
    return this.repository.createKpi(actor.organizationId, actor.userId, input, false)
  }

  async updateKpi(
    actor: AuthenticatedActor,
    id: string,
    input: SaveKpiInput
  ): Promise<KpiDefinition> {
    assertActorCanManageReports(actor)
    validateDefinitionShape(input)
    const existing = await this.repository.findKpi(actor.organizationId, id)
    if (!existing) {
      throw ERRORS.notFound("KPI")
    }
    if (existing.isSystem) {
      throw new IdentityError(
        "REPORT_SYSTEM_KPI_READONLY",
        403,
        "business",
        "لا يمكن تعديل المؤشرات الأساسية للنظام."
      )
    }
    const updated = await this.repository.updateKpi(actor.organizationId, id, actor.userId, input)
    if (!updated) {
      throw ERRORS.notFound("KPI")
    }
    return updated
  }

  async deleteKpi(actor: AuthenticatedActor, id: string): Promise<void> {
    assertActorCanManageReports(actor)
    const deleted = await this.repository.deleteKpi(actor.organizationId, id)
    if (!deleted) {
      throw ERRORS.notFound("KPI")
    }
  }

  async previewKpi(
    actor: AuthenticatedActor,
    input: {
      dataSource: string
      field: string
      aggregation: SaveKpiInput["aggregation"]
      extraFields?: KpiExtraField[]
      filters: ReportFilter[]
      timeGrouping: SaveKpiInput["timeGrouping"]
      groupByDimension: string | null
      compareEnabled: boolean
      workspaceId: string | null
    }
  ): Promise<KpiResult> {
    validateDefinitionShape(input)
    return executeKpi(this.db, actor.organizationId, input.workspaceId, input, defaultRange())
  }

  async getFilterFieldValues(
    actor: AuthenticatedActor,
    dataSource: string,
    field: string,
    workspaceId: string | null
  ): Promise<string[]> {
    return getFilterFieldValues(this.db, actor.organizationId, workspaceId, dataSource, field)
  }

  async listCustomReports(
    actor: AuthenticatedActor,
    isSystem: boolean
  ): Promise<CustomReportDefinition[]> {
    if (isSystem) {
      await ensureSystemReportsSeeded(this.repository, actor.organizationId, actor.userId)
    }
    return this.repository.listCustomReports(actor.organizationId, isSystem)
  }

  async getCustomReport(actor: AuthenticatedActor, id: string): Promise<CustomReportDefinition> {
    const report = await this.repository.findCustomReport(actor.organizationId, id)
    if (!report) {
      throw ERRORS.notFound("Report")
    }
    return report
  }

  async createCustomReport(
    actor: AuthenticatedActor,
    input: SaveCustomReportInput
  ): Promise<CustomReportDefinition> {
    assertActorCanManageReports(actor)
    return this.repository.createCustomReport(actor.organizationId, actor.userId, input, false)
  }

  async updateCustomReport(
    actor: AuthenticatedActor,
    id: string,
    input: SaveCustomReportInput
  ): Promise<CustomReportDefinition> {
    assertActorCanManageReports(actor)
    const existing = await this.repository.findCustomReport(actor.organizationId, id)
    if (!existing) {
      throw ERRORS.notFound("Report")
    }
    if (existing.isSystem) {
      throw new IdentityError(
        "REPORT_SYSTEM_REPORT_READONLY",
        403,
        "business",
        "لا يمكن تعديل تقارير النظام."
      )
    }
    const updated = await this.repository.updateCustomReport(actor.organizationId, id, input)
    if (!updated) {
      throw ERRORS.notFound("Report")
    }
    return updated
  }

  async deleteCustomReport(actor: AuthenticatedActor, id: string): Promise<void> {
    assertActorCanManageReports(actor)
    const deleted = await this.repository.deleteCustomReport(actor.organizationId, id)
    if (!deleted) {
      throw ERRORS.notFound("Report")
    }
  }

  // Runs every KPI placed on a report's canvas in one call -- what powers both the read-only
  // viewer and the builder's live canvas preview. Three layers stack here, closest-wins for the
  // date range and additive for filters:
  //   1. The hardcoded last-12-months window, if nothing else is set.
  //   2. The report author's own saved `defaultFilters` (its permanent baseline, set in the
  //      builder) -- applied whenever no viewer override says otherwise.
  //   3. `overrides`, the viewer's own session-only filter bar -- a date range replaces the
  //      baseline entirely (combining two ranges isn't meaningful), while its filters are ADDED
  //      on top of the saved ones rather than replacing them, since the saved filters represent
  //      "always applies to this report" rules.
  // Every filter (saved or session) is scoped by `dataSource` and merged into a widget's own
  // filters only when that widget's KPI reads from the same data source, so a filter meaningful to
  // one data source never leaks onto a KPI from a different one. executeKpi validates every merged
  // filter against the catalog exactly as it does a KPI's own saved filters, so one naming an
  // unknown/disallowed field still gets rejected there -- no separate validation needed here.
  async runCustomReport(
    actor: AuthenticatedActor,
    id: string,
    overrides?: { from?: string; to?: string; filters?: ReportLevelFilter[] }
  ): Promise<{ report: CustomReportDefinition; results: Record<string, KpiResult> }> {
    const report = await this.getCustomReport(actor, id)
    const savedFrom = report.defaultFilters.from
    const savedTo = report.defaultFilters.to
    const range =
      overrides?.from && overrides?.to
        ? { from: overrides.from, to: overrides.to }
        : savedFrom && savedTo
          ? { from: savedFrom, to: savedTo }
          : defaultRange()
    const combinedFilters = [
      ...(report.defaultFilters.filters ?? []),
      ...(overrides?.filters ?? []),
    ]
    const results: Record<string, KpiResult> = {}
    for (const widget of report.widgets) {
      const kpi = await this.repository.findKpi(actor.organizationId, widget.kpiId)
      if (!kpi) {
        continue
      }
      const extraFilters = combinedFilters.filter((filter) => filter.dataSource === kpi.dataSource)
      const definition =
        extraFilters.length === 0
          ? kpi
          : {
              ...kpi,
              filters: [
                ...kpi.filters,
                ...extraFilters.map(({ field, operator, value }) => ({ field, operator, value })),
              ],
            }
      results[widget.kpiId] = await executeKpi(
        this.db,
        actor.organizationId,
        report.workspaceId,
        definition,
        range
      )
    }
    return { report, results }
  }
}
