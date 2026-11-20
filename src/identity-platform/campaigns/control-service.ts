import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { SnapchatPublishError, type SnapchatEntityLevel } from "./publishing/snapchat-publisher"

// Switching a campaign, an ad group or an ad on or off -- or deleting it -- from the campaigns
// list. The list shows what the last sync brought from each ad platform (performance-service.ts);
// this acts on the platform itself and then corrects Madar's own copy, so the list is right at
// once instead of after the next sync.
//
// Snapchat only for now: it is the one platform whose saved connection is allowed to change ads
// (the same reason publishing starts there, see publishing/service.ts).

export type ControlLevel = "campaign" | "adGroup" | "ad"

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

const SNAPCHAT_LEVEL: Record<ControlLevel, SnapchatEntityLevel> = {
  campaign: "campaign",
  adGroup: "ad_set",
  ad: "ad",
}
const RECORD_TYPE: Record<ControlLevel, string> = {
  campaign: "campaigns",
  adGroup: "ad_squads",
  ad: "ads",
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

export class CampaignControlService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly snapchatAccess: { resolveAccessToken(connectionId: string): Promise<string> },
    private readonly snapchat: SnapchatControl
  ) {}

  // A row id from the campaigns list ("snapchat_ads:<connection>:<account>:<id>") resolved to
  // the organization's own synced record. Anything that is not the caller's is "not found".
  private async target(actor: AuthenticatedActor, rowId: string, level: ControlLevel) {
    const [source, connectionId, , externalId] = rowId.split(":")
    if (source !== "snapchat_ads") throw notSupported()
    if (!connectionId || !externalId) throw notFound()
    const connection = await this.db.query<{ workspace_id: string | null }>(
      `SELECT workspace_id FROM snapchat_oauth_connections
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status = 'connected'`,
      [connectionId, actor.organizationId]
    )
    const found = connection.rows[0]
    if (!found || (actor.workspaceId && found.workspace_id !== actor.workspaceId)) {
      throw notFound()
    }
    const record = await this.db.query<RecordRow>(
      `SELECT id, entity_type, entity_id, payload FROM snapchat_records
        WHERE connection_id = $1 AND entity_type = $2 AND entity_id = $3`,
      [connectionId, RECORD_TYPE[level], externalId]
    )
    if (!record.rows[0]) throw notFound()
    return { connectionId, externalId, record: record.rows[0] }
  }

  private async records(connectionId: string, entityType: string): Promise<RecordRow[]> {
    const result = await this.db.query<RecordRow>(
      `SELECT id, entity_type, entity_id, payload FROM snapchat_records
        WHERE connection_id = $1 AND entity_type = $2`,
      [connectionId, entityType]
    )
    return result.rows
  }

  // The campaigns published from Madar that are this Snapchat campaign.
  private async publicationIds(
    organizationId: string,
    connectionId: string,
    campaignId: string
  ): Promise<string[]> {
    const result = await this.db.query<{ id: string; external_ids: unknown }>(
      `SELECT id, external_ids FROM campaign_publications
        WHERE organization_id = $1 AND connection_id = $2`,
      [organizationId, connectionId]
    )
    return result.rows
      .filter((row) => parse(row.external_ids).campaignId === campaignId)
      .map((row) => row.id)
  }

  private async onSnapchat<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (caught) {
      if (caught instanceof SnapchatPublishError) {
        throw new IdentityError(caught.code, 422, "external", caught.reason, { step: caught.step })
      }
      throw caught
    }
  }

  async setActive(
    actor: AuthenticatedActor,
    rowId: string,
    level: ControlLevel,
    active: boolean
  ): Promise<{ id: string; status: string }> {
    const { connectionId, externalId, record } = await this.target(actor, rowId, level)
    const saved = await this.onSnapchat(async () =>
      this.snapchat.setEntityStatus({
        accessToken: await this.snapchatAccess.resolveAccessToken(connectionId),
        level: SNAPCHAT_LEVEL[level],
        id: externalId,
        active,
      })
    )
    // Madar's copy takes what Snapchat answered, with the switch as asked for.
    const payload = { ...parse(record.payload), ...saved, status: active ? "ACTIVE" : "PAUSED" }
    await this.db.query(
      `UPDATE snapchat_records SET payload = $2::jsonb, updated_at = now() WHERE id = $1`,
      [record.id, JSON.stringify(payload)]
    )
    if (level === "campaign") {
      for (const id of await this.publicationIds(actor.organizationId, connectionId, externalId)) {
        await this.db.query(
          `UPDATE campaign_publications SET platform_status = $2, updated_at = now() WHERE id = $1`,
          [id, active ? "active" : "paused"]
        )
      }
    }
    return { id: rowId, status: String(payload.status) }
  }

  async remove(actor: AuthenticatedActor, rowId: string, level: ControlLevel): Promise<void> {
    const { connectionId, externalId, record } = await this.target(actor, rowId, level)
    await this.onSnapchat(async () =>
      this.snapchat.deleteEntity({
        accessToken: await this.snapchatAccess.resolveAccessToken(connectionId),
        level: SNAPCHAT_LEVEL[level],
        id: externalId,
      })
    )

    // Snapchat deletes what is underneath as well, so Madar's copies of those go too.
    const gone = [record.id]
    if (level !== "ad") {
      const adSets =
        level === "campaign"
          ? (await this.records(connectionId, "ad_squads")).filter(
              (row) => parse(row.payload).campaign_id === externalId
            )
          : []
      const adSetIds = new Set(
        level === "campaign" ? adSets.map((row) => row.entity_id) : [externalId]
      )
      const ads = (await this.records(connectionId, "ads")).filter((row) =>
        adSetIds.has(String(parse(row.payload).ad_squad_id ?? ""))
      )
      gone.push(...adSets.map((row) => row.id), ...ads.map((row) => row.id))
    }
    for (const id of gone) {
      await this.db.query(`DELETE FROM snapchat_records WHERE id = $1`, [id])
    }
    if (level === "campaign") {
      for (const id of await this.publicationIds(actor.organizationId, connectionId, externalId)) {
        await this.db.query(`DELETE FROM campaign_publications WHERE id = $1`, [id])
      }
    }
  }
}
