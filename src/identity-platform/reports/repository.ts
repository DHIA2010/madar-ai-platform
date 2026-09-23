import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type {
  CustomReportDefinition,
  KpiDefinition,
  ReportWidgetRef,
  SaveCustomReportInput,
  SaveKpiInput,
} from "./types"

function mapKpi(row: Record<string, unknown>): KpiDefinition {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    name: String(row.name),
    description: String(row.description),
    category: String(row.category),
    dataSource: String(row.data_source),
    field: String(row.field),
    aggregation: row.aggregation as KpiDefinition["aggregation"],
    filters: (row.filters as KpiDefinition["filters"]) ?? [],
    timeGrouping: row.time_grouping as KpiDefinition["timeGrouping"],
    groupByDimension: (row.group_by_dimension as string | null) ?? null,
    compareEnabled: Boolean(row.compare_enabled),
    compareAgainst: "previous_period",
    displayType: row.display_type as KpiDefinition["displayType"],
    isSystem: Boolean(row.is_system),
    status: row.status as KpiDefinition["status"],
    createdByUserId: String(row.created_by_user_id),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  }
}

function mapCustomReport(
  row: Record<string, unknown>,
  widgets: ReportWidgetRef[]
): CustomReportDefinition {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    name: String(row.name),
    description: String(row.description),
    category: String(row.category),
    defaultFilters: (row.default_filters as CustomReportDefinition["defaultFilters"]) ?? {},
    displayOptions: (row.display_options as CustomReportDefinition["displayOptions"]) ?? {},
    sharing: row.sharing as CustomReportDefinition["sharing"],
    isSystem: Boolean(row.is_system),
    status: row.status as CustomReportDefinition["status"],
    createdByUserId: String(row.created_by_user_id),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    widgets,
  }
}

export class ReportsRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async listKpis(organizationId: string): Promise<KpiDefinition[]> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from kpis where organization_id = $1 order by created_at desc",
      [organizationId]
    )
    return result.rows.map(mapKpi)
  }

  async findKpi(organizationId: string, id: string): Promise<KpiDefinition | null> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from kpis where organization_id = $1 and id = $2",
      [organizationId, id]
    )
    const row = result.rows[0]
    return row ? mapKpi(row) : null
  }

  async createKpi(
    organizationId: string,
    actorUserId: string,
    input: SaveKpiInput,
    isSystem: boolean
  ): Promise<KpiDefinition> {
    const result = await this.db.query<Record<string, unknown>>(
      `insert into kpis (
        id, organization_id, workspace_id, name, description, category, data_source, field,
        aggregation, filters, time_grouping, group_by_dimension, compare_enabled, compare_against,
        display_type, is_system, status, created_by_user_id, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,'previous_period',$14,$15,$16,$17,now(),now()
      ) returning *`,
      [
        randomUUID(),
        organizationId,
        input.workspaceId,
        input.name,
        input.description,
        input.category,
        input.dataSource,
        input.field,
        input.aggregation,
        JSON.stringify(input.filters),
        input.timeGrouping,
        input.groupByDimension,
        input.compareEnabled,
        input.displayType,
        isSystem,
        input.status,
        actorUserId,
      ]
    )
    return mapKpi(result.rows[0])
  }

  async updateKpi(
    organizationId: string,
    id: string,
    actorUserId: string,
    input: SaveKpiInput
  ): Promise<KpiDefinition | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `update kpis set
        workspace_id = $3, name = $4, description = $5, category = $6, data_source = $7,
        field = $8, aggregation = $9, filters = $10::jsonb, time_grouping = $11,
        group_by_dimension = $12, compare_enabled = $13, display_type = $14, status = $15,
        updated_at = now()
      where organization_id = $1 and id = $2
      returning *`,
      [
        organizationId,
        id,
        input.workspaceId,
        input.name,
        input.description,
        input.category,
        input.dataSource,
        input.field,
        input.aggregation,
        JSON.stringify(input.filters),
        input.timeGrouping,
        input.groupByDimension,
        input.compareEnabled,
        input.displayType,
        input.status,
      ]
    )
    void actorUserId
    const row = result.rows[0]
    return row ? mapKpi(row) : null
  }

  async deleteKpi(organizationId: string, id: string): Promise<boolean> {
    const result = await this.db.query(
      "delete from kpis where organization_id = $1 and id = $2 and is_system = false",
      [organizationId, id]
    )
    return (result.rowCount ?? 0) > 0
  }

  private async listWidgets(reportId: string): Promise<ReportWidgetRef[]> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from report_widgets where report_id = $1 order by (position->>'order')::int asc",
      [reportId]
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      kpiId: String(row.kpi_id),
      order: Number((row.position as { order?: number } | null)?.order ?? 0),
    }))
  }

  async listCustomReports(
    organizationId: string,
    isSystem: boolean
  ): Promise<CustomReportDefinition[]> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from custom_reports where organization_id = $1 and is_system = $2 order by created_at desc",
      [organizationId, isSystem]
    )
    const reports = await Promise.all(
      result.rows.map(async (row) => mapCustomReport(row, await this.listWidgets(String(row.id))))
    )
    return reports
  }

  async findCustomReport(
    organizationId: string,
    id: string
  ): Promise<CustomReportDefinition | null> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from custom_reports where organization_id = $1 and id = $2",
      [organizationId, id]
    )
    const row = result.rows[0]
    if (!row) {
      return null
    }
    return mapCustomReport(row, await this.listWidgets(id))
  }

  async createCustomReport(
    organizationId: string,
    actorUserId: string,
    input: SaveCustomReportInput,
    isSystem: boolean
  ): Promise<CustomReportDefinition> {
    const id = randomUUID()
    const result = await this.db.query<Record<string, unknown>>(
      `insert into custom_reports (
        id, organization_id, workspace_id, name, description, category, default_filters,
        display_options, sharing, is_system, status, created_by_user_id, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,now(),now()
      ) returning *`,
      [
        id,
        organizationId,
        input.workspaceId,
        input.name,
        input.description,
        input.category,
        JSON.stringify(input.defaultFilters),
        JSON.stringify(input.displayOptions),
        input.sharing,
        isSystem,
        input.status,
        actorUserId,
      ]
    )
    await this.replaceWidgets(id, input.widgets)
    return mapCustomReport(result.rows[0], await this.listWidgets(id))
  }

  async updateCustomReport(
    organizationId: string,
    id: string,
    input: SaveCustomReportInput
  ): Promise<CustomReportDefinition | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `update custom_reports set
        workspace_id = $3, name = $4, description = $5, category = $6,
        default_filters = $7::jsonb, display_options = $8::jsonb, sharing = $9, status = $10,
        updated_at = now()
      where organization_id = $1 and id = $2
      returning *`,
      [
        organizationId,
        id,
        input.workspaceId,
        input.name,
        input.description,
        input.category,
        JSON.stringify(input.defaultFilters),
        JSON.stringify(input.displayOptions),
        input.sharing,
        input.status,
      ]
    )
    const row = result.rows[0]
    if (!row) {
      return null
    }
    await this.replaceWidgets(id, input.widgets)
    return mapCustomReport(row, await this.listWidgets(id))
  }

  async deleteCustomReport(organizationId: string, id: string): Promise<boolean> {
    const result = await this.db.query(
      "delete from custom_reports where organization_id = $1 and id = $2 and is_system = false",
      [organizationId, id]
    )
    return (result.rowCount ?? 0) > 0
  }

  private async replaceWidgets(
    reportId: string,
    widgets: SaveCustomReportInput["widgets"]
  ): Promise<void> {
    await this.db.query("delete from report_widgets where report_id = $1", [reportId])
    for (const widget of widgets) {
      await this.db.query(
        `insert into report_widgets (id, report_id, kpi_id, position, created_at)
         values ($1, $2, $3, $4::jsonb, now())`,
        [randomUUID(), reportId, widget.kpiId, JSON.stringify({ order: widget.order })]
      )
    }
  }
}
