import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ProviderSyncRepository } from "../integrations/provider-repositories"

import type { GoogleAdsEntityType, GoogleAdsNormalizedBundle } from "./models"
import type { GoogleAdsRecordQuery, GoogleAdsRecordView, GoogleAdsSyncRunView } from "./types"

interface CreateSyncRunInput {
  connectionId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  customerId: string
  startDate: string
  endDate: string
  idempotencyKey: string
  actorUserId: string
}

interface SyncLockInput {
  providerKey: string
  connectionId: string
  projectId: string
  organizationId: string
  actorUserId: string
  leaseSeconds?: number
}

interface SyncCheckpointInput {
  providerKey: string
  connectionId: string
  customerId: string
  checkpointKey: string
  checkpointVersion: number
  checkpointState: Record<string, unknown>
  lastRecordDate: string | null
  syncRunId: string | null
  status: "in_progress" | "completed"
}

function toJsonDate(value: string | null) {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}

function mapRun(row: Record<string, unknown>): GoogleAdsSyncRunView {
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
    status: String(row.status) as GoogleAdsSyncRunView["status"],
    metrics: (row.metrics as Record<string, number>) ?? {},
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: toJsonDate((row.started_at as string | null) ?? null),
    completedAt: toJsonDate((row.completed_at as string | null) ?? null),
    createdAt: toJsonDate((row.created_at as string | null) ?? null) ?? new Date().toISOString(),
    updatedAt: toJsonDate((row.updated_at as string | null) ?? null) ?? new Date().toISOString(),
  }
}

export class GoogleAdsRepository
implements ProviderSyncRepository<GoogleAdsNormalizedBundle, GoogleAdsRecordQuery, GoogleAdsRecordView> {
  constructor(private readonly db: PostgresDatabase) {}

  async withTransaction<T>(work: () => Promise<T>) {
    return this.db.withTransaction(work)
  }

  async createOrLoadSyncRun(input: CreateSyncRunInput): Promise<GoogleAdsSyncRunView> {
    const inserted = await this.db.query<Record<string, unknown>>(
      `
      insert into google_ads_sync_runs (
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
      "select * from google_ads_sync_runs where id = $1 limit 1",
      [syncRunId]
    )

    return result.rows[0] ? mapRun(result.rows[0]) : null
  }

  async markSyncRunRunning(syncRunId: string, actorUserId: string) {
    await this.db.query(
      `
      update google_ads_sync_runs
      set status = 'running', started_at = now(), error_code = null, error_message = null,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId]
    )
  }

  async markSyncRunCompleted(syncRunId: string, actorUserId: string, metrics: Record<string, number>) {
    await this.db.query(
      `
      update google_ads_sync_runs
      set status = 'completed', completed_at = now(), metrics = $3::jsonb,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId, JSON.stringify(metrics)]
    )
  }

  async markSyncRunFailed(syncRunId: string, actorUserId: string, errorCode: string, errorMessage: string) {
    await this.db.query(
      `
      update google_ads_sync_runs
      set status = 'failed', error_code = $3, error_message = $4,
          updated_by_user_id = $2, updated_at = now()
      where id = $1
      `,
      [syncRunId, actorUserId, errorCode, errorMessage.slice(0, 240)]
    )
  }

  async acquireSyncLock(input: SyncLockInput) {
    const lockToken = randomUUID()
    const leaseSeconds = input.leaseSeconds ?? 3600
    const lockedUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString()
    const result = await this.db.withTransaction(async () => {
      const current = await this.db.query<Record<string, unknown>>(
        `
        select lock_token, locked_until
        from google_ads_sync_locks
        where provider_key = $1 and connection_id = $2 and project_id = $3
        limit 1
        `,
        [input.providerKey, input.connectionId, input.projectId]
      )

      const currentRow = current.rows[0]
      if (currentRow) {
        const currentLockedUntil = new Date(String(currentRow.locked_until)).getTime()
        if (Number.isFinite(currentLockedUntil) && currentLockedUntil > Date.now()) {
          return null
        }
      }

      return this.db.query<Record<string, unknown>>(
        `
        insert into google_ads_sync_locks (
          id, provider_key, connection_id, project_id, organization_id, lock_token, locked_until, created_by_user_id, updated_by_user_id, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $8, now(), now()
        )
        on conflict (provider_key, connection_id, project_id)
        do update set
          lock_token = excluded.lock_token,
          organization_id = excluded.organization_id,
          locked_until = excluded.locked_until,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = now()
        returning *
        `,
        [
          randomUUID(),
          input.providerKey,
          input.connectionId,
          input.projectId,
          input.organizationId,
          lockToken,
          lockedUntil,
          input.actorUserId,
        ]
      )
    })

    const row = result?.rows[0]
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      providerKey: String(row.provider_key),
      connectionId: String(row.connection_id),
      projectId: String(row.project_id),
      organizationId: String(row.organization_id),
      lockToken: String(row.lock_token),
      lockedUntil: toJsonDate((row.locked_until as string | null) ?? null) ?? new Date().toISOString(),
    }
  }

  async extendSyncLock(input: { providerKey: string; connectionId: string; projectId: string; lockToken: string; leaseSeconds?: number }) {
    const leaseSeconds = input.leaseSeconds ?? 3600
    const lockedUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString()
    const result = await this.db.query<Record<string, unknown>>(
      `
      update google_ads_sync_locks
      set locked_until = $5::timestamptz,
          updated_at = now()
      where provider_key = $1
        and connection_id = $2
        and project_id = $3
        and lock_token = $4
      returning *
      `,
      [input.providerKey, input.connectionId, input.projectId, input.lockToken, lockedUntil]
    )

    return result.rows[0]
      ? {
          id: String(result.rows[0].id),
          lockedUntil: toJsonDate((result.rows[0].locked_until as string | null) ?? null) ?? new Date().toISOString(),
        }
      : null
  }

  async releaseSyncLock(input: { providerKey: string; connectionId: string; projectId: string; lockToken: string }) {
    await this.db.query(
      `
      delete from google_ads_sync_locks
      where provider_key = $1 and connection_id = $2 and project_id = $3 and lock_token = $4
      `,
      [input.providerKey, input.connectionId, input.projectId, input.lockToken]
    )
  }

  async loadSyncCheckpoint(input: { providerKey: string; connectionId: string; customerId: string }) {
    const result = await this.db.query<Record<string, unknown>>(
      `
      select *
      from google_ads_sync_checkpoints
      where provider_key = $1 and connection_id = $2 and customer_id = $3
      order by checkpoint_version desc, updated_at desc
      limit 1
      `,
      [input.providerKey, input.connectionId, input.customerId]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      providerKey: String(row.provider_key),
      connectionId: String(row.connection_id),
      customerId: String(row.customer_id),
      checkpointKey: String(row.checkpoint_key),
      checkpointVersion: Number(row.checkpoint_version),
      checkpointState: (row.checkpoint_state as Record<string, unknown>) ?? {},
      lastRecordDate:
        row.last_record_date instanceof Date
          ? row.last_record_date.toISOString().slice(0, 10)
          : (row.last_record_date as string | null) ?? null,
      syncRunId: (row.sync_run_id as string | null) ?? null,
      status: String(row.status) as "in_progress" | "completed",
      updatedAt: toJsonDate((row.updated_at as string | null) ?? null) ?? new Date().toISOString(),
    }
  }

  async saveSyncCheckpoint(input: SyncCheckpointInput) {
    await this.db.query(
      `
      insert into google_ads_sync_checkpoints (
        id, provider_key, connection_id, customer_id, checkpoint_key, checkpoint_version,
        checkpoint_state, last_record_date, sync_run_id, status, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7::jsonb,$8::date,$9,$10,now(),now()
      )
      on conflict (provider_key, connection_id, customer_id, checkpoint_key)
      do update set
        checkpoint_version = excluded.checkpoint_version,
        checkpoint_state = excluded.checkpoint_state,
        last_record_date = excluded.last_record_date,
        sync_run_id = excluded.sync_run_id,
        status = excluded.status,
        updated_at = now()
      `,
      [
        randomUUID(),
        input.providerKey,
        input.connectionId,
        input.customerId,
        input.checkpointKey,
        input.checkpointVersion,
        JSON.stringify(input.checkpointState),
        input.lastRecordDate,
        input.syncRunId,
        input.status,
      ]
    )
  }

  async upsertBundle(input: {
    syncRunId: string
    connectionId: string
    customerId: string
    bundle: GoogleAdsNormalizedBundle
  }) {
    const entries: Array<{
      entityType: GoogleAdsEntityType
      entityId: string
      recordDate: string
      payload: object
    }> = []

    for (const item of input.bundle.customers) {
      entries.push({ entityType: "customer_account", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }
    for (const item of input.bundle.campaigns) {
      entries.push({ entityType: "campaign", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }
    for (const item of input.bundle.campaignMetrics) {
      entries.push({ entityType: "campaign_metric", entityId: item.campaignId, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.adGroups) {
      entries.push({ entityType: "ad_group", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }
    for (const item of input.bundle.adGroupMetrics) {
      entries.push({ entityType: "ad_group_metric", entityId: item.adGroupId, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.ads) {
      entries.push({ entityType: "ad", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }
    for (const item of input.bundle.adMetrics) {
      entries.push({ entityType: "ad_metric", entityId: item.adId, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.keywords) {
      entries.push({ entityType: "keyword", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }
    for (const item of input.bundle.keywordMetrics) {
      entries.push({ entityType: "keyword_metric", entityId: item.keywordId, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.searchTerms) {
      entries.push({ entityType: "search_term", entityId: item.id, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.geoMetrics) {
      entries.push({ entityType: "geo_metric", entityId: item.id, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.deviceMetrics) {
      entries.push({ entityType: "device_metric", entityId: item.id, recordDate: item.date, payload: item })
    }
    for (const item of input.bundle.conversionActions) {
      entries.push({ entityType: "conversion_action", entityId: item.id, recordDate: "1970-01-01", payload: item })
    }

    for (const entry of entries) {
      await this.db.query(
        `
        insert into google_ads_domain_records (
          id, connection_id, sync_run_id, entity_type, customer_id, entity_id, record_date, payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7::date,$8::jsonb,now(),now()
        )
        on conflict (connection_id, entity_type, customer_id, entity_id, record_date)
        do update set sync_run_id = excluded.sync_run_id, payload = excluded.payload, updated_at = now()
        `,
        [
          randomUUID(),
          input.connectionId,
          input.syncRunId,
          entry.entityType,
          input.customerId,
          entry.entityId,
          entry.recordDate,
          JSON.stringify(entry.payload),
        ]
      )
    }

    const lastSyncedAt = new Date().toISOString()
    for (const entityType of new Set(entries.map((entry) => entry.entityType))) {
      const maxRecordDate = entries
        .filter((entry) => entry.entityType === entityType)
        .map((entry) => entry.recordDate)
        .sort()
        .at(-1) ?? null

      await this.db.query(
        `
        insert into google_ads_sync_cursors (
          id, connection_id, customer_id, entity_type, last_record_date, last_synced_at, created_at, updated_at
        ) values ($1,$2,$3,$4,$5::date,$6,now(),now())
        on conflict (connection_id, customer_id, entity_type)
        do update set last_record_date = excluded.last_record_date, last_synced_at = excluded.last_synced_at, updated_at = now()
        `,
        [randomUUID(), input.connectionId, input.customerId, entityType, maxRecordDate, lastSyncedAt]
      )
    }

    return entries.length
  }

  async listRecords(query: GoogleAdsRecordQuery): Promise<GoogleAdsRecordView[]> {
    const conditions = ["connection_id = $1", "customer_id = $2"]
    const values: unknown[] = [query.connectionId, query.customerId]

    if (query.entityType) {
      values.push(query.entityType)
      conditions.push(`entity_type = $${values.length}`)
    }

    if (query.startDate) {
      values.push(query.startDate)
      conditions.push(`record_date >= $${values.length}::date`)
    }

    if (query.endDate) {
      values.push(query.endDate)
      conditions.push(`record_date <= $${values.length}::date`)
    }

    values.push(Math.min(Math.max(query.pageSize ?? 100, 1), 1000))

    const rows = await this.db.query<{
      id: string
      entity_type: GoogleAdsEntityType
      customer_id: string
      entity_id: string
      record_date: string | Date
      payload: Record<string, unknown>
      updated_at: string
    }>(
      `
      select id, entity_type, customer_id, entity_id, record_date, payload, updated_at
      from google_ads_domain_records
      where ${conditions.join(" and ")}
      order by updated_at desc
      limit $${values.length}
      `,
      values
    )

    return rows.rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      customerId: row.customer_id,
      entityId: row.entity_id,
      recordDate:
        row.record_date instanceof Date
          ? row.record_date.toISOString().slice(0, 10)
          : String(row.record_date),
      payload: row.payload,
      updatedAt: new Date(row.updated_at).toISOString(),
    }))
  }
}
