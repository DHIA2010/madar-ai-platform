import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import { GoogleAdsMutateError } from "../google-ads/client"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  PlatformControlError,
  type ControlLevel,
  type GoogleControlTarget,
  type TikTokOperation,
} from "./control-platforms"
import { SnapchatPublishError, type SnapchatEntityLevel } from "./publishing/snapchat-publisher"

// Switching a campaign, an ad group or an ad on or off -- or deleting it -- from the campaigns
// list. The list shows what the last sync brought from each ad platform (performance-service.ts);
// this acts on the platform itself and then corrects Madar's own copy, so the list is right at
// once instead of after the next sync.
//
// Snapchat, TikTok and Google Ads: the three whose saved connections are allowed to change ads.
// A row's id says which one it is ("<source>:<connection>:<account>:<id>"), and everything is
// checked against the organization's own synced rows before the platform is asked for anything.

export type { ControlLevel } from "./control-platforms"

export interface SnapchatControl {
  setEntityStatus(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
    active: boolean
  }): Promise<Record<string, unknown>>
  deleteEntity(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
  }): Promise<void>
}

export interface TikTokControl {
  setStatus(input: {
    accessToken: string
    advertiserId: string
    level: ControlLevel
    id: string
    operation: TikTokOperation
  }): Promise<void>
}

export interface GoogleControl {
  setStatus(target: GoogleControlTarget, active: boolean): Promise<void>
  remove(target: GoogleControlTarget): Promise<void>
}

interface TokenAccess {
  resolveAccessToken(connectionId: string): Promise<string>
}

export interface CampaignControlPlatforms {
  snapchat?: { access: TokenAccess; api: SnapchatControl }
  tiktok?: { access: TokenAccess; api: TikTokControl }
  google?: { api: GoogleControl }
}

const SNAPCHAT_LEVEL: Record<ControlLevel, SnapchatEntityLevel> = {
  campaign: "campaign",
  adGroup: "ad_set",
  ad: "ad",
}
const SNAPCHAT_RECORD: Record<ControlLevel, string> = {
  campaign: "campaigns",
  adGroup: "ad_squads",
  ad: "ads",
}
const TIKTOK_RECORD: Record<ControlLevel, string> = {
  campaign: "campaigns",
  adGroup: "adgroups",
  ad: "ads",
}
const GOOGLE_TABLE: Record<ControlLevel, { table: string; idColumn: string }> = {
  campaign: { table: "google_ads_campaigns", idColumn: "campaign_id" },
  adGroup: { table: "google_ads_ad_groups", idColumn: "ad_group_id" },
  ad: { table: "google_ads_ads", idColumn: "ad_id" },
}

const notSupported = () =>
  new IdentityError(
    "CAMPAIGN_CONTROL_NOT_SUPPORTED",
    422,
    "business",
    "This ad platform cannot be changed from Madar yet."
  )
const notFound = () =>
  new IdentityError("CAMPAIGN_CONTROL_NOT_FOUND", 404, "business", "It was not found.")

const parse = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") return value as Record<string, unknown>
  if (typeof value !== "string") return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

interface RecordRow {
  id: string
  entity_type: string
  entity_id: string
  payload: unknown
  [key: string]: unknown
}

interface Target {
  rowId: string
  connectionId: string
  customerId: string
  externalId: string
  level: ControlLevel
}

// A refusal by the ad platform, passed on with the platform's own reason.
async function onPlatform<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (caught) {
    if (caught instanceof SnapchatPublishError) {
      throw new IdentityError(caught.code, 422, "external", caught.reason, { step: caught.step })
    }
    if (caught instanceof PlatformControlError) {
      throw new IdentityError(
        caught.denied ? "PLATFORM_ACCESS_DENIED" : "PLATFORM_REFUSED",
        422,
        "external",
        caught.reason,
        { platform: caught.platform }
      )
    }
    if (caught instanceof GoogleAdsMutateError) {
      const denied = caught.status === 401 || caught.status === 403
      throw new IdentityError(
        denied ? "PLATFORM_ACCESS_DENIED" : "PLATFORM_REFUSED",
        422,
        "external",
        caught.reason,
        { platform: "google" }
      )
    }
    throw caught
  }
}

export class CampaignControlService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly platforms: CampaignControlPlatforms
  ) {}

  private split(rowId: string, level: ControlLevel): Target & { source: string } {
    const [source, connectionId, customerId, externalId] = rowId.split(":")
    if (!connectionId || !customerId || !externalId) throw notFound()
    return { source, rowId, connectionId, customerId, externalId, level }
  }

  async setActive(
    actor: AuthenticatedActor,
    rowId: string,
    level: ControlLevel,
    active: boolean
  ): Promise<{ id: string; status: string }> {
    const target = this.split(rowId, level)
    if (target.source === "snapchat_ads") return this.snapchatSetActive(actor, target, active)
    if (target.source === "tiktok_ads") return this.tiktokSetActive(actor, target, active)
    if (target.source === "google_ads") return this.googleSetActive(actor, target, active)
    throw notSupported()
  }

  async remove(actor: AuthenticatedActor, rowId: string, level: ControlLevel): Promise<void> {
    const target = this.split(rowId, level)
    if (target.source === "snapchat_ads") return this.snapchatRemove(actor, target)
    if (target.source === "tiktok_ads") return this.tiktokRemove(actor, target)
    if (target.source === "google_ads") return this.googleRemove(actor, target)
    throw notSupported()
  }

  // ---- shared by Snapchat and TikTok: both keep their synced rows as records with a payload ----

  // The organization's own connection, connected and (when a branch is chosen) of that branch.
  private async ownConnection(actor: AuthenticatedActor, table: string, connectionId: string) {
    const connection = await this.db.query<{ workspace_id: string | null }>(
      `SELECT workspace_id FROM ${table}
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status = 'connected'`,
      [connectionId, actor.organizationId]
    )
    const found = connection.rows[0]
    if (!found || (actor.workspaceId && found.workspace_id !== actor.workspaceId)) {
      throw notFound()
    }
  }

  private async record(table: string, target: Target, entityType: string): Promise<RecordRow> {
    const result = await this.db.query<RecordRow>(
      `SELECT id, entity_type, entity_id, payload FROM ${table}
        WHERE connection_id = $1 AND entity_type = $2 AND entity_id = $3 AND customer_id = $4`,
      [target.connectionId, entityType, target.externalId, target.customerId]
    )
    if (!result.rows[0]) throw notFound()
    return result.rows[0]
  }

  private async records(table: string, connectionId: string, entityType: string) {
    const result = await this.db.query<RecordRow>(
      `SELECT id, entity_type, entity_id, payload FROM ${table}
        WHERE connection_id = $1 AND entity_type = $2`,
      [connectionId, entityType]
    )
    return result.rows
  }

  private async savePayload(table: string, id: string, payload: Record<string, unknown>) {
    await this.db.query(
      `UPDATE ${table} SET payload = $2::jsonb, updated_at = now() WHERE id = $1`,
      [id, JSON.stringify(payload)]
    )
  }

  // Madar's copies of a deleted thing and of everything the platform deleted with it: a
  // campaign's ad groups and ads, or an ad group's ads.
  private async dropRecords(
    table: string,
    target: Target,
    own: RecordRow,
    names: { adGroups: string; ads: string; campaignKey: string; adGroupKey: string }
  ) {
    const gone = [own.id]
    if (target.level !== "ad") {
      const adGroups =
        target.level === "campaign"
          ? (await this.records(table, target.connectionId, names.adGroups)).filter(
              (row) => String(parse(row.payload)[names.campaignKey] ?? "") === target.externalId
            )
          : []
      const adGroupIds = new Set(
        target.level === "campaign" ? adGroups.map((row) => row.entity_id) : [target.externalId]
      )
      const ads = (await this.records(table, target.connectionId, names.ads)).filter((row) =>
        adGroupIds.has(String(parse(row.payload)[names.adGroupKey] ?? ""))
      )
      gone.push(...adGroups.map((row) => row.id), ...ads.map((row) => row.id))
    }
    for (const id of gone) {
      await this.db.query(`DELETE FROM ${table} WHERE id = $1`, [id])
    }
  }

  // ---- Snapchat ----

  private snapchat() {
    if (!this.platforms.snapchat) throw notSupported()
    return this.platforms.snapchat
  }

  // The campaigns published from Madar that are this Snapchat campaign.
  private async publicationIds(organizationId: string, target: Target): Promise<string[]> {
    const result = await this.db.query<{ id: string; external_ids: unknown }>(
      `SELECT id, external_ids FROM campaign_publications
        WHERE organization_id = $1 AND connection_id = $2`,
      [organizationId, target.connectionId]
    )
    return result.rows
      .filter((row) => parse(row.external_ids).campaignId === target.externalId)
      .map((row) => row.id)
  }

  private async snapchatSetActive(actor: AuthenticatedActor, target: Target, active: boolean) {
    const { access, api } = this.snapchat()
    await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
    const own = await this.record("snapchat_records", target, SNAPCHAT_RECORD[target.level])
    const saved = await onPlatform(async () =>
      api.setEntityStatus({
        accessToken: await access.resolveAccessToken(target.connectionId),
        level: SNAPCHAT_LEVEL[target.level],
        id: target.externalId,
        active,
      })
    )
    // Madar's copy takes what Snapchat answered, with the switch as asked for.
    const payload = { ...parse(own.payload), ...saved, status: active ? "ACTIVE" : "PAUSED" }
    await this.savePayload("snapchat_records", own.id, payload)
    if (target.level === "campaign") {
      for (const id of await this.publicationIds(actor.organizationId, target)) {
        await this.db.query(
          `UPDATE campaign_publications SET platform_status = $2, updated_at = now() WHERE id = $1`,
          [id, active ? "active" : "paused"]
        )
      }
    }
    return { id: target.rowId, status: String(payload.status) }
  }

  private async snapchatRemove(actor: AuthenticatedActor, target: Target) {
    const { access, api } = this.snapchat()
    await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
    const own = await this.record("snapchat_records", target, SNAPCHAT_RECORD[target.level])
    await onPlatform(async () =>
      api.deleteEntity({
        accessToken: await access.resolveAccessToken(target.connectionId),
        level: SNAPCHAT_LEVEL[target.level],
        id: target.externalId,
      })
    )
    await this.dropRecords("snapchat_records", target, own, {
      adGroups: "ad_squads",
      ads: "ads",
      campaignKey: "campaign_id",
      adGroupKey: "ad_squad_id",
    })
    if (target.level === "campaign") {
      for (const id of await this.publicationIds(actor.organizationId, target)) {
        await this.db.query(`DELETE FROM campaign_publications WHERE id = $1`, [id])
      }
    }
  }

  // ---- TikTok ----

  private tiktok() {
    if (!this.platforms.tiktok) throw notSupported()
    return this.platforms.tiktok
  }

  private async tiktokChange(
    actor: AuthenticatedActor,
    target: Target,
    operation: TikTokOperation
  ): Promise<RecordRow> {
    const { access, api } = this.tiktok()
    await this.ownConnection(actor, "tiktok_ads_oauth_connections", target.connectionId)
    const own = await this.record("tiktok_ads_records", target, TIKTOK_RECORD[target.level])
    await onPlatform(async () =>
      api.setStatus({
        accessToken: await access.resolveAccessToken(target.connectionId),
        advertiserId: target.customerId,
        level: target.level,
        id: target.externalId,
        operation,
      })
    )
    return own
  }

  private async tiktokSetActive(actor: AuthenticatedActor, target: Target, active: boolean) {
    const operation = active ? "ENABLE" : "DISABLE"
    const own = await this.tiktokChange(actor, target, operation)
    // The finer state TikTok reported at the last sync no longer holds, so it is cleared and
    // the next sync fills it in again.
    await this.savePayload("tiktok_ads_records", own.id, {
      ...parse(own.payload),
      operation_status: operation,
      secondary_status: "",
    })
    return { id: target.rowId, status: operation }
  }

  private async tiktokRemove(actor: AuthenticatedActor, target: Target) {
    const own = await this.tiktokChange(actor, target, "DELETE")
    await this.dropRecords("tiktok_ads_records", target, own, {
      adGroups: "adgroups",
      ads: "ads",
      campaignKey: "campaign_id",
      adGroupKey: "adgroup_id",
    })
  }

  // ---- Google Ads: its synced rows are tables of their own, one per level ----

  private google() {
    if (!this.platforms.google) throw notSupported()
    return this.platforms.google
  }

  private async googleTarget(
    actor: AuthenticatedActor,
    target: Target
  ): Promise<GoogleControlTarget> {
    const connection = await this.db.query<{ workspace_id: string | null }>(
      `SELECT workspace_id FROM integration_connections
        WHERE id = $1 AND organization_id = $2 AND provider_id = 'google-ads'`,
      [target.connectionId, actor.organizationId]
    )
    const found = connection.rows[0]
    if (!found || (actor.workspaceId && found.workspace_id !== actor.workspaceId)) {
      throw notFound()
    }
    const { table, idColumn } = GOOGLE_TABLE[target.level]
    const row = await this.db.query<{ ad_group_id?: string | null; [key: string]: unknown }>(
      `SELECT ${target.level === "ad" ? "ad_group_id" : idColumn} FROM ${table}
        WHERE connection_id = $1 AND customer_id = $2 AND ${idColumn} = $3`,
      [target.connectionId, target.customerId, target.externalId]
    )
    if (!row.rows[0]) throw notFound()
    return {
      connectionId: target.connectionId,
      customerId: target.customerId,
      level: target.level,
      id: target.externalId,
      adGroupId: target.level === "ad" ? (row.rows[0].ad_group_id ?? null) : null,
    }
  }

  private async googleSetActive(actor: AuthenticatedActor, target: Target, active: boolean) {
    const { api } = this.google()
    const resolved = await this.googleTarget(actor, target)
    await onPlatform(() => api.setStatus(resolved, active))
    const status = active ? "ENABLED" : "PAUSED"
    const { table, idColumn } = GOOGLE_TABLE[target.level]
    await this.db.query(
      `UPDATE ${table} SET status = $4
        WHERE connection_id = $1 AND customer_id = $2 AND ${idColumn} = $3`,
      [target.connectionId, target.customerId, target.externalId, status]
    )
    return { id: target.rowId, status }
  }

  private async googleRemove(actor: AuthenticatedActor, target: Target) {
    const { api } = this.google()
    const resolved = await this.googleTarget(actor, target)
    await onPlatform(() => api.remove(resolved))
    const scope = [target.connectionId, target.customerId, target.externalId]
    const drop = (table: string, column: string) =>
      this.db.query(
        `DELETE FROM ${table} WHERE connection_id = $1 AND customer_id = $2 AND ${column} = $3`,
        scope
      )
    if (target.level === "campaign") {
      await drop("google_ads_keywords", "campaign_id")
      await drop("google_ads_ads", "campaign_id")
      await drop("google_ads_ad_groups", "campaign_id")
      await drop("google_ads_campaigns", "campaign_id")
    } else if (target.level === "adGroup") {
      await drop("google_ads_keywords", "ad_group_id")
      await drop("google_ads_ads", "ad_group_id")
      await drop("google_ads_ad_groups", "ad_group_id")
    } else {
      await drop("google_ads_ads", "ad_id")
    }
  }
}
