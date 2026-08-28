import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ProviderSyncRepository } from "../integrations/provider-repositories"

import type { GoogleAdsEntityType, GoogleAdsNormalizedBundle } from "./models"
import type { GoogleAdsRecordQuery, GoogleAdsRecordView, GoogleAdsSyncRunView } from "./types"
import { IntegrationConnectionMissing } from "./errors"

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

export interface MarketingCampaignRecord {
  id: string
  integrationConnectionId: string
  organizationId: string
  workspaceId: string | null
  projectId: string
  providerId: string
  providerFamily: string
  providerAccountId: string
  externalCustomerId: string
  providerEntityId: string
  name: string
  status: string
  channel: string | null
  objective: string | null
  budgetMicros: number | null
  currencyCode: string | null
  startDate: string | null
  endDate: string | null
  sourceUpdatedAt: string | null
  syncedAt: string
  createdAt: string
  updatedAt: string
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

export class GoogleAdsRepository implements ProviderSyncRepository<
  GoogleAdsNormalizedBundle,
  GoogleAdsRecordQuery,
  GoogleAdsRecordView
> {
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

  async findLatestSyncRunByConnection(connectionId: string) {
    const result = await this.db.query<Record<string, unknown>>(
      `
      select *
      from google_ads_sync_runs
      where connection_id = $1
      order by created_at desc
      limit 1
      `,
      [connectionId]
    )

    return result.rows[0] ? mapRun(result.rows[0]) : null
  }

  async hasActiveSyncLock(input: { providerKey: string; connectionId: string; projectId: string }) {
    const result = await this.db.query<{ active: boolean }>(
      `
      select exists(
        select 1
        from google_ads_sync_locks
        where provider_key = $1
          and connection_id = $2
          and project_id = $3
          and locked_until > now()
      ) as active
      `,
      [input.providerKey, input.connectionId, input.projectId]
    )

    return Boolean(result.rows[0]?.active)
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

  async markSyncRunCompleted(
    syncRunId: string,
    actorUserId: string,
    metrics: Record<string, number>
  ) {
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

  async markSyncRunFailed(
    syncRunId: string,
    actorUserId: string,
    errorCode: string,
    errorMessage: string
  ) {
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
    const now = Date.now()
    const lockedUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString()
    const existing = await this.db.query<Record<string, unknown>>(
      `
      select *
      from google_ads_sync_locks
      where provider_key = $1
        and connection_id = $2
        and project_id = $3
      limit 1
      `,
      [input.providerKey, input.connectionId, input.projectId]
    )

    const current = existing.rows[0]
    if (current) {
      const currentLockedUntil = new Date(String(current.locked_until)).getTime()
      if (!Number.isNaN(currentLockedUntil) && currentLockedUntil > now) {
        return null
      }

      const refreshed = await this.db.query<Record<string, unknown>>(
        `
        update google_ads_sync_locks
        set lock_token = $2,
            organization_id = $3,
            locked_until = $4::timestamptz,
            updated_by_user_id = $5,
            updated_at = now()
        where id = $1
          and lock_token = $6
        returning *
        `,
        [
          String(current.id),
          lockToken,
          input.organizationId,
          lockedUntil,
          input.actorUserId,
          String(current.lock_token),
        ]
      )

      const refreshedRow = refreshed.rows[0]
      if (!refreshedRow) {
        return null
      }

      return {
        id: String(refreshedRow.id),
        providerKey: String(refreshedRow.provider_key),
        connectionId: String(refreshedRow.connection_id),
        projectId: String(refreshedRow.project_id),
        organizationId: String(refreshedRow.organization_id),
        lockToken: String(refreshedRow.lock_token),
        lockedUntil:
          toJsonDate((refreshedRow.locked_until as string | null) ?? null) ??
          new Date().toISOString(),
      }
    }

    const inserted = await this.db.query<Record<string, unknown>>(
      `
      insert into google_ads_sync_locks (
        id, provider_key, connection_id, project_id, organization_id, lock_token, locked_until, created_by_user_id, updated_by_user_id, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $8, now(), now()
      )
      on conflict (provider_key, connection_id, project_id)
      do nothing
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

    const row = inserted.rows[0]
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
      lockedUntil:
        toJsonDate((row.locked_until as string | null) ?? null) ?? new Date().toISOString(),
    }
  }

  async extendSyncLock(input: {
    providerKey: string
    connectionId: string
    projectId: string
    lockToken: string
    leaseSeconds?: number
  }) {
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
          lockedUntil:
            toJsonDate((result.rows[0].locked_until as string | null) ?? null) ??
            new Date().toISOString(),
        }
      : null
  }

  async releaseSyncLock(input: {
    providerKey: string
    connectionId: string
    projectId: string
    lockToken: string
  }) {
    await this.db.query(
      `
      delete from google_ads_sync_locks
      where provider_key = $1 and connection_id = $2 and project_id = $3 and lock_token = $4
      `,
      [input.providerKey, input.connectionId, input.projectId, input.lockToken]
    )
  }

  async listMarketingCampaigns(input: { connectionId: string; externalCustomerId: string }) {
    const result = await this.db.query<Record<string, unknown>>(
      `
      select *
      from marketing_campaigns
      where integration_connection_id = $1
        and external_customer_id = $2
      order by provider_entity_id asc
      `,
      [input.connectionId, input.externalCustomerId]
    )

    return result.rows.map(
      (row) =>
        ({
          id: String(row.id),
          integrationConnectionId: String(row.integration_connection_id),
          organizationId: String(row.organization_id),
          workspaceId: (row.workspace_id as string | null) ?? null,
          projectId: String(row.project_id),
          providerId: String(row.provider_id),
          providerFamily: String(row.provider_family),
          providerAccountId: String(row.provider_account_id),
          externalCustomerId: String(row.external_customer_id),
          providerEntityId: String(row.provider_entity_id),
          name: String(row.name),
          status: String(row.status),
          channel: (row.channel as string | null) ?? null,
          objective: (row.objective as string | null) ?? null,
          budgetMicros:
            row.budget_micros === null || row.budget_micros === undefined
              ? null
              : Number(row.budget_micros),
          currencyCode: (row.currency_code as string | null) ?? null,
          startDate:
            row.start_date instanceof Date
              ? row.start_date.toISOString().slice(0, 10)
              : ((row.start_date as string | null) ?? null),
          endDate:
            row.end_date instanceof Date
              ? row.end_date.toISOString().slice(0, 10)
              : ((row.end_date as string | null) ?? null),
          sourceUpdatedAt: toJsonDate((row.source_updated_at as string | null) ?? null),
          syncedAt:
            toJsonDate((row.synced_at as string | null) ?? null) ?? new Date().toISOString(),
          createdAt:
            toJsonDate((row.created_at as string | null) ?? null) ?? new Date().toISOString(),
          updatedAt:
            toJsonDate((row.updated_at as string | null) ?? null) ?? new Date().toISOString(),
        }) satisfies MarketingCampaignRecord
    )
  }

  async upsertMarketingCampaign(input: MarketingCampaignRecord) {
    await this.db.query(
      `
      insert into marketing_campaigns (
        id, integration_connection_id, organization_id, workspace_id, project_id,
        provider_id, provider_family, provider_account_id, external_customer_id,
        provider_entity_id, name, status, channel, objective, budget_micros,
        currency_code, start_date, end_date, source_updated_at, synced_at, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,
        $16,$17::date,$18::date,$19,$20,$21,$22
      )
      on conflict (integration_connection_id, provider_entity_id)
      do update set
        provider_account_id = excluded.provider_account_id,
        external_customer_id = excluded.external_customer_id,
        name = excluded.name,
        status = excluded.status,
        channel = excluded.channel,
        objective = excluded.objective,
        budget_micros = excluded.budget_micros,
        currency_code = excluded.currency_code,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        source_updated_at = excluded.source_updated_at,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at
      `,
      [
        input.id,
        input.integrationConnectionId,
        input.organizationId,
        input.workspaceId,
        input.projectId,
        input.providerId,
        input.providerFamily,
        input.providerAccountId,
        input.externalCustomerId,
        input.providerEntityId,
        input.name,
        input.status,
        input.channel,
        input.objective,
        input.budgetMicros,
        input.currencyCode,
        input.startDate,
        input.endDate,
        input.sourceUpdatedAt,
        input.syncedAt,
        input.createdAt,
        input.updatedAt,
      ]
    )
  }

  async markMarketingCampaignInactive(input: { campaignId: string; syncedAt: string }) {
    await this.db.query(
      `
      update marketing_campaigns
      set status = 'INACTIVE',
          synced_at = $2,
          updated_at = $2
      where id = $1
      `,
      [input.campaignId, input.syncedAt]
    )
  }

  async touchIntegrationConnectionSynced(input: { connectionId: string; syncedAt: string }) {
    await this.db.query(
      `
      update integration_connections
      set status = 'connected',
          last_synced_at = $2,
          updated_at = $2
      where id = $1
        and provider_id = 'google-ads'
      `,
      [input.connectionId, input.syncedAt]
    )
  }

  async validateIntegrationConnection(input: {
    connectionId: string
    providerId: string
    providerFamily: string
    platform: string
    organizationId: string
    workspaceId: string | null
    projectId: string
    dataSourceId: string | null
    status: string
    oauthAccountId: string | null
    connectionReference: string | null
    actorUserId: string
    nowIso: string
  }) {
    const found = await this.db.query<Record<string, unknown>>(
      `
      select *
      from integration_connections
      where id = $1
        and deleted_at is null
      limit 1
      `,
      [input.connectionId]
    )

    const row = found.rows[0]
    if (!row) {
      throw new IntegrationConnectionMissing({
        reason: "missing",
        connectionId: input.connectionId,
        providerId: input.providerId,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      })
    }

    const mismatches: string[] = []

    if (String(row.provider_id) !== input.providerId) {
      mismatches.push("provider_id")
    }
    if (String(row.provider_family) !== input.providerFamily) {
      mismatches.push("provider_family")
    }
    if (String(row.platform) !== input.platform) {
      mismatches.push("platform")
    }
    if (String(row.organization_id) !== input.organizationId) {
      mismatches.push("organization_id")
    }
    if (((row.workspace_id as string | null) ?? null) !== input.workspaceId) {
      mismatches.push("workspace_id")
    }
    if (String(row.project_id) !== input.projectId) {
      mismatches.push("project_id")
    }

    if (mismatches.length > 0) {
      throw new IntegrationConnectionMissing({
        reason: "mismatch",
        connectionId: input.connectionId,
        mismatches,
      })
    }
  }

  async loadSyncCheckpoint(input: {
    providerKey: string
    connectionId: string
    customerId: string
  }) {
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
          : ((row.last_record_date as string | null) ?? null),
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

    const metadataEntries: Array<{
      entityType: GoogleAdsEntityType
      entityId: string
      payload: object
    }> = []

    const metricsEntries: Array<{
      entityType: GoogleAdsEntityType
      entityId: string
      recordDate: string
      payload: object
      metricScope: "campaign" | "ad_group" | "ad" | "keyword" | "search_term" | "geo" | "device"
      campaignId: string | null
      adGroupId: string | null
      adId: string | null
      keywordId: string | null
      impressions: number
      clicks: number
      ctr: number
      costMicros: number
      averageCpc: number
      averageCpm: number
      conversions: number
      conversionValue: number
      searchImpressionShare: number | null
      searchTopImpressionShare: number | null
      searchAbsoluteTopImpressionShare: number | null
      activeViewImpressions: number | null
      activeViewMeasurableImpressions: number | null
      activeViewMeasurableCostMicros: number | null
      activeViewViewability: number | null
      videoViews: number | null
      videoQuartileP25Rate: number | null
      videoQuartileP50Rate: number | null
      videoQuartileP75Rate: number | null
      videoQuartileP100Rate: number | null
      averageWatchTimeSeconds: number | null
    }> = []

    for (const item of input.bundle.customers) {
      entries.push({
        entityType: "customer_account",
        entityId: item.id,
        recordDate: "1970-01-01",
        payload: item,
      })
      metadataEntries.push({ entityType: "customer_account", entityId: item.id, payload: item })
    }
    for (const item of input.bundle.campaigns) {
      entries.push({
        entityType: "campaign",
        entityId: item.id,
        recordDate: "1970-01-01",
        payload: item,
      })
      metadataEntries.push({ entityType: "campaign", entityId: item.id, payload: item })
    }
    for (const item of input.bundle.campaignMetrics) {
      entries.push({
        entityType: "campaign_metric",
        entityId: item.campaignId,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "campaign_metric",
        entityId: item.campaignId,
        recordDate: item.date,
        payload: item,
        metricScope: "campaign",
        campaignId: item.campaignId,
        adGroupId: null,
        adId: null,
        keywordId: null,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.ctr,
        costMicros: item.costMicros,
        averageCpc: item.cpcMicros,
        averageCpm: item.cpmMicros,
        conversions: item.conversions,
        conversionValue: item.conversionValue,
        searchImpressionShare: item.searchImpressionShare,
        searchTopImpressionShare: item.searchTopImpressionShare,
        searchAbsoluteTopImpressionShare: item.searchAbsoluteTopImpressionShare,
        activeViewImpressions: item.activeViewImpressions,
        activeViewMeasurableImpressions: item.activeViewMeasurableImpressions,
        activeViewMeasurableCostMicros: item.activeViewMeasurableCostMicros,
        activeViewViewability: item.activeViewViewability,
        videoViews: item.videoViews,
        videoQuartileP25Rate: item.videoQuartileP25Rate,
        videoQuartileP50Rate: item.videoQuartileP50Rate,
        videoQuartileP75Rate: item.videoQuartileP75Rate,
        videoQuartileP100Rate: item.videoQuartileP100Rate,
        averageWatchTimeSeconds: item.averageWatchTimeSeconds,
      })
    }
    for (const item of input.bundle.adGroups) {
      entries.push({
        entityType: "ad_group",
        entityId: item.id,
        recordDate: "1970-01-01",
        payload: item,
      })
      metadataEntries.push({ entityType: "ad_group", entityId: item.id, payload: item })
    }
    for (const item of input.bundle.adGroupMetrics) {
      entries.push({
        entityType: "ad_group_metric",
        entityId: item.adGroupId,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "ad_group_metric",
        entityId: item.adGroupId,
        recordDate: item.date,
        payload: item,
        metricScope: "ad_group",
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        adId: null,
        keywordId: null,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.ads) {
      entries.push({ entityType: "ad", entityId: item.id, recordDate: "1970-01-01", payload: item })
      metadataEntries.push({ entityType: "ad", entityId: item.id, payload: item })
    }
    for (const item of input.bundle.adMetrics) {
      entries.push({
        entityType: "ad_metric",
        entityId: item.adId,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "ad_metric",
        entityId: item.adId,
        recordDate: item.date,
        payload: item,
        metricScope: "ad",
        campaignId: item.campaignId,
        adGroupId: item.adGroupId,
        adId: item.adId,
        keywordId: null,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.keywords) {
      entries.push({
        entityType: "keyword",
        entityId: item.id,
        recordDate: "1970-01-01",
        payload: item,
      })
      metadataEntries.push({ entityType: "keyword", entityId: item.id, payload: item })
    }
    for (const item of input.bundle.keywordMetrics) {
      entries.push({
        entityType: "keyword_metric",
        entityId: item.keywordId,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "keyword_metric",
        entityId: item.keywordId,
        recordDate: item.date,
        payload: item,
        metricScope: "keyword",
        campaignId: null,
        adGroupId: null,
        adId: null,
        keywordId: item.keywordId,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.searchTerms) {
      entries.push({
        entityType: "search_term",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "search_term",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
        metricScope: "search_term",
        campaignId: null,
        adGroupId: null,
        adId: null,
        keywordId: item.keywordId,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.geoMetrics) {
      entries.push({
        entityType: "geo_metric",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "geo_metric",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
        metricScope: "geo",
        campaignId: null,
        adGroupId: null,
        adId: null,
        keywordId: null,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.deviceMetrics) {
      entries.push({
        entityType: "device_metric",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
      })
      metricsEntries.push({
        entityType: "device_metric",
        entityId: item.id,
        recordDate: item.date,
        payload: item,
        metricScope: "device",
        campaignId: null,
        adGroupId: null,
        adId: null,
        keywordId: null,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
        costMicros: item.costMicros,
        averageCpc: item.clicks > 0 ? Math.round(item.costMicros / item.clicks) : 0,
        averageCpm:
          item.impressions > 0 ? Math.round((item.costMicros * 1000) / item.impressions) : 0,
        conversions: item.conversions,
        conversionValue: 0,
        searchImpressionShare: null,
        searchTopImpressionShare: null,
        searchAbsoluteTopImpressionShare: null,
        activeViewImpressions: null,
        activeViewMeasurableImpressions: null,
        activeViewMeasurableCostMicros: null,
        activeViewViewability: null,
        videoViews: null,
        videoQuartileP25Rate: null,
        videoQuartileP50Rate: null,
        videoQuartileP75Rate: null,
        videoQuartileP100Rate: null,
        averageWatchTimeSeconds: null,
      })
    }
    for (const item of input.bundle.conversionActions) {
      entries.push({
        entityType: "conversion_action",
        entityId: item.id,
        recordDate: "1970-01-01",
        payload: item,
      })
      metadataEntries.push({ entityType: "conversion_action", entityId: item.id, payload: item })
    }

    for (const entry of metadataEntries) {
      if (entry.entityType === "customer_account") {
        const item = entry.payload as {
          id: string
          name: string
          currencyCode: string | null
          timeZone: string | null
        }
        await this.db.query(
          `
          insert into google_ads_customer_accounts (
            id, connection_id, customer_id, display_name, currency_code, time_zone,
            status, discovered_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,'active',now(),now()
          )
          on conflict (connection_id, customer_id)
          do update set
            display_name = excluded.display_name,
            currency_code = excluded.currency_code,
            time_zone = excluded.time_zone,
            status = 'active',
            updated_at = now()
          `,
          [randomUUID(), input.connectionId, item.id, item.name, item.currencyCode, item.timeZone]
        )
        continue
      }

      if (entry.entityType === "campaign") {
        const item = entry.payload as {
          id: string
          customerId: string
          name: string
          status: string
          channelType?: string | null
          biddingStrategyType?: string | null
          budgetMicros: number | null
          startDate?: string | null
          endDate?: string | null
        }
        await this.db.query(
          `
          insert into google_ads_campaigns (
            id, connection_id, customer_id, campaign_id, name, status, channel_type,
            bidding_strategy_type, budget_micros, start_date, end_date, payload, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12::jsonb,now(),now()
          )
          on conflict (connection_id, customer_id, campaign_id)
          do update set
            name = excluded.name,
            status = excluded.status,
            channel_type = excluded.channel_type,
            bidding_strategy_type = excluded.bidding_strategy_type,
            budget_micros = excluded.budget_micros,
            start_date = excluded.start_date,
            end_date = excluded.end_date,
            payload = excluded.payload,
            updated_at = now()
          `,
          [
            randomUUID(),
            input.connectionId,
            item.customerId,
            item.id,
            item.name,
            item.status,
            item.channelType ?? null,
            item.biddingStrategyType ?? null,
            item.budgetMicros,
            item.startDate ?? null,
            item.endDate ?? null,
            JSON.stringify(item),
          ]
        )
        continue
      }

      if (entry.entityType === "ad_group") {
        const item = entry.payload as {
          id: string
          customerId: string
          campaignId: string
          name: string
          status: string
        }
        await this.db.query(
          `
          insert into google_ads_ad_groups (
            id, connection_id, customer_id, ad_group_id, campaign_id, name, status, payload, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now()
          )
          on conflict (connection_id, customer_id, ad_group_id)
          do update set
            campaign_id = excluded.campaign_id,
            name = excluded.name,
            status = excluded.status,
            payload = excluded.payload,
            updated_at = now()
          `,
          [
            randomUUID(),
            input.connectionId,
            item.customerId,
            item.id,
            item.campaignId,
            item.name,
            item.status,
            JSON.stringify(item),
          ]
        )
        continue
      }

      if (entry.entityType === "ad") {
        const item = entry.payload as {
          id: string
          customerId: string
          campaignId: string
          adGroupId: string
          status: string
          type: string
          headline: string | null
        }
        await this.db.query(
          `
          insert into google_ads_ads (
            id, connection_id, customer_id, ad_id, campaign_id, ad_group_id, status, ad_type, headline, payload, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now(),now()
          )
          on conflict (connection_id, customer_id, ad_id)
          do update set
            campaign_id = excluded.campaign_id,
            ad_group_id = excluded.ad_group_id,
            status = excluded.status,
            ad_type = excluded.ad_type,
            headline = excluded.headline,
            payload = excluded.payload,
            updated_at = now()
          `,
          [
            randomUUID(),
            input.connectionId,
            item.customerId,
            item.id,
            item.campaignId,
            item.adGroupId,
            item.status,
            item.type,
            item.headline,
            JSON.stringify(item),
          ]
        )
        continue
      }

      if (entry.entityType === "keyword") {
        const item = entry.payload as {
          id: string
          customerId: string
          campaignId: string
          adGroupId: string
          text: string
          matchType: string
          status: string
          qualityScore: number | null
        }
        await this.db.query(
          `
          insert into google_ads_keywords (
            id, connection_id, customer_id, keyword_id, campaign_id, ad_group_id, keyword_text, match_type, status, quality_score, payload, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now(),now()
          )
          on conflict (connection_id, customer_id, keyword_id)
          do update set
            campaign_id = excluded.campaign_id,
            ad_group_id = excluded.ad_group_id,
            keyword_text = excluded.keyword_text,
            match_type = excluded.match_type,
            status = excluded.status,
            quality_score = excluded.quality_score,
            payload = excluded.payload,
            updated_at = now()
          `,
          [
            randomUUID(),
            input.connectionId,
            item.customerId,
            item.id,
            item.campaignId,
            item.adGroupId,
            item.text,
            item.matchType,
            item.status,
            item.qualityScore,
            JSON.stringify(item),
          ]
        )
        continue
      }

      if (entry.entityType === "conversion_action") {
        const item = entry.payload as {
          id: string
          customerId: string
          name: string
          category: string
          status: string
          type: string
        }
        await this.db.query(
          `
          insert into google_ads_conversion_actions (
            id, connection_id, customer_id, conversion_action_id, name, category, status, action_type, payload, created_at, updated_at
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),now()
          )
          on conflict (connection_id, customer_id, conversion_action_id)
          do update set
            name = excluded.name,
            category = excluded.category,
            status = excluded.status,
            action_type = excluded.action_type,
            payload = excluded.payload,
            updated_at = now()
          `,
          [
            randomUUID(),
            input.connectionId,
            item.customerId,
            item.id,
            item.name,
            item.category,
            item.status,
            item.type,
            JSON.stringify(item),
          ]
        )
      }
    }

    for (const metric of metricsEntries) {
      await this.db.query(
        `
        insert into google_ads_daily_metrics (
          id, connection_id, sync_run_id, customer_id, metric_scope, metric_entity_id,
          campaign_id, ad_group_id, ad_id, keyword_id, metric_date,
          impressions, clicks, ctr, cost_micros, average_cpc, average_cpm,
          conversions, conversion_value,
          search_impression_share, search_top_impression_share, search_absolute_top_impression_share,
          active_view_impressions, active_view_measurable_impressions, active_view_measurable_cost_micros,
          active_view_viewability, video_views,
          video_quartile_p25_rate, video_quartile_p50_rate, video_quartile_p75_rate, video_quartile_p100_rate,
          average_watch_time_seconds,
          payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11::date,
          $12,$13,$14,$15,$16,$17,
          $18,$19,
          $20,$21,$22,
          $23,$24,$25,
          $26,$27,
          $28,$29,$30,$31,
          $32,
          $33::jsonb,now(),now()
        )
        on conflict (connection_id, customer_id, metric_scope, metric_entity_id, metric_date)
        do update set
          sync_run_id = excluded.sync_run_id,
          campaign_id = excluded.campaign_id,
          ad_group_id = excluded.ad_group_id,
          ad_id = excluded.ad_id,
          keyword_id = excluded.keyword_id,
          impressions = excluded.impressions,
          clicks = excluded.clicks,
          ctr = excluded.ctr,
          cost_micros = excluded.cost_micros,
          average_cpc = excluded.average_cpc,
          average_cpm = excluded.average_cpm,
          conversions = excluded.conversions,
          conversion_value = excluded.conversion_value,
          search_impression_share = excluded.search_impression_share,
          search_top_impression_share = excluded.search_top_impression_share,
          search_absolute_top_impression_share = excluded.search_absolute_top_impression_share,
          active_view_impressions = excluded.active_view_impressions,
          active_view_measurable_impressions = excluded.active_view_measurable_impressions,
          active_view_measurable_cost_micros = excluded.active_view_measurable_cost_micros,
          active_view_viewability = excluded.active_view_viewability,
          video_views = excluded.video_views,
          video_quartile_p25_rate = excluded.video_quartile_p25_rate,
          video_quartile_p50_rate = excluded.video_quartile_p50_rate,
          video_quartile_p75_rate = excluded.video_quartile_p75_rate,
          video_quartile_p100_rate = excluded.video_quartile_p100_rate,
          average_watch_time_seconds = excluded.average_watch_time_seconds,
          payload = excluded.payload,
          updated_at = now()
        `,
        [
          randomUUID(),
          input.connectionId,
          input.syncRunId,
          input.customerId,
          metric.metricScope,
          metric.entityId,
          metric.campaignId,
          metric.adGroupId,
          metric.adId,
          metric.keywordId,
          metric.recordDate,
          metric.impressions,
          metric.clicks,
          metric.ctr,
          metric.costMicros,
          metric.averageCpc,
          metric.averageCpm,
          metric.conversions,
          metric.conversionValue,
          metric.searchImpressionShare,
          metric.searchTopImpressionShare,
          metric.searchAbsoluteTopImpressionShare,
          metric.activeViewImpressions,
          metric.activeViewMeasurableImpressions,
          metric.activeViewMeasurableCostMicros,
          metric.activeViewViewability,
          metric.videoViews,
          metric.videoQuartileP25Rate,
          metric.videoQuartileP50Rate,
          metric.videoQuartileP75Rate,
          metric.videoQuartileP100Rate,
          metric.averageWatchTimeSeconds,
          JSON.stringify(metric.payload),
        ]
      )
    }

    // Keep legacy records query compatibility by mirroring normalized rows.
    for (const entry of entries) {
      await this.db.query(
        `
        insert into google_ads_domain_records (
          id, connection_id, sync_run_id, entity_type, customer_id, entity_id, record_date, payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7::date,$8::jsonb,now(),now()
        )
        on conflict (connection_id, entity_type, customer_id, entity_id, record_date)
        do update set
          sync_run_id = excluded.sync_run_id,
          payload = excluded.payload,
          updated_at = now()
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
      const maxRecordDate =
        entries
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
        [
          randomUUID(),
          input.connectionId,
          input.customerId,
          entityType,
          maxRecordDate,
          lastSyncedAt,
        ]
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
