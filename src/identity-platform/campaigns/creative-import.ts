import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  type CampaignCreativesService,
  type CreativeView,
  MAX_CREATIVE_VIDEO_BYTES,
} from "./creatives"
import { SnapchatPublishError } from "./publishing/snapchat-publisher"

// Brings the creatives of ads that already run on an ad platform into the creative library, and
// remembers which ad shows which creative.
//
// An ad made in Snapchat's own Ads Manager carries an image or a video Madar has never seen. For
// each such ad the ad's creative is read from Snapchat, then the file it shows; the file is copied
// into Madar's storage as a library creative marked with its source, and the ad is tied to it
// (campaign_creative_ads). An ad published from Madar is tied to the creative it was made from
// without asking Snapchat anything. With the ties in place the library can say where each
// creative is used and what its ads have done (creative-insights.ts), and the campaigns list can
// open an ad's image or video.
//
// Snapchat only: it is the one platform whose connection can read an ad's file today.
// Nothing is changed on the ad platform -- every call here only reads.

type Json = Record<string, unknown>

export interface SnapchatMediaReader {
  readEntity(input: { accessToken: string; level: "ad"; id: string }): Promise<Json>
  readCreative(input: { accessToken: string; creativeId: string }): Promise<Json>
  readMedia(input: { accessToken: string; mediaId: string }): Promise<Json>
}

export interface CreativeImportPlatforms {
  snapchat?: {
    access: { resolveAccessToken(connectionId: string): Promise<string> }
    api: SnapchatMediaReader
  }
}

// An ad on the campaigns list and the library creative it shows.
export interface AdCreative {
  // The list's own row id of the ad.
  adRowId: string
  creative: CreativeView
}

export interface ImportProgress {
  // Ads dealt with in this call: tied to a creative, or set aside as having no usable file.
  done: number
  // Ads still waiting. Zero means everything is in.
  remaining: number
  // Another call is already bringing this organization's creatives in.
  busy: boolean
}

// How many ads one call deals with: each can mean reading two things and copying a video, and a
// call has to answer well inside a request's time.
export const IMPORT_BATCH = 4

interface PendingAd {
  connectionId: string
  accountId: string
  adId: string
  payload: Json
}

const parse = (value: unknown): Json => {
  if (value && typeof value === "object") return value as Json
  if (typeof value !== "string") return {}
  try {
    return JSON.parse(value) as Json
  } catch {
    return {}
  }
}
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null
const size = (value: unknown): number | null => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

const notFound = () =>
  new IdentityError("CAMPAIGN_CONTROL_NOT_FOUND", 404, "business", "It was not found.")

export class CreativeImportService {
  // The organizations being brought in right now, so two open screens do not copy a file twice.
  private readonly running = new Set<string>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly creatives: Pick<
      CampaignCreativesService,
      "adopt" | "findBySourceMedia" | "get"
    >,
    private readonly platforms: CreativeImportPlatforms,
    private readonly options: { fetch?: typeof fetch; batch?: number } = {}
  ) {}

  // ---- What the campaigns list and the library read ----

  // Every ad that is tied to a creative still in the library.
  async adCreatives(actor: AuthenticatedActor): Promise<AdCreative[]> {
    const ties = await this.db.query<{
      creative_id: string
      connection_id: string
      account_id: string
      ad_id: string
      [key: string]: unknown
    }>(
      `SELECT creative_id, connection_id, account_id, ad_id FROM campaign_creative_ads
        WHERE organization_id = $1 AND platform = 'snapchat' AND creative_id IS NOT NULL`,
      [actor.organizationId]
    )
    const found: AdCreative[] = []
    const known = new Map<string, CreativeView | null>()
    for (const tie of ties.rows) {
      if (!known.has(tie.creative_id)) {
        known.set(
          tie.creative_id,
          await this.creatives.get(actor.organizationId, tie.creative_id).catch(() => null)
        )
      }
      const creative = known.get(tie.creative_id)
      if (!creative) continue
      found.push({
        adRowId: `snapchat_ads:${tie.connection_id}:${tie.account_id}:${tie.ad_id}`,
        creative,
      })
    }
    return found
  }

  // The creative one ad shows, brought in now if it was not yet. Null when the ad has no file
  // Madar can show (its reason was kept).
  async forAd(actor: AuthenticatedActor, adRowId: string): Promise<CreativeView | null> {
    const [source, connectionId, accountId, adId] = adRowId.split(":")
    if (source !== "snapchat_ads" || !connectionId || !accountId || !adId) throw notFound()
    const own = await this.ownAds(actor, connectionId)
    const ad = own.find((entry) => entry.adId === adId && entry.accountId === accountId)
    if (!ad) throw notFound()
    let tie = await this.tieOf(connectionId, adId)
    if (!tie) {
      await this.bringIn(actor, ad, await this.publishedAds(actor.organizationId))
      tie = await this.tieOf(connectionId, adId)
    }
    if (!tie?.creative_id) return null
    return this.creatives.get(actor.organizationId, tie.creative_id).catch(() => null)
  }

  // ---- Bringing them in ----

  // Deals with the next few ads that are not tied to a creative yet. Called again and again by
  // the screen until nothing remains.
  async importNext(actor: AuthenticatedActor): Promise<ImportProgress> {
    const waiting = await this.waiting(actor)
    if (waiting.length === 0) return { done: 0, remaining: 0, busy: false }
    if (this.running.has(actor.organizationId)) {
      return { done: 0, remaining: waiting.length, busy: true }
    }
    this.running.add(actor.organizationId)
    try {
      const published = await this.publishedAds(actor.organizationId)
      let done = 0
      for (const ad of waiting.slice(0, this.options.batch ?? IMPORT_BATCH)) {
        if (await this.bringIn(actor, ad, published)) done += 1
      }
      return { done, remaining: (await this.waiting(actor)).length, busy: false }
    } finally {
      this.running.delete(actor.organizationId)
    }
  }

  // The organization's own synced ads on one connection (or all of them), connected and of the
  // actor's branch when one is chosen.
  private async ownAds(actor: AuthenticatedActor, connectionId?: string): Promise<PendingAd[]> {
    const connections = await this.db.query<{ id: string; workspace_id: string | null }>(
      `SELECT id, workspace_id FROM snapchat_oauth_connections
        WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'connected'`,
      [actor.organizationId]
    )
    const ads: PendingAd[] = []
    for (const connection of connections.rows) {
      if (connectionId && connection.id !== connectionId) continue
      if (actor.workspaceId && connection.workspace_id !== actor.workspaceId) continue
      const records = await this.db.query<{
        customer_id: string
        entity_id: string
        payload: unknown
        [key: string]: unknown
      }>(
        `SELECT customer_id, entity_id, payload FROM snapchat_records
          WHERE connection_id = $1 AND entity_type = 'ads'`,
        [connection.id]
      )
      for (const record of records.rows) {
        ads.push({
          connectionId: connection.id,
          accountId: record.customer_id,
          adId: record.entity_id,
          payload: parse(record.payload),
        })
      }
    }
    return ads
  }

  private async waiting(actor: AuthenticatedActor): Promise<PendingAd[]> {
    if (!this.platforms.snapchat) return []
    const ads = await this.ownAds(actor)
    if (ads.length === 0) return []
    const tied = await this.db.query<{ connection_id: string; ad_id: string }>(
      `SELECT connection_id, ad_id FROM campaign_creative_ads
        WHERE organization_id = $1 AND platform = 'snapchat'`,
      [actor.organizationId]
    )
    const seen = new Set(tied.rows.map((row) => `${row.connection_id}:${row.ad_id}`))
    return ads.filter((ad) => !seen.has(`${ad.connectionId}:${ad.adId}`))
  }

  private async tieOf(connectionId: string, adId: string) {
    const result = await this.db.query<{ creative_id: string | null }>(
      `SELECT creative_id FROM campaign_creative_ads
        WHERE platform = 'snapchat' AND connection_id = $1 AND ad_id = $2`,
      [connectionId, adId]
    )
    return result.rows[0] ?? null
  }

  // The ads published from Madar: which library creative each was made from, by ad and by the
  // file's id on the platform.
  private async publishedAds(organizationId: string) {
    const result = await this.db.query<{
      creative_id: string
      external_ids: unknown
      [key: string]: unknown
    }>(
      `SELECT creative_id, external_ids FROM campaign_publications
        WHERE organization_id = $1 AND platform = 'snapchat' AND creative_id IS NOT NULL`,
      [organizationId]
    )
    const byAd = new Map<string, string>()
    const byMedia = new Map<string, string>()
    for (const row of result.rows) {
      const ids = parse(row.external_ids)
      if (typeof ids.adId === "string") byAd.set(ids.adId, row.creative_id)
      if (typeof ids.mediaId === "string") byMedia.set(ids.mediaId, row.creative_id)
    }
    return { byAd, byMedia }
  }

  private async tie(
    organizationId: string,
    ad: PendingAd,
    link: {
      creativeId: string | null
      platformCreativeId?: string | null
      mediaId?: string | null
      skipped?: string
    }
  ) {
    await this.db.query(
      `INSERT INTO campaign_creative_ads
         (id, organization_id, creative_id, platform, connection_id, account_id, ad_id,
          platform_creative_id, media_id, skipped_reason)
       VALUES ($1, $2, $3, 'snapchat', $4, $5, $6, $7, $8, $9)
       ON CONFLICT (platform, connection_id, ad_id) DO NOTHING`,
      [
        randomUUID(),
        organizationId,
        link.creativeId,
        ad.connectionId,
        ad.accountId,
        ad.adId,
        link.platformCreativeId ?? null,
        link.mediaId ?? null,
        link.skipped ?? null,
      ]
    )
  }

  // The library creative that already is this platform file: one brought in before, or the one a
  // Madar-made ad with the same file was made from.
  private async creativeOfMedia(
    organizationId: string,
    mediaId: string,
    published: { byMedia: Map<string, string> }
  ): Promise<string | null> {
    const brought = await this.creatives.findBySourceMedia(organizationId, mediaId)
    if (brought) return brought.id
    const tied = await this.db.query<{ creative_id: string }>(
      `SELECT creative_id FROM campaign_creative_ads
        WHERE organization_id = $1 AND platform = 'snapchat' AND media_id = $2
          AND creative_id IS NOT NULL
        LIMIT 1`,
      [organizationId, mediaId]
    )
    return tied.rows[0]?.creative_id ?? published.byMedia.get(mediaId) ?? null
  }

  private async download(link: string): Promise<Buffer | "too_large" | null> {
    const response = await (this.options.fetch ?? fetch)(link)
    if (!response.ok) return null
    if (Number(response.headers.get("content-length") ?? 0) > MAX_CREATIVE_VIDEO_BYTES) {
      return "too_large"
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    return bytes.length > MAX_CREATIVE_VIDEO_BYTES ? "too_large" : bytes
  }

  // Ties one ad to its creative, bringing the file in if the library does not have it. True when
  // the ad is dealt with (tied, or set aside for good); false when it should be tried again
  // later (Snapchat or the network did not answer).
  private async bringIn(
    actor: AuthenticatedActor,
    ad: PendingAd,
    published: { byAd: Map<string, string>; byMedia: Map<string, string> }
  ): Promise<boolean> {
    const organizationId = actor.organizationId
    const fromMadar = published.byAd.get(ad.adId)
    if (fromMadar) {
      await this.tie(organizationId, ad, { creativeId: fromMadar })
      return true
    }
    const snapchat = this.platforms.snapchat
    if (!snapchat) return false
    try {
      const accessToken = await snapchat.access.resolveAccessToken(ad.connectionId)
      const platformCreativeId =
        text(ad.payload.creative_id) ??
        text((await snapchat.api.readEntity({ accessToken, level: "ad", id: ad.adId })).creative_id)
      if (!platformCreativeId) {
        await this.tie(organizationId, ad, { creativeId: null, skipped: "no_creative" })
        return true
      }
      const creative = await snapchat.api.readCreative({
        accessToken,
        creativeId: platformCreativeId,
      })
      const mediaId = text(creative.top_snap_media_id)
      if (!mediaId) {
        await this.tie(organizationId, ad, {
          creativeId: null,
          platformCreativeId,
          skipped: "no_file",
        })
        return true
      }
      const known = await this.creativeOfMedia(organizationId, mediaId, published)
      if (known) {
        await this.tie(organizationId, ad, { creativeId: known, platformCreativeId, mediaId })
        return true
      }

      const media = await snapchat.api.readMedia({ accessToken, mediaId })
      const kind = String(media.type ?? "")
      const link = text(media.download_link)
      const setAside = async (skipped: string) => {
        await this.tie(organizationId, ad, {
          creativeId: null,
          platformCreativeId,
          mediaId,
          skipped,
        })
        return true
      }
      if (kind !== "IMAGE" && kind !== "VIDEO") return setAside("unsupported")
      if (!link) return setAside("no_file")
      if ((size(media.file_size_in_bytes) ?? 0) > MAX_CREATIVE_VIDEO_BYTES) {
        return setAside("too_large")
      }
      const bytes = await this.download(link)
      if (bytes === null) return false
      if (bytes === "too_large") return setAside("too_large")
      const measured = (media.video_metadata ?? media.image_metadata ?? {}) as Json
      let adopted: CreativeView
      try {
        adopted = await this.creatives.adopt({
          organizationId,
          workspaceId: actor.workspaceId,
          // The name the ad goes by is what the merchant knows it as.
          name: text(creative.name) ?? text(ad.payload.name) ?? text(media.name) ?? "creative",
          bytes,
          width: size(measured.width_px),
          height: size(measured.height_px),
          durationSeconds: size(media.duration_in_seconds),
          source: "snapchat",
          sourceConnectionId: ad.connectionId,
          sourceAccountId: ad.accountId,
          sourceMediaId: mediaId,
        })
      } catch (error) {
        // A file that is neither a picture nor an MP4 is set aside; a storage failure is retried.
        if (error instanceof IdentityError && error.code === "CREATIVE_INVALID_FILE") {
          return setAside("unsupported")
        }
        throw error
      }
      await this.tie(organizationId, ad, { creativeId: adopted.id, platformCreativeId, mediaId })
      return true
    } catch (error) {
      // An ad deleted on Snapchat since the last sync has nothing to bring in.
      if (error instanceof SnapchatPublishError && error.code === "SNAPCHAT_GONE") {
        await this.tie(organizationId, ad, { creativeId: null, skipped: "gone" })
        return true
      }
      console.error("campaigns.creative_import_failed", {
        adId: ad.adId,
        message: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}
