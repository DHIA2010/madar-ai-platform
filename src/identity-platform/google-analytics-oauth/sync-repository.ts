import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { IntegrationRecordView, IntegrationSyncRunView } from "../integrations/provider-models"

function toJsonDate(value: unknown): string | null {
  if (!value) {
    return null
  }
  return new Date(value as string).toISOString()
}

function mapRun(row: Record<string, unknown>): IntegrationSyncRunView {
  return {
    id: String(row.id),
    connectionId: String(row.connection_id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    projectId: String(row.project_id),
    customerId: String(row.customer_id),
    dateStart: String(row.date_start),
    dateEnd: String(row.date_end),
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as IntegrationSyncRunView["status"],
    metrics: (row.metrics as Record<string, number>) ?? {},
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: toJsonDate(row.started_at),
    completedAt: toJsonDate(row.completed_at),
    createdAt: toJsonDate(row.created_at) ?? new Date().toISOString(),
    updatedAt: toJsonDate(row.updated_at) ?? new Date().toISOString(),
  }
}

function mapRecord(row: Record<string, unknown>): IntegrationRecordView {
  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    customerId: String(row.customer_id),
    entityId: String(row.entity_id),
    recordDate: String(row.record_date),
    payload: (row.payload as Record<string, unknown>) ?? {},
    updatedAt: toJsonDate(row.updated_at) ?? new Date().toISOString(),
  }
}

export interface GoogleAnalyticsSyncRecordInput {
  entityType: "traffic" | "events" | "conversions"
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
}

export class GoogleAnalyticsSyncRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async withTransaction<T>(work: () => Promise<T>) {
    return this.db.withTransaction(work)
  }

  async createOrLoadSyncRun(input: {
    connectionId: string
    organizationId: string
    workspaceId: string | null
    projectId: string
    customerId: string
    startDate: string
    endDate: string
    idempotencyKey: string
    actorUserId: string
  }): Promise<IntegrationSyncRunView> {
    const inserted = await this.db.query<Record<string, unknown>>(
      `
      insert into google_analytics_sync_runs (
        id, connection_id, organization_id, workspace_id, project_id, customer_id,
        date_start, date_end, idempotency_key, status, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,'pending',$10,$10,now(),now()
      )
      on conflict (connection_id, idempotency_key)
      do update set updated_at = now(), updated_by_user_id = $10
      returning *
      `,
      [
        randomUUID(),
        input.connectionId,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.customerId,
        input.startDate,
        input.endDate,
        input.idempotencyKey,
        input.actorUserId,
      ]
    )

    return mapRun(inserted.rows[0])
  }

  async findSyncRunById(syncRunId: string) {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from google_analytics_sync_runs where id = $1 limit 1",
      [syncRunId]
    )
    return result.rows[0] ? mapRun(result.rows[0]) : null
  }

  async markSyncRunRunning(syncRunId: string, actorUserId: string) {
    await this.db.query(
      `
      update google_analytics_sync_runs
      set status = 'running', started_at = now(), error_code = null, error_message = null,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId]
    )
  }

  async markSyncRunCompleted(
    syncRunId: string,
    actorUserId: string,
    metrics: Record<string, number>
  ) {
    await this.db.query(
      `
      update google_analytics_sync_runs
      set status = 'completed', completed_at = now(), metrics = $3::jsonb,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId, JSON.stringify(metrics)]
    )
  }

  async markSyncRunFailed(
    syncRunId: string,
    actorUserId: string,
    errorCode: string,
    errorMessage: string
  ) {
    await this.db.query(
      `
      update google_analytics_sync_runs
      set status = 'failed', error_code = $3, error_message = $4,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId, errorCode, errorMessage.slice(0, 240)]
    )
  }

  async upsertRecords(input: {
    connectionId: string
    customerId: string
    records: GoogleAnalyticsSyncRecordInput[]
  }): Promise<number> {
    let written = 0
    for (const record of input.records) {
      await this.db.query(
        `
        insert into google_analytics_records (
          id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6::date,$7::jsonb,now(),now()
        )
        on conflict (connection_id, entity_type, entity_id)
        do update set
          record_date = excluded.record_date,
          payload = excluded.payload,
          updated_at = now()
        `,
        [
          randomUUID(),
          input.connectionId,
          input.customerId,
          record.entityType,
          record.entityId,
          record.recordDate,
          JSON.stringify(record.payload),
        ]
      )
      written += 1
    }
    return written
  }

  async listRecords(query: {
    connectionId: string
    customerId: string
    entityType?: string
    startDate?: string
    endDate?: string
    pageSize?: number
  }): Promise<IntegrationRecordView[]> {
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 100, 1000))

    const result = await this.db.query<Record<string, unknown>>(
      `
      select *
      from google_analytics_records
      where connection_id = $1
        and customer_id = $2
        and ($3::varchar is null or entity_type = $3)
        and ($4::date is null or record_date >= $4::date)
        and ($5::date is null or record_date <= $5::date)
      order by record_date desc, updated_at desc
      limit $6
      `,
      [
        query.connectionId,
        query.customerId,
        query.entityType ?? null,
        query.startDate ?? null,
        query.endDate ?? null,
        pageSize,
      ]
    )

    return result.rows.map(mapRecord)
  }
}
