import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { normalizeUtmValue } from "../tracking/utm"

import type {
  CampaignPlatform,
  CampaignStatus,
  CampaignView,
  CreateNativeCampaignInput,
  ImportedCampaignInput,
} from "./types"

export interface RawPlatformCampaign {
  connectionId: string
  workspaceId: string | null
  advertisingAccountId: string
  externalCampaignId: string
  displayName: string
  rawStatus: string | null
  objective: string | null
  startDate: string | null
  endDate: string | null
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toDateOnly(value: unknown): string | null {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

interface CampaignRow {
  id: string
  organization_id: string
  workspace_id: string | null
  source: string
  platform: string | null
  advertising_account_id: string | null
  external_campaign_id: string | null
  display_name: string
  normalized_name: string
  status: string
  objective: string | null
  budget_currency: string | null
  budget_amount: string | number | null
  start_date: Date | string | null
  end_date: Date | string | null
  imported_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

function mapCampaign(row: CampaignRow): CampaignView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    source: row.source as CampaignView["source"],
    platform: row.platform as CampaignPlatform | null,
    advertisingAccountId: row.advertising_account_id,
    externalCampaignId: row.external_campaign_id,
    displayName: row.display_name,
    normalizedName: row.normalized_name,
    status: row.status as CampaignStatus,
    objective: row.objective,
    budgetCurrency: row.budget_currency,
    budgetAmount: toNumber(row.budget_amount),
    startDate: toDateOnly(row.start_date),
    endDate: toDateOnly(row.end_date),
    importedAt: toIso(row.imported_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

const CAMPAIGN_SELECT = `
  SELECT id, organization_id, workspace_id, source, platform, advertising_account_id,
    external_campaign_id, display_name, normalized_name, status, objective,
    budget_currency, budget_amount, start_date, end_date, imported_at, created_at, updated_at
  FROM campaigns
`

export class CampaignRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(organizationId: string, workspaceId: string | null): Promise<CampaignView[]> {
    const result = await this.database.query<CampaignRow>(
      `${CAMPAIGN_SELECT}
       WHERE organization_id = $1 AND deleted_at IS NULL
         AND ($2::uuid IS NULL OR workspace_id = $2)
       ORDER BY created_at DESC`,
      [organizationId, workspaceId]
    )
    return result.rows.map(mapCampaign)
  }

  async listImported(organizationId: string, platform?: CampaignPlatform): Promise<CampaignView[]> {
    const result = await this.database.query<CampaignRow>(
      `${CAMPAIGN_SELECT}
       WHERE organization_id = $1 AND deleted_at IS NULL AND source = 'imported'
         AND ($2::text IS NULL OR platform = $2)
       ORDER BY created_at DESC`,
      [organizationId, platform ?? null]
    )
    return result.rows.map(mapCampaign)
  }

  async findById(organizationId: string, id: string): Promise<CampaignView | null> {
    const result = await this.database.query<CampaignRow>(
      `${CAMPAIGN_SELECT} WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [organizationId, id]
    )
    return result.rows[0] ? mapCampaign(result.rows[0]) : null
  }

  async createNative(input: CreateNativeCampaignInput): Promise<CampaignView> {
    const id = randomUUID()
    const result = await this.database.query<CampaignRow>(
      `INSERT INTO campaigns (
         id, organization_id, workspace_id, source, display_name, normalized_name, status,
         objective, budget_currency, budget_amount, start_date, end_date
       ) VALUES ($1, $2, $3, 'native', $4, $5, 'active', $6, $7, $8, $9, $10)
       RETURNING id, organization_id, workspace_id, source, platform, advertising_account_id,
         external_campaign_id, display_name, normalized_name, status, objective,
         budget_currency, budget_amount, start_date, end_date, imported_at, created_at, updated_at`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.displayName,
        normalizeUtmValue(input.displayName),
        input.objective ?? null,
        input.budgetCurrency ?? null,
        input.budgetAmount ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
      ]
    )
    return mapCampaign(result.rows[0])
  }

  // Idempotent by (organization_id, platform, advertising_account_id, external_campaign_id) --
  // re-running an import updates the existing row instead of creating a duplicate.
  async upsertImported(input: ImportedCampaignInput): Promise<CampaignView> {
    const id = randomUUID()
    const result = await this.database.query<CampaignRow>(
      `INSERT INTO campaigns (
         id, organization_id, workspace_id, source, platform, advertising_account_id,
         external_campaign_id, display_name, normalized_name, status, objective,
         budget_currency, budget_amount, start_date, end_date, imported_at
       ) VALUES ($1, $2, $3, 'imported', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT (organization_id, platform, advertising_account_id, external_campaign_id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         normalized_name = EXCLUDED.normalized_name,
         status = EXCLUDED.status,
         objective = EXCLUDED.objective,
         budget_currency = EXCLUDED.budget_currency,
         budget_amount = EXCLUDED.budget_amount,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         imported_at = now(),
         updated_at = now()
       RETURNING id, organization_id, workspace_id, source, platform, advertising_account_id,
         external_campaign_id, display_name, normalized_name, status, objective,
         budget_currency, budget_amount, start_date, end_date, imported_at, created_at, updated_at`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        input.platform,
        input.advertisingAccountId,
        input.externalCampaignId,
        input.displayName,
        normalizeUtmValue(input.displayName),
        input.status,
        input.objective ?? null,
        input.budgetCurrency ?? null,
        input.budgetAmount ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
      ]
    )
    return mapCampaign(result.rows[0])
  }

  // Reads whatever campaign metadata each ad-platform connector's sync already persists --
  // no changes to any of the 4 sync-service.ts files. Google's table is normalized
  // (google_ads_campaigns); Meta/Snapchat/TikTok store raw API payloads keyed by
  // entity_type='campaigns' in their shared *_records tables.
  async fetchPlatformCampaigns(
    organizationId: string,
    platform: CampaignPlatform,
    connectionId?: string
  ): Promise<RawPlatformCampaign[]> {
    if (platform === "google_ads") {
      // google_ads_campaigns.connection_id references integration_connections(id) since the
      // 010_google_ads_connection_identity_unification migration -- not google_oauth_connections.
      const result = await this.database.query<{
        connection_id: string
        workspace_id: string | null
        customer_id: string
        campaign_id: string
        name: string
        status: string | null
        start_date: Date | string | null
        end_date: Date | string | null
      }>(
        `SELECT c.connection_id, conn.workspace_id, c.customer_id, c.campaign_id, c.name, c.status,
                c.start_date, c.end_date
         FROM google_ads_campaigns c
         JOIN integration_connections conn ON conn.id = c.connection_id
         WHERE conn.provider_id = 'google-ads' AND conn.organization_id = $1
           AND ($2::uuid IS NULL OR c.connection_id = $2)`,
        [organizationId, connectionId ?? null]
      )
      return result.rows.map((row) => ({
        connectionId: row.connection_id,
        workspaceId: row.workspace_id,
        advertisingAccountId: row.customer_id,
        externalCampaignId: row.campaign_id,
        displayName: row.name,
        rawStatus: row.status,
        objective: null,
        startDate: toDateOnly(row.start_date),
        endDate: toDateOnly(row.end_date),
      }))
    }

    const PLATFORM_TABLES: Record<
      Exclude<CampaignPlatform, "google_ads">,
      { records: string; connections: string }
    > = {
      meta_ads: { records: "meta_records", connections: "meta_oauth_connections" },
      snapchat_ads: { records: "snapchat_records", connections: "snapchat_oauth_connections" },
      tiktok_ads: { records: "tiktok_ads_records", connections: "tiktok_ads_oauth_connections" },
    }
    const tables = PLATFORM_TABLES[platform]
    const result = await this.database.query<{
      connection_id: string
      workspace_id: string | null
      customer_id: string
      entity_id: string
      payload: Record<string, unknown>
    }>(
      `SELECT r.connection_id, conn.workspace_id, r.customer_id, r.entity_id, r.payload
       FROM ${tables.records} r
       JOIN ${tables.connections} conn ON conn.id = r.connection_id
       WHERE r.entity_type = 'campaigns' AND conn.organization_id = $1
         AND ($2::uuid IS NULL OR r.connection_id = $2)`,
      [organizationId, connectionId ?? null]
    )
    return result.rows.map((row) => mapRawRecordCampaign(platform, row))
  }
}

function mapRawRecordCampaign(
  platform: Exclude<CampaignPlatform, "google_ads">,
  row: {
    connection_id: string
    workspace_id: string | null
    customer_id: string
    entity_id: string
    payload: Record<string, unknown>
  }
): RawPlatformCampaign {
  const payload = row.payload ?? {}
  const base = {
    connectionId: row.connection_id,
    workspaceId: row.workspace_id,
    advertisingAccountId: row.customer_id,
    externalCampaignId: row.entity_id,
  }

  if (platform === "tiktok_ads") {
    return {
      ...base,
      displayName: String(payload.campaign_name ?? row.entity_id),
      rawStatus: (payload.operation_status as string | undefined) ?? null,
      objective: (payload.objective_type as string | undefined) ?? null,
      startDate: null,
      endDate: null,
    }
  }

  // meta_ads and snapchat_ads both use "name"/"status"/"objective".
  return {
    ...base,
    displayName: String(payload.name ?? row.entity_id),
    rawStatus: (payload.status as string | undefined) ?? null,
    objective: (payload.objective as string | undefined) ?? null,
    startDate: null,
    endDate: null,
  }
}
