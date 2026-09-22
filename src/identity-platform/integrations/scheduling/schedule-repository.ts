import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"

export interface ConnectionSyncScheduleView {
  id: string
  organizationId: string
  workspaceId: string | null
  providerId: string
  connectionId: string
  enabled: boolean
  frequencyMinutes: number | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastRunStatus: "completed" | "failed" | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export interface UpsertScheduleInput {
  organizationId: string
  workspaceId: string | null
  providerId: string
  connectionId: string
  enabled: boolean
  frequencyMinutes: number | null
  customCron: string | null
  activeDays: number[]
  startTimeLocal: string
  timezone: string
  retryOnConnectionFailure: boolean
  retryMaxAttempts: number
  notifyOnFailure: boolean
  nextRunAt: string
  actorUserId: string
}

function toJsonDate(value: unknown): string | null {
  if (!value) {
    return null
  }
  return new Date(value as string).toISOString()
}

function mapSchedule(row: Record<string, unknown>): ConnectionSyncScheduleView {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    workspaceId: (row.workspace_id as string | null) ?? null,
    providerId: String(row.provider_id),
    connectionId: String(row.connection_id),
    enabled: Boolean(row.enabled),
    frequencyMinutes: row.frequency_minutes === null ? null : Number(row.frequency_minutes),
    customCron: (row.custom_cron as string | null) ?? null,
    activeDays: Array.isArray(row.active_days) ? (row.active_days as number[]).map(Number) : [],
    startTimeLocal: String(row.start_time_local).slice(0, 5),
    timezone: String(row.timezone),
    retryOnConnectionFailure: Boolean(row.retry_on_connection_failure),
    retryMaxAttempts: Number(row.retry_max_attempts),
    notifyOnFailure: Boolean(row.notify_on_failure),
    nextRunAt: toJsonDate(row.next_run_at as string | null),
    lastRunAt: toJsonDate(row.last_run_at as string | null),
    lastRunStatus: (row.last_run_status as "completed" | "failed" | null) ?? null,
    createdByUserId: String(row.created_by_user_id),
    createdAt: toJsonDate(row.created_at) ?? new Date().toISOString(),
    updatedAt: toJsonDate(row.updated_at) ?? new Date().toISOString(),
  }
}

export class ConnectionSyncScheduleRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findByConnection(
    providerId: string,
    connectionId: string
  ): Promise<ConnectionSyncScheduleView | null> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from connection_sync_schedules where provider_id = $1 and connection_id = $2 limit 1",
      [providerId, connectionId]
    )
    const row = result.rows[0]
    return row ? mapSchedule(row) : null
  }

  // Every real, enabled schedule for the organization, in one query -- lets the connections
  // overview list show a real "next sync" per row without an N+1 call per connection (the
  // single-connection findByConnection above stays the settings page's own lookup). Filters by
  // organization_id alone in SQL and applies enabled/next_run_at in JS afterwards -- combining
  // those predicates with the partial index on (next_run_at) where enabled = true (see migration
  // 081) intermittently made pg-mem's test-only query planner return zero rows for a matching
  // row; a per-organization row count is small enough that filtering after the fetch is cheap
  // and sidesteps the planner entirely.
  async listByOrganization(organizationId: string): Promise<ConnectionSyncScheduleView[]> {
    const result = await this.db.query<Record<string, unknown>>(
      "select * from connection_sync_schedules where organization_id = $1",
      [organizationId]
    )
    return result.rows
      .filter((row) => Boolean(row.enabled) && row.next_run_at !== null)
      .map(mapSchedule)
  }

  async upsert(input: UpsertScheduleInput): Promise<ConnectionSyncScheduleView> {
    const result = await this.db.query<Record<string, unknown>>(
      `
      insert into connection_sync_schedules (
        id, organization_id, workspace_id, provider_id, connection_id, enabled,
        frequency_minutes, custom_cron, active_days, start_time_local, timezone,
        retry_on_connection_failure, retry_max_attempts, notify_on_failure,
        next_run_at, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::smallint[],$10::time,$11,$12,$13,$14,$15,$16,$16,now(),now()
      )
      on conflict (provider_id, connection_id) do update set
        workspace_id = excluded.workspace_id,
        enabled = excluded.enabled,
        frequency_minutes = excluded.frequency_minutes,
        custom_cron = excluded.custom_cron,
        active_days = excluded.active_days,
        start_time_local = excluded.start_time_local,
        timezone = excluded.timezone,
        retry_on_connection_failure = excluded.retry_on_connection_failure,
        retry_max_attempts = excluded.retry_max_attempts,
        notify_on_failure = excluded.notify_on_failure,
        next_run_at = excluded.next_run_at,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now()
      returning *
      `,
      [
        randomUUID(),
        input.organizationId,
        input.workspaceId,
        input.providerId,
        input.connectionId,
        input.enabled,
        input.frequencyMinutes,
        input.customCron,
        input.activeDays,
        input.startTimeLocal,
        input.timezone,
        input.retryOnConnectionFailure,
        input.retryMaxAttempts,
        input.notifyOnFailure,
        input.nextRunAt,
        input.actorUserId,
      ]
    )

    return mapSchedule(result.rows[0])
  }

  async listDue(now: string, limit: number): Promise<ConnectionSyncScheduleView[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `
      select * from connection_sync_schedules
      where enabled = true and next_run_at is not null and next_run_at <= $1::timestamptz
      order by next_run_at asc
      limit $2
      `,
      [now, limit]
    )
    return result.rows.map(mapSchedule)
  }

  async recordRunResult(input: { id: string; status: "completed" | "failed"; nextRunAt: string }) {
    await this.db.query(
      `
      update connection_sync_schedules
      set last_run_at = now(), last_run_status = $2, next_run_at = $3::timestamptz, updated_at = now()
      where id = $1
      `,
      [input.id, input.status, input.nextRunAt]
    )
  }
}
