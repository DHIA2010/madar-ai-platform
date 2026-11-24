import { randomUUID } from "node:crypto"

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
import type { CampaignCreativesService } from "./creatives"
import {
  PlatformPublishError,
  type MetaCallToAction,
  type PublishMedia,
  type TikTokCallToAction,
} from "./publishing/platform"
import {
  creativeProblemFor,
  MIN_DAILY_BUDGETS,
  SNAPCHAT_MAX_AGE_TOP,
  SNAPCHAT_MIN_AGE_TOP,
  withCampaignTracking,
  type LinkTracking,
  type PublishPlatform,
} from "./publishing/service"
import {
  SnapchatPublishError,
  type SnapchatCallToAction,
  type SnapchatEntityLevel,
} from "./publishing/snapchat-publisher"

// Switching a campaign, an ad group or an ad on or off -- or deleting it -- from the campaigns
// list. The list shows what the last sync brought from each ad platform (performance-service.ts);
// this acts on the platform itself and then corrects Madar's own copy, so the list is right at
// once instead of after the next sync.
//
// It also adds to what is already running: a new ad in an ad group that exists (the file, the
// text and the link are sent to the platform, and the new ad joins Madar's copy at once), and an
// ad group's daily budget.
//
// Snapchat, TikTok, Google Ads and Meta. (Meta only answers once its connection has been granted
// the permission to manage ads; until then it refuses, and the refusal is passed on.)
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
  addAd?(input: {
    accessToken: string
    adAccountId: string
    adSquadId: string
    name: string
    media: PublishMedia
    brandName: string
    headline: string
    callToAction: SnapchatCallToAction
    url: string
  }): Promise<{ adId: string; ad: Record<string, unknown> }>
  setAdSquadBudget?(input: {
    accessToken: string
    adSquadId: string
    dailyBudget: number
  }): Promise<Record<string, unknown>>
  // Viewing, editing and copying (publishing/snapchat-publisher.ts).
  readEntity?(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
  }): Promise<Record<string, unknown>>
  readCreative?(input: {
    accessToken: string
    creativeId: string
  }): Promise<Record<string, unknown>>
  updateEntity?(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
    change: (current: Record<string, unknown>) => Record<string, unknown>
  }): Promise<Record<string, unknown>>
  updateCreative?(input: {
    accessToken: string
    creativeId: string
    change: (current: Record<string, unknown>) => Record<string, unknown>
  }): Promise<Record<string, unknown>>
  cloneAd?(input: {
    accessToken: string
    source: Record<string, unknown> | string
    adSquadId: string
    name?: string
    status?: "ACTIVE" | "PAUSED"
    creative?: { headline?: string; brandName?: string; callToAction?: string; url?: string }
  }): Promise<{ ad: Record<string, unknown>; creative: Record<string, unknown> }>
  cloneAdSquad?(input: {
    accessToken: string
    source: Record<string, unknown> | string
    campaignId?: string
    status?: "ACTIVE" | "PAUSED"
    change?: (copy: Record<string, unknown>) => Record<string, unknown>
  }): Promise<{ adSquad: Record<string, unknown>; ads: Array<Record<string, unknown>> }>
  cloneCampaign?(input: { accessToken: string; campaignId: string; name: string }): Promise<{
    campaign: Record<string, unknown>
    adSquads: Array<Record<string, unknown>>
    ads: Array<Record<string, unknown>>
  }>
}

// The settings of a campaign, an ad group or an ad, in one shape for every platform. A field
// the level or the platform does not have is null. Snapchat is read from Snapchat itself at the
// moment of asking (live); the others come from what the last sync brought.
export interface ControlSettings {
  id: string
  level: ControlLevel
  platform: PublishPlatform
  live: boolean
  // Whether Madar can change it or copy it on the platform (Snapchat only, for now).
  canEdit: boolean
  canClone: boolean
  name: string
  status: string
  objective: string | null
  goal: string | null
  dailyBudget: number | null
  startAt: string | null
  endAt: string | null
  countries: string[]
  minAge: number | null
  maxAge: number | null
  gender: "all" | "male" | "female" | null
  headline: string | null
  brandName: string | null
  text: string | null
  callToAction: string | null
  url: string | null
}

// What an edit may change. A field left out stays as it is; endDate null removes the end.
export interface EditInput {
  name?: string | null
  dailyBudget?: number | null
  endDate?: string | null
  minAge?: number | null
  maxAge?: number | null
  gender?: "all" | "male" | "female" | null
  headline?: string | null
  brandName?: string | null
  callToAction?: string | null
}

// A copy: its own name, and whatever of the original's settings the copy should have differently.
export interface CloneInput extends Omit<EditInput, "endDate"> {
  name: string
  url?: string | null
}

// What adds an ad or changes a budget on TikTok, Meta and Google (their publishers).
export interface TikTokAdder {
  addAd(input: {
    accessToken: string
    advertiserId: string
    adGroupId: string
    name: string
    media: PublishMedia
    brandName: string
    text: string
    callToAction: TikTokCallToAction
    url: string
  }): Promise<{ adId: string }>
  setAdGroupBudget(input: {
    accessToken: string
    advertiserId: string
    adGroupId: string
    dailyBudget: number
  }): Promise<void>
}
export interface MetaAdder {
  addAd(input: {
    accessToken: string
    adAccountId: string
    adSetId: string
    name: string
    media: PublishMedia
    text: string
    headline: string
    callToAction: MetaCallToAction
    url: string
  }): Promise<{ adId: string }>
  setAdSetBudget(input: {
    accessToken: string
    adSetId: string
    dailyBudget: number
  }): Promise<void>
}
export interface GoogleAdder {
  addAd(input: {
    connectionId: string
    customerId: string
    adGroupId: string
    headlines: string[]
    descriptions: string[]
    url: string
  }): Promise<{ adId: string }>
}

// A new ad for an ad group that already exists. Snapchat, TikTok and Meta take a creative from
// the library with their own text; Google takes a search ad's headlines and descriptions.
export interface AddAdInput {
  name: string
  url: string
  // The tracking words for the link, when the form's boxes were sent.
  tracking?: LinkTracking | null
  creativeId?: string | null
  brandName?: string | null
  headline?: string | null
  text?: string | null
  callToAction?: string | null
  headlines?: string[] | null
  descriptions?: string[] | null
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

export interface MetaControl {
  setStatus(input: { accessToken: string; id: string; active: boolean }): Promise<void>
  remove(input: { accessToken: string; id: string }): Promise<void>
}

interface TokenAccess {
  resolveAccessToken(connectionId: string): Promise<string>
}

export interface CampaignControlPlatforms {
  snapchat?: { access: TokenAccess; api: SnapchatControl }
  tiktok?: { access: TokenAccess; api: TikTokControl; adder?: TikTokAdder }
  google?: { api: GoogleControl; adder?: GoogleAdder }
  meta?: { access: TokenAccess; api: MetaControl; adder?: MetaAdder }
}

const SOURCE_PLATFORM: Record<string, PublishPlatform> = {
  snapchat_ads: "snapchat",
  tiktok_ads: "tiktok",
  meta_ads: "meta",
  google_ads: "google",
}
const incomplete = (field: string) =>
  new IdentityError("CAMPAIGN_AD_INCOMPLETE", 422, "validation", `The ad needs: ${field}.`, {
    field,
  })

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
const META_RECORD: Record<ControlLevel, string> = {
  campaign: "campaigns",
  adGroup: "adsets",
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
    if (caught instanceof PlatformPublishError) {
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
    private readonly platforms: CampaignControlPlatforms,
    // The creative library, for adding an ad. Left out, ads cannot be added.
    private readonly creatives: Pick<CampaignCreativesService, "get" | "readFile"> | null = null
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
    if (target.source === "meta_ads") return this.metaSetActive(actor, target, active)
    throw notSupported()
  }

  async remove(actor: AuthenticatedActor, rowId: string, level: ControlLevel): Promise<void> {
    const target = this.split(rowId, level)
    if (target.source === "snapchat_ads") return this.snapchatRemove(actor, target)
    if (target.source === "tiktok_ads") return this.tiktokRemove(actor, target)
    if (target.source === "google_ads") return this.googleRemove(actor, target)
    if (target.source === "meta_ads") return this.metaRemove(actor, target)
    throw notSupported()
  }

  // ---- shared by Snapchat, TikTok and Meta: all three keep their synced rows as records with a payload ----

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

  // ---- Meta ----

  private meta() {
    if (!this.platforms.meta) throw notSupported()
    return this.platforms.meta
  }

  private async metaSetActive(actor: AuthenticatedActor, target: Target, active: boolean) {
    const { access, api } = this.meta()
    await this.ownConnection(actor, "meta_oauth_connections", target.connectionId)
    const own = await this.record("meta_records", target, META_RECORD[target.level])
    await onPlatform(async () =>
      api.setStatus({
        accessToken: await access.resolveAccessToken(target.connectionId),
        id: target.externalId,
        active,
      })
    )
    const status = active ? "ACTIVE" : "PAUSED"
    // The finer state Meta reported at the last sync follows the switch until the next one.
    await this.savePayload("meta_records", own.id, {
      ...parse(own.payload),
      status,
      effective_status: status,
    })
    return { id: target.rowId, status }
  }

  private async metaRemove(actor: AuthenticatedActor, target: Target) {
    const { access, api } = this.meta()
    await this.ownConnection(actor, "meta_oauth_connections", target.connectionId)
    const own = await this.record("meta_records", target, META_RECORD[target.level])
    await onPlatform(async () =>
      api.remove({
        accessToken: await access.resolveAccessToken(target.connectionId),
        id: target.externalId,
      })
    )
    await this.dropRecords("meta_records", target, own, {
      adGroups: "adsets",
      ads: "ads",
      campaignKey: "campaign_id",
      adGroupKey: "adset_id",
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

  // ---- Adding to what is running ----

  // Madar's copy of a new ad, so the list shows it at once. The platform already has the ad, so
  // a failure here must not fail the request: the next sync brings the row anyway.
  private async insertRecord(
    table: string,
    target: Target,
    entityId: string,
    payload: Record<string, unknown>,
    entityType = "ads"
  ) {
    await this.db
      .query(
        `INSERT INTO ${table}
           (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
         VALUES ($1, $2, $3, $7, $4, $5::date, $6::jsonb)`,
        [
          randomUUID(),
          target.connectionId,
          target.customerId,
          entityId,
          new Date().toISOString().slice(0, 10),
          JSON.stringify(payload),
          entityType,
        ]
      )
      .catch((error: unknown) =>
        console.error("campaigns.control_add_ad_copy_failed", {
          table,
          message: error instanceof Error ? error.message : String(error),
        })
      )
  }

  // A new ad in an ad group that already exists, on the ad group's own platform.
  async addAd(
    actor: AuthenticatedActor,
    adGroupRowId: string,
    input: AddAdInput
  ): Promise<{ adId: string }> {
    const target = this.split(adGroupRowId, "adGroup")
    const platform = SOURCE_PLATFORM[target.source]
    if (!platform) throw notSupported()
    const name = input.name.trim()
    let url: string
    try {
      if (new URL(input.url).protocol !== "https:") throw new Error("not https")
      url = withCampaignTracking(input.url, name, platform, input.tracking)
    } catch {
      throw new IdentityError(
        "PUBLISH_INVALID_URL",
        422,
        "validation",
        "The website address has to start with https://."
      )
    }

    if (platform === "google") {
      const adder = this.google().adder
      if (!adder) throw notSupported()
      const resolved = await this.googleTarget(actor, target)
      const made = await onPlatform(() =>
        adder.addAd({
          connectionId: resolved.connectionId,
          customerId: resolved.customerId,
          adGroupId: resolved.id,
          headlines: (input.headlines ?? []).map((entry) => entry.trim()).filter(Boolean),
          descriptions: (input.descriptions ?? []).map((entry) => entry.trim()).filter(Boolean),
          url,
        })
      )
      const adGroup = await this.db.query<{ campaign_id: string | null }>(
        `SELECT campaign_id FROM google_ads_ad_groups
          WHERE connection_id = $1 AND customer_id = $2 AND ad_group_id = $3`,
        [target.connectionId, target.customerId, target.externalId]
      )
      await this.db
        .query(
          `INSERT INTO google_ads_ads
             (id, connection_id, customer_id, ad_id, campaign_id, ad_group_id, status, ad_type,
              headline)
           VALUES ($1, $2, $3, $4, $5, $6, 'ENABLED', 'RESPONSIVE_SEARCH_AD', $7)`,
          [
            randomUUID(),
            target.connectionId,
            target.customerId,
            made.adId,
            adGroup.rows[0]?.campaign_id ?? null,
            target.externalId,
            (input.headlines ?? [])[0]?.trim() ?? name,
          ]
        )
        .catch((error: unknown) =>
          console.error("campaigns.control_add_ad_copy_failed", {
            table: "google_ads_ads",
            message: error instanceof Error ? error.message : String(error),
          })
        )
      return made
    }

    // Whose ad group it is comes first: nothing about the ad is looked at for someone else's.
    const owned = {
      snapchat: ["snapchat_oauth_connections", "snapchat_records", SNAPCHAT_RECORD.adGroup],
      tiktok: ["tiktok_ads_oauth_connections", "tiktok_ads_records", TIKTOK_RECORD.adGroup],
      meta: ["meta_oauth_connections", "meta_records", META_RECORD.adGroup],
    }[platform]
    await this.ownConnection(actor, owned[0], target.connectionId)
    await this.record(owned[1], target, owned[2])

    if (!this.creatives) throw notSupported()
    if (!input.creativeId) throw incomplete("creativeId")
    const headline = input.headline?.trim()
    if (!headline) throw incomplete("headline")
    const callToAction = input.callToAction?.trim()
    if (!callToAction) throw incomplete("callToAction")
    const creative = await this.creatives.get(actor.organizationId, input.creativeId)
    const problem = creativeProblemFor(platform, creative)
    if (problem) {
      throw new IdentityError(
        "PUBLISH_CREATIVE_NOT_SUITABLE",
        422,
        "validation",
        "The creative does not fit the platform.",
        { problem }
      )
    }
    const file = async (): Promise<PublishMedia> => {
      const read = await this.creatives!.readFile(actor.organizationId, input.creativeId!)
      return {
        kind: read.creative.kind,
        bytes: read.bytes,
        contentType: read.creative.contentType,
        fileName: read.fileName,
      }
    }

    if (platform === "snapchat") {
      const { access, api } = this.snapchat()
      if (!api.addAd) throw notSupported()
      const brandName = input.brandName?.trim()
      if (!brandName) throw incomplete("brandName")
      await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
      await this.record("snapchat_records", target, SNAPCHAT_RECORD.adGroup)
      const addAd = api.addAd.bind(api)
      const made = await onPlatform(async () =>
        addAd({
          accessToken: await access.resolveAccessToken(target.connectionId),
          adAccountId: target.customerId,
          adSquadId: target.externalId,
          name,
          media: await file(),
          brandName,
          headline,
          callToAction: callToAction as SnapchatCallToAction,
          url,
        })
      )
      await this.insertRecord("snapchat_records", target, made.adId, {
        ...made.ad,
        name,
        status: "ACTIVE",
        ad_squad_id: target.externalId,
      })
      return { adId: made.adId }
    }

    if (platform === "tiktok") {
      const { access, adder } = this.tiktok()
      if (!adder) throw notSupported()
      const brandName = input.brandName?.trim()
      if (!brandName) throw incomplete("brandName")
      await this.ownConnection(actor, "tiktok_ads_oauth_connections", target.connectionId)
      const own = await this.record("tiktok_ads_records", target, TIKTOK_RECORD.adGroup)
      const made = await onPlatform(async () =>
        adder.addAd({
          accessToken: await access.resolveAccessToken(target.connectionId),
          advertiserId: target.customerId,
          adGroupId: target.externalId,
          name,
          media: await file(),
          brandName,
          text: headline,
          callToAction: callToAction as TikTokCallToAction,
          url,
        })
      )
      await this.insertRecord("tiktok_ads_records", target, made.adId, {
        ad_id: made.adId,
        ad_name: name,
        adgroup_id: target.externalId,
        campaign_id: parse(own.payload).campaign_id ?? null,
        operation_status: "ENABLE",
      })
      return { adId: made.adId }
    }

    const { access, adder } = this.meta()
    if (!adder) throw notSupported()
    const text = input.text?.trim()
    if (!text) throw incomplete("text")
    await this.ownConnection(actor, "meta_oauth_connections", target.connectionId)
    const own = await this.record("meta_records", target, META_RECORD.adGroup)
    const made = await onPlatform(async () =>
      adder.addAd({
        accessToken: await access.resolveAccessToken(target.connectionId),
        adAccountId: target.customerId,
        adSetId: target.externalId,
        name,
        media: await file(),
        text,
        headline,
        callToAction: callToAction as MetaCallToAction,
        url,
      })
    )
    await this.insertRecord("meta_records", target, made.adId, {
      id: made.adId,
      ad_id: made.adId,
      name,
      adset_id: target.externalId,
      campaign_id: parse(own.payload).campaign_id ?? null,
      status: "ACTIVE",
      effective_status: "ACTIVE",
    })
    return { adId: made.adId }
  }

  // An ad group's daily budget, in its ad account's currency. Snapchat, TikTok and Meta keep
  // the budget on the ad group; on Google it sits on the campaign, which is not changed here.
  async setDailyBudget(
    actor: AuthenticatedActor,
    adGroupRowId: string,
    dailyBudget: number
  ): Promise<{ id: string; dailyBudget: number }> {
    const target = this.split(adGroupRowId, "adGroup")
    const platform = SOURCE_PLATFORM[target.source]
    if (!platform || platform === "google") throw notSupported()
    const minimum = MIN_DAILY_BUDGETS[platform]
    if (!(dailyBudget >= minimum)) {
      throw new IdentityError(
        "PUBLISH_BUDGET_TOO_LOW",
        422,
        "validation",
        `The daily budget starts at ${minimum}.`,
        { minimum }
      )
    }
    if (platform === "snapchat") {
      const { access, api } = this.snapchat()
      if (!api.setAdSquadBudget) throw notSupported()
      await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
      const own = await this.record("snapchat_records", target, SNAPCHAT_RECORD.adGroup)
      const setBudget = api.setAdSquadBudget.bind(api)
      const saved = await onPlatform(async () =>
        setBudget({
          accessToken: await access.resolveAccessToken(target.connectionId),
          adSquadId: target.externalId,
          dailyBudget,
        })
      )
      await this.savePayload("snapchat_records", own.id, {
        ...parse(own.payload),
        ...saved,
        daily_budget_micro: Math.round(dailyBudget * 1_000_000),
      })
    } else if (platform === "tiktok") {
      const { access, adder } = this.tiktok()
      if (!adder) throw notSupported()
      await this.ownConnection(actor, "tiktok_ads_oauth_connections", target.connectionId)
      const own = await this.record("tiktok_ads_records", target, TIKTOK_RECORD.adGroup)
      await onPlatform(async () =>
        adder.setAdGroupBudget({
          accessToken: await access.resolveAccessToken(target.connectionId),
          advertiserId: target.customerId,
          adGroupId: target.externalId,
          dailyBudget,
        })
      )
      await this.savePayload("tiktok_ads_records", own.id, {
        ...parse(own.payload),
        budget: dailyBudget,
      })
    } else {
      const { access, adder } = this.meta()
      if (!adder) throw notSupported()
      await this.ownConnection(actor, "meta_oauth_connections", target.connectionId)
      const own = await this.record("meta_records", target, META_RECORD.adGroup)
      await onPlatform(async () =>
        adder.setAdSetBudget({
          accessToken: await access.resolveAccessToken(target.connectionId),
          adSetId: target.externalId,
          dailyBudget,
        })
      )
      await this.savePayload("meta_records", own.id, {
        ...parse(own.payload),
        daily_budget: String(Math.round(dailyBudget * 100)),
      })
    }
    return { id: target.rowId, dailyBudget }
  }

  // ---- Viewing, editing and copying ----

  // The settings of a campaign, an ad group or an ad. Snapchat is asked for them now; if it
  // cannot be reached, and for the other platforms, Madar's copy from the last sync is shown.
  async settings(
    actor: AuthenticatedActor,
    rowId: string,
    level: ControlLevel
  ): Promise<ControlSettings> {
    const target = this.split(rowId, level)
    const platform = SOURCE_PLATFORM[target.source]
    if (!platform) throw notSupported()
    const base = { id: rowId, level, platform, live: false, canEdit: false, canClone: false }

    if (platform === "google") {
      await this.googleTarget(actor, target)
      const { table, idColumn } = GOOGLE_TABLE[level]
      const found = await this.db.query<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE connection_id = $1 AND customer_id = $2 AND ${idColumn} = $3`,
        [target.connectionId, target.customerId, target.externalId]
      )
      return { ...base, ...googleSettings(level, found.rows[0] ?? {}) }
    }

    const owned = {
      snapchat: ["snapchat_oauth_connections", "snapchat_records", SNAPCHAT_RECORD[level]],
      tiktok: ["tiktok_ads_oauth_connections", "tiktok_ads_records", TIKTOK_RECORD[level]],
      meta: ["meta_oauth_connections", "meta_records", META_RECORD[level]],
    }[platform]
    await this.ownConnection(actor, owned[0], target.connectionId)
    const own = await this.record(owned[1], target, owned[2])
    const copy = parse(own.payload)
    if (platform === "tiktok") return { ...base, ...tiktokSettings(level, copy) }
    if (platform === "meta") return { ...base, ...metaSettings(level, copy) }

    const { access, api } = this.snapchat()
    const can = Boolean(api.readEntity && api.updateEntity && api.cloneAd)
    if (!api.readEntity) return { ...base, ...snapchatSettings(level, copy, null) }
    const readEntity = api.readEntity.bind(api)
    try {
      const accessToken = await access.resolveAccessToken(target.connectionId)
      const entity = await readEntity({
        accessToken,
        level: SNAPCHAT_LEVEL[level],
        id: target.externalId,
      })
      const creative =
        level === "ad" && api.readCreative && typeof entity.creative_id === "string"
          ? await api.readCreative({ accessToken, creativeId: entity.creative_id })
          : null
      return {
        ...base,
        live: true,
        canEdit: can,
        canClone: can,
        ...snapchatSettings(level, entity, creative),
      }
    } catch (error) {
      // Snapchat could not be asked: what Madar last saw is still worth showing, read-only.
      console.error("campaigns.control_settings_live_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return { ...base, ...snapchatSettings(level, copy, null) }
    }
  }

  // Changes a campaign's, an ad group's or an ad's settings on Snapchat, then corrects Madar's
  // copy. Only what differs from what Snapchat holds is sent, so an untouched audience or text
  // is not sent back to review for nothing.
  async edit(
    actor: AuthenticatedActor,
    rowId: string,
    level: ControlLevel,
    input: EditInput
  ): Promise<ControlSettings> {
    const target = this.split(rowId, level)
    if (target.source !== "snapchat_ads") throw notSupported()
    const { access, api } = this.snapchat()
    if (!api.updateEntity || !api.updateCreative || !api.readEntity) throw notSupported()
    const updateEntity = api.updateEntity.bind(api)
    const updateCreative = api.updateCreative.bind(api)
    const readEntity = api.readEntity.bind(api)
    await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
    const own = await this.record("snapchat_records", target, SNAPCHAT_RECORD[level])
    const name = input.name?.trim()
    if (level === "adGroup" && input.dailyBudget != null) {
      this.budgetFloor("snapchat", input.dailyBudget)
    }
    ageOrder(input.minAge, input.maxAge)

    const saved = await onPlatform(async () => {
      const accessToken = await access.resolveAccessToken(target.connectionId)
      const where = { accessToken, level: SNAPCHAT_LEVEL[level], id: target.externalId }
      const change = (current: Record<string, unknown>) => {
        const next = { ...current }
        if (name) next.name = name
        if (level !== "ad" && input.endDate !== undefined) {
          if (input.endDate === null) delete next.end_time
          else next.end_time = endOfRiyadhDay(input.endDate)
        }
        if (level === "adGroup") {
          if (input.dailyBudget != null) {
            next.daily_budget_micro = Math.round(input.dailyBudget * 1_000_000)
          }
          next.targeting = snapchatAudience(next.targeting, input)
        }
        return next
      }
      // An ad whose own name stays is only read: its text lives on its creative.
      const entity =
        level === "ad" && !name ? await readEntity(where) : await updateEntity({ ...where, change })
      if (level !== "ad" || typeof entity.creative_id !== "string") return entity
      const wanted = {
        headline: input.headline?.trim(),
        brand_name: input.brandName?.trim(),
        call_to_action: input.callToAction?.trim(),
      }
      if (!Object.values(wanted).some(Boolean)) return entity
      const creativeId = entity.creative_id
      await updateCreative({
        accessToken,
        creativeId,
        change: (current) => {
          const next = { ...current }
          for (const [key, value] of Object.entries(wanted)) if (value) next[key] = value
          return next
        },
      })
      // The ad is read again: changing its text sends it back to Snapchat's review.
      return readEntity({ accessToken, level: "ad", id: target.externalId }).catch(() => entity)
    })
    await this.savePayload("snapchat_records", own.id, { ...parse(own.payload), ...saved })
    if (level === "campaign" && name) {
      for (const id of await this.publicationIds(actor.organizationId, target)) {
        await this.db.query(
          `UPDATE campaign_publications SET name = $2, updated_at = now() WHERE id = $1`,
          [id, name]
        )
      }
    }
    return this.settings(actor, rowId, level)
  }

  private budgetFloor(platform: Exclude<PublishPlatform, "google">, dailyBudget: number) {
    const minimum = MIN_DAILY_BUDGETS[platform]
    if (!(dailyBudget >= minimum)) {
      throw new IdentityError(
        "PUBLISH_BUDGET_TOO_LOW",
        422,
        "validation",
        `The daily budget starts at ${minimum}.`,
        { minimum }
      )
    }
  }

  // A copy of a campaign (with its ad groups and ads), of an ad group (with its ads, in the same
  // campaign) or of one ad (in the same ad group) on Snapchat. The copy starts switched off, and
  // joins Madar's list at once.
  async clone(
    actor: AuthenticatedActor,
    rowId: string,
    level: ControlLevel,
    input: CloneInput
  ): Promise<{ id: string; level: ControlLevel }> {
    const target = this.split(rowId, level)
    if (target.source !== "snapchat_ads") throw notSupported()
    const { access, api } = this.snapchat()
    if (!api.cloneAd || !api.cloneAdSquad || !api.cloneCampaign) throw notSupported()
    const cloneAd = api.cloneAd.bind(api)
    const cloneAdSquad = api.cloneAdSquad.bind(api)
    const cloneCampaign = api.cloneCampaign.bind(api)
    await this.ownConnection(actor, "snapchat_oauth_connections", target.connectionId)
    const own = await this.record("snapchat_records", target, SNAPCHAT_RECORD[level])
    const source = parse(own.payload)
    const name = input.name.trim()
    if (level === "adGroup" && input.dailyBudget != null) {
      this.budgetFloor("snapchat", input.dailyBudget)
    }
    ageOrder(input.minAge, input.maxAge)
    const url = input.url?.trim()
    if (url) {
      let secure = false
      try {
        secure = new URL(url).protocol === "https:"
      } catch {
        secure = false
      }
      if (!secure) {
        throw new IdentityError(
          "PUBLISH_INVALID_URL",
          422,
          "validation",
          "The website address has to start with https://."
        )
      }
    }
    const rowOf = (id: unknown) =>
      `${target.source}:${target.connectionId}:${target.customerId}:${String(id)}`
    const keep = (type: string, items: Array<Record<string, unknown>>) =>
      Promise.all(
        items.map((item) =>
          this.insertRecord("snapchat_records", target, String(item.id), item, type)
        )
      )

    if (level === "ad") {
      const adSquadId = String(source.ad_squad_id ?? "")
      if (!adSquadId) throw notFound()
      const made = await onPlatform(async () =>
        cloneAd({
          accessToken: await access.resolveAccessToken(target.connectionId),
          source: target.externalId,
          adSquadId,
          name,
          status: "PAUSED",
          creative: {
            headline: input.headline?.trim() || undefined,
            brandName: input.brandName?.trim() || undefined,
            callToAction: input.callToAction?.trim() || undefined,
            url: url || undefined,
          },
        })
      )
      await keep("ads", [made.ad])
      return { id: rowOf(made.ad.id), level }
    }

    if (level === "adGroup") {
      const made = await onPlatform(async () =>
        cloneAdSquad({
          accessToken: await access.resolveAccessToken(target.connectionId),
          source: target.externalId,
          status: "PAUSED",
          change: (copy) => {
            const next: Record<string, unknown> = { ...copy, name }
            if (input.dailyBudget != null) {
              next.daily_budget_micro = Math.round(input.dailyBudget * 1_000_000)
            }
            next.targeting = snapchatAudience(next.targeting, input)
            return next
          },
        })
      )
      await keep("ad_squads", [made.adSquad])
      await keep("ads", made.ads)
      return { id: rowOf(made.adSquad.id), level }
    }

    const made = await onPlatform(async () =>
      cloneCampaign({
        accessToken: await access.resolveAccessToken(target.connectionId),
        campaignId: target.externalId,
        name,
      })
    )
    await keep("campaigns", [made.campaign])
    await keep("ad_squads", made.adSquads)
    await keep("ads", made.ads)
    return { id: rowOf(made.campaign.id), level }
  }
}

// ---- Reading each platform's own words into one shape ----

type Raw = Record<string, unknown>
type SettingsBody = Omit<
  ControlSettings,
  "id" | "level" | "platform" | "live" | "canEdit" | "canClone"
>

const EMPTY: SettingsBody = {
  name: "",
  status: "",
  objective: null,
  goal: null,
  dailyBudget: null,
  startAt: null,
  endAt: null,
  countries: [],
  minAge: null,
  maxAge: null,
  gender: null,
  headline: null,
  brandName: null,
  text: null,
  callToAction: null,
  url: null,
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null
const amount = (value: unknown, divisor = 1): number | null => {
  const number = Number(value)
  return value != null && value !== "" && Number.isFinite(number) && number > 0
    ? number / divisor
    : null
}
const instant = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString()
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}
const whole = (value: unknown): number | null => {
  const number = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(number) ? number : null
}

function snapchatSettings(level: ControlLevel, entity: Raw, creative: Raw | null): SettingsBody {
  const targeting = (entity.targeting ?? {}) as Raw
  const demographic = ((targeting.demographics as Raw[] | undefined) ?? [])[0] ?? {}
  const gender = String(demographic.gender ?? "").toLowerCase()
  return {
    ...EMPTY,
    name: String(entity.name ?? ""),
    status: String(entity.status ?? ""),
    objective:
      text((entity.objective_v2_properties as Raw | undefined)?.objective_v2_type) ??
      text(entity.objective),
    goal: text(entity.optimization_goal),
    dailyBudget: amount(entity.daily_budget_micro, 1_000_000),
    startAt: instant(entity.start_time),
    endAt: instant(entity.end_time),
    countries: ((targeting.geos as Raw[] | undefined) ?? [])
      .map((geo) => String(geo.country_code ?? "").toUpperCase())
      .filter(Boolean),
    minAge: level === "adGroup" ? whole(demographic.min_age) : null,
    maxAge: level === "adGroup" ? whole(demographic.max_age) : null,
    gender: level !== "adGroup" ? null : gender === "male" || gender === "female" ? gender : "all",
    headline: text(creative?.headline),
    brandName: text(creative?.brand_name),
    callToAction: text(creative?.call_to_action),
    url: text((creative?.web_view_properties as Raw | undefined)?.url),
  }
}

function tiktokSettings(level: ControlLevel, copy: Raw): SettingsBody {
  const ages = ((copy.age_groups as string[] | undefined) ?? [])
    .flatMap((group) => String(group).match(/\d+/g) ?? [])
    .map(Number)
  const gender = String(copy.gender ?? "")
  return {
    ...EMPTY,
    name: String(copy.campaign_name ?? copy.adgroup_name ?? copy.ad_name ?? ""),
    status: String(copy.operation_status ?? ""),
    objective: text(copy.objective_type),
    goal: text(copy.optimization_goal),
    dailyBudget: String(copy.budget_mode ?? "").includes("TOTAL") ? null : amount(copy.budget),
    startAt: instant(copy.schedule_start_time),
    endAt: instant(copy.schedule_end_time),
    minAge: level === "adGroup" && ages.length ? Math.min(...ages) : null,
    maxAge: level === "adGroup" && ages.length > 1 ? Math.max(...ages) : null,
    gender:
      level !== "adGroup"
        ? null
        : gender === "GENDER_MALE"
          ? "male"
          : gender === "GENDER_FEMALE"
            ? "female"
            : "all",
    text: text(copy.ad_text),
    callToAction: text(copy.call_to_action),
    url: text(copy.landing_page_url),
  }
}

function metaSettings(level: ControlLevel, copy: Raw): SettingsBody {
  const targeting = (copy.targeting ?? {}) as Raw
  const genders = (targeting.genders as number[] | undefined) ?? []
  return {
    ...EMPTY,
    name: String(copy.name ?? ""),
    status: String(copy.effective_status ?? copy.status ?? ""),
    objective: text(copy.objective),
    goal: text(copy.optimization_goal),
    // Meta keeps money in the currency's smallest unit.
    dailyBudget: amount(copy.daily_budget, 100),
    startAt: instant(copy.start_time),
    endAt: instant(copy.end_time ?? copy.stop_time),
    countries: (
      ((targeting.geo_locations as Raw | undefined)?.countries as string[] | undefined) ?? []
    ).map(String),
    minAge: level === "adGroup" ? whole(targeting.age_min) : null,
    maxAge: level === "adGroup" ? whole(targeting.age_max) : null,
    gender:
      level !== "adGroup"
        ? null
        : genders.length === 1
          ? genders[0] === 1
            ? "male"
            : "female"
          : "all",
  }
}

function googleSettings(level: ControlLevel, row: Raw): SettingsBody {
  return {
    ...EMPTY,
    name: String(row.name ?? row.headline ?? ""),
    status: String(row.status ?? ""),
    objective: text(row.channel_type),
    goal: text(row.bidding_strategy_type),
    dailyBudget: level === "campaign" ? amount(row.budget_micros, 1_000_000) : null,
    startAt: instant(row.start_date),
    endAt: instant(row.end_date),
    headline: level === "ad" ? text(row.headline) : null,
  }
}

// The last minute of a day in Riyadh (UTC+3, no daylight saving), as Snapchat is given an end.
function endOfRiyadhDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00+03:00`) + 24 * 60 * 60_000 - 60_000).toISOString()
}

function ageOrder(minAge?: number | null, maxAge?: number | null) {
  if (minAge != null && maxAge != null && maxAge <= minAge) {
    throw new IdentityError(
      "PUBLISH_INVALID_AGES",
      422,
      "validation",
      "The oldest age has to be above the youngest."
    )
  }
}

// An ad group's audience with the ages and the gender asked for; everything else about it (its
// countries, interests, devices) stays as it is. Returns the very same object when nothing
// differs, so an unchanged audience is sent back exactly as Snapchat gave it.
function snapchatAudience(
  current: unknown,
  input: Pick<EditInput, "minAge" | "maxAge" | "gender">
): unknown {
  if (input.minAge === undefined && input.maxAge === undefined && input.gender === undefined) {
    return current
  }
  const targeting = { ...((current ?? {}) as Raw) }
  const demographics = [...((targeting.demographics as Raw[] | undefined) ?? [])]
  const before = demographics[0] ?? { operation: "INCLUDE" }
  const first: Raw = { ...before }
  if (input.minAge != null) first.min_age = String(Math.min(input.minAge, SNAPCHAT_MIN_AGE_TOP))
  if (input.maxAge !== undefined) {
    // Above Snapchat's highest closed age there is no upper limit to send.
    if (input.maxAge === null || input.maxAge > SNAPCHAT_MAX_AGE_TOP) delete first.max_age
    else first.max_age = String(input.maxAge)
  }
  if (input.gender != null) {
    if (input.gender === "all") delete first.gender
    else first.gender = input.gender.toUpperCase()
  }
  if (JSON.stringify(first) === JSON.stringify(before)) return current
  demographics[0] = first
  targeting.demographics = demographics
  return targeting
}
