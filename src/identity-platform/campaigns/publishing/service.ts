import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { IdentityError } from "../../application/errors/IdentityError"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import type { CampaignCreativesService, CreativeView } from "../creatives"

import {
  SNAPCHAT_BRAND_NAME_MAX,
  SNAPCHAT_HEADLINE_MAX,
  SnapchatPublishError,
  type SnapchatCallToAction,
  type SnapchatObjective,
  type SnapchatPublishedIds,
  type SnapchatPublishInput,
} from "./snapchat-publisher"

// Publishing a campaign from Madar to an ad platform -- Snapchat for now, the one platform whose
// connection is allowed to create every piece of a campaign (the others are added as their
// permissions arrive). The merchant fills one short form; Madar creates the campaign, its ad set
// and its ad on the platform and keeps a record of what was asked for and what the platform gave
// back.
//
// Publishing takes from a few seconds (an image) to about a minute (a video Snapchat has to
// process), longer than a request should stay open -- so `publish` records the campaign as
// "publishing", answers at once and carries on in the background; the screen then asks for the
// record until it says "published" or "failed".

export type PublicationStatus = "publishing" | "published" | "failed"

export const PUBLISH_COUNTRIES = ["sa", "ae", "kw", "qa", "bh", "om", "eg", "jo"] as const
export type PublishCountry = (typeof PUBLISH_COUNTRIES)[number]

export interface PublishCampaignInput {
  platform: "snapchat"
  connectionId: string
  adAccountId: string
  name: string
  objective: SnapchatObjective
  dailyBudget: number
  // Date-only, Riyadh days. A campaign that starts today starts a few minutes from now.
  startDate: string
  endDate?: string | null
  countryCode: PublishCountry
  minAge: number
  maxAge?: number | null
  gender: "all" | "male" | "female"
  creativeId: string
  brandName: string
  headline: string
  callToAction: SnapchatCallToAction
  url: string
  startActive: boolean
}

export interface PublicationView {
  id: string
  platform: string
  adAccountId: string
  name: string
  objective: string
  currency: string | null
  dailyBudget: number
  startAt: string
  endAt: string | null
  targeting: { countryCode: string; minAge: number; maxAge: number | null; gender: string }
  creativeId: string | null
  brandName: string
  headline: string
  callToAction: string
  url: string
  status: PublicationStatus
  // The campaign's own switch on the platform.
  platformStatus: "active" | "paused"
  // Why a failed publish failed: a code the screen has words for, and the platform's own reason.
  error: { code: string; step: string | null; reason: string } | null
  externalCampaignId: string | null
  createdAt: string
}

export interface PublishOptions {
  snapchat: {
    accounts: Array<{
      connectionId: string
      adAccountId: string
      name: string
      currency: string | null
    }>
  }
  limits: {
    headlineMax: number
    brandNameMax: number
    minDailyBudget: number
    countries: readonly string[]
  }
}

// What Snapchat needs to be handed, kept narrow so tests can stand in for it.
export interface SnapchatAccess {
  resolveAccessToken(connectionId: string): Promise<string>
}
export interface SnapchatPublisher {
  publish(input: SnapchatPublishInput): Promise<SnapchatPublishedIds>
  setCampaignStatus(input: {
    accessToken: string
    adAccountId: string
    campaignId: string
    active: boolean
  }): Promise<void>
}

// Snapchat's floor is 5 US dollars a day; 20 covers it in riyals and the neighbouring currencies.
export const MIN_DAILY_BUDGET = 20
// A publish that has not finished after this long was cut short (a restart mid-way).
const STALE_PUBLISH_MS = 10 * 60_000
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new IdentityError(code, 422, "validation", message, details)

const riyadhDay = (date: Date) =>
  new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
const riyadhMidnight = (day: string) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() - RIYADH_OFFSET_MS)

// Snapchat shows ads full-screen on a phone: an upright 9:16 file, at least 1080 wide, and a
// video between 3 seconds and 3 minutes. A creative whose size was never measured is left for
// Snapchat to judge.
export function snapchatCreativeProblem(creative: CreativeView): string | null {
  if (creative.width && creative.height) {
    const ratio = creative.width / creative.height
    if (Math.abs(ratio - 9 / 16) > 0.02) return "ratio"
    if (creative.width < 1080) return "small"
  }
  if (creative.kind === "video" && creative.durationSeconds) {
    if (creative.durationSeconds < 3 || creative.durationSeconds > 180) return "duration"
  }
  return null
}

// The landing page's address with the campaign named in it, so Madar's own reports (and the
// merchant's analytics) can tell which campaign a visit came from. An address that already
// carries utm_source is left as written.
export function withCampaignTracking(url: string, campaignName: string): string {
  const parsed = new URL(url)
  if (parsed.searchParams.has("utm_source")) return parsed.toString()
  const slug =
    campaignName
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "campaign"
  parsed.searchParams.set("utm_source", "snapchat")
  parsed.searchParams.set("utm_medium", "paid_social")
  parsed.searchParams.set("utm_campaign", slug)
  return parsed.toString()
}

interface PublicationRow {
  id: string
  platform: string
  connection_id: string
  ad_account_id: string
  name: string
  objective: string
  currency: string | null
  daily_budget: number | string
  start_at: Date | string
  end_at: Date | string | null
  targeting: unknown
  creative_id: string | null
  brand_name: string
  headline: string
  call_to_action: string
  destination_url: string
  status: string
  platform_status: string
  external_ids: unknown
  error: string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value))
const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapPublication(row: PublicationRow, now: Date): PublicationView {
  const stale =
    row.status === "publishing" &&
    now.getTime() - new Date(iso(row.updated_at)).getTime() > STALE_PUBLISH_MS
  const targeting = json<Partial<PublicationView["targeting"]>>(row.targeting, {})
  const ids = json<Partial<SnapchatPublishedIds>>(row.external_ids, {})
  return {
    id: row.id,
    platform: row.platform,
    adAccountId: row.ad_account_id,
    name: row.name,
    objective: row.objective,
    currency: row.currency,
    dailyBudget: Number(row.daily_budget),
    startAt: iso(row.start_at),
    endAt: row.end_at ? iso(row.end_at) : null,
    targeting: {
      countryCode: targeting.countryCode ?? "sa",
      minAge: targeting.minAge ?? 18,
      maxAge: targeting.maxAge ?? null,
      gender: targeting.gender ?? "all",
    },
    creativeId: row.creative_id,
    brandName: row.brand_name,
    headline: row.headline,
    callToAction: row.call_to_action,
    url: row.destination_url,
    status: stale ? "failed" : (row.status as PublicationStatus),
    platformStatus: row.platform_status === "active" ? "active" : "paused",
    error: stale
      ? { code: "PUBLISH_INTERRUPTED", step: null, reason: "The publish was interrupted." }
      : json<PublicationView["error"]>(row.error, null),
    externalCampaignId: ids.campaignId ?? null,
    createdAt: iso(row.created_at),
  }
}

const SELECT = `SELECT id, platform, connection_id, ad_account_id, name, objective, currency,
  daily_budget, start_at, end_at, targeting, creative_id, brand_name, headline, call_to_action,
  destination_url, status, platform_status, external_ids, error, created_at, updated_at
  FROM campaign_publications`

export class CampaignPublishingService {
  // Publishes still running in this process, so tests (and a graceful stop) can wait for them.
  private readonly running = new Set<Promise<void>>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly creatives: CampaignCreativesService,
    private readonly snapchatAccess: SnapchatAccess,
    private readonly snapchat: SnapchatPublisher,
    private readonly now: () => Date = () => new Date()
  ) {}

  // The organization's connected Snapchat ad accounts (the actor's branch when one is chosen).
  private async snapchatAccounts(actor: AuthenticatedActor) {
    const connections = await this.db.query<{ id: string; workspace_id: string | null }>(
      `SELECT id, workspace_id FROM snapchat_oauth_connections
        WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'connected'`,
      [actor.organizationId]
    )
    const accounts: PublishOptions["snapchat"]["accounts"] = []
    for (const connection of connections.rows) {
      if (actor.workspaceId && connection.workspace_id !== actor.workspaceId) continue
      const result = await this.db.query<{
        account_id: string
        account_name: string | null
        currency_code: string | null
      }>(
        `SELECT account_id, account_name, currency_code FROM snapchat_ads_accounts
          WHERE connection_id = $1 AND status = 'active'
          ORDER BY is_selected DESC, account_name ASC`,
        [connection.id]
      )
      for (const row of result.rows) {
        accounts.push({
          connectionId: connection.id,
          adAccountId: row.account_id,
          name: row.account_name ?? row.account_id,
          currency: row.currency_code,
        })
      }
    }
    return accounts
  }

  async options(actor: AuthenticatedActor): Promise<PublishOptions> {
    return {
      snapchat: { accounts: await this.snapchatAccounts(actor) },
      limits: {
        headlineMax: SNAPCHAT_HEADLINE_MAX,
        brandNameMax: SNAPCHAT_BRAND_NAME_MAX,
        minDailyBudget: MIN_DAILY_BUDGET,
        countries: PUBLISH_COUNTRIES,
      },
    }
  }

  async list(organizationId: string): Promise<PublicationView[]> {
    const result = await this.db.query<PublicationRow>(
      `${SELECT} WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [organizationId]
    )
    return result.rows.map((row) => mapPublication(row, this.now()))
  }

  private async row(organizationId: string, id: string): Promise<PublicationRow> {
    const result = await this.db.query<PublicationRow>(
      `${SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!result.rows[0]) {
      throw new IdentityError("PUBLICATION_NOT_FOUND", 404, "business", "Campaign not found.")
    }
    return result.rows[0]
  }

  async get(organizationId: string, id: string): Promise<PublicationView> {
    return mapPublication(await this.row(organizationId, id), this.now())
  }

  // Checks the request, records the campaign as "publishing" and starts the publish. Everything
  // that can be judged without the platform is judged here, so the merchant hears about it at
  // once rather than after a wait.
  async publish(actor: AuthenticatedActor, input: PublishCampaignInput): Promise<PublicationView> {
    const account = (await this.snapchatAccounts(actor)).find(
      (entry) =>
        entry.connectionId === input.connectionId && entry.adAccountId === input.adAccountId
    )
    if (!account) {
      throw invalid("PUBLISH_ACCOUNT_NOT_CONNECTED", "That Snapchat ad account is not connected.")
    }
    if (input.dailyBudget < MIN_DAILY_BUDGET) {
      throw invalid("PUBLISH_BUDGET_TOO_LOW", `The daily budget starts at ${MIN_DAILY_BUDGET}.`, {
        minimum: MIN_DAILY_BUDGET,
      })
    }
    const now = this.now()
    const today = riyadhDay(now)
    if (input.startDate < today) {
      throw invalid("PUBLISH_START_IN_PAST", "The start date has passed.")
    }
    if (input.endDate && input.endDate < input.startDate) {
      throw invalid("PUBLISH_END_BEFORE_START", "The end date is before the start date.")
    }
    if (input.maxAge && input.maxAge <= input.minAge) {
      throw invalid("PUBLISH_AGE_RANGE", "The oldest age has to be above the youngest.")
    }
    let url: string
    try {
      const parsed = new URL(input.url)
      if (parsed.protocol !== "https:") throw new Error("not https")
      url = withCampaignTracking(input.url, input.name)
    } catch {
      throw invalid("PUBLISH_INVALID_URL", "The website address has to start with https://.")
    }
    const creative = await this.creatives.get(actor.organizationId, input.creativeId)
    const problem = snapchatCreativeProblem(creative)
    if (problem) {
      throw invalid("PUBLISH_CREATIVE_NOT_SUITABLE", "The creative does not fit Snapchat.", {
        problem,
      })
    }

    // Today: a few minutes from now, so the start is never already in the past when Snapchat
    // reads it. A later day: its first minute in Riyadh.
    const startAt =
      input.startDate === today
        ? new Date(now.getTime() + 5 * 60_000)
        : riyadhMidnight(input.startDate)
    // The end date is the last day the campaign runs, through to its last minute.
    const endAt = input.endDate
      ? new Date(riyadhMidnight(input.endDate).getTime() + 24 * 60 * 60_000 - 60_000)
      : null

    const id = randomUUID()
    await this.db.query(
      `INSERT INTO campaign_publications
         (id, organization_id, workspace_id, platform, connection_id, ad_account_id, name,
          objective, currency, daily_budget, start_at, end_at, targeting, creative_id, brand_name,
          headline, call_to_action, destination_url, status, platform_status, created_by)
       VALUES ($1, $2, $3, 'snapchat', $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
               $16, $17, 'publishing', $18, $19)`,
      [
        id,
        actor.organizationId,
        actor.workspaceId ?? null,
        input.connectionId,
        input.adAccountId,
        input.name.trim(),
        input.objective,
        account.currency,
        input.dailyBudget,
        startAt.toISOString(),
        endAt ? endAt.toISOString() : null,
        JSON.stringify({
          countryCode: input.countryCode,
          minAge: input.minAge,
          maxAge: input.maxAge ?? null,
          gender: input.gender,
        }),
        input.creativeId,
        input.brandName.trim(),
        input.headline.trim(),
        input.callToAction,
        url,
        input.startActive ? "active" : "paused",
        actor.userId,
      ]
    )

    const work = this.run(actor.organizationId, id, input, url, startAt, endAt).finally(() =>
      this.running.delete(work)
    )
    this.running.add(work)
    return this.get(actor.organizationId, id)
  }

  // The publish itself. Never throws: the outcome is written to the record.
  private async run(
    organizationId: string,
    id: string,
    input: PublishCampaignInput,
    url: string,
    startAt: Date,
    endAt: Date | null
  ): Promise<void> {
    try {
      const [accessToken, file] = await Promise.all([
        this.snapchatAccess.resolveAccessToken(input.connectionId),
        this.creatives.readFile(organizationId, input.creativeId),
      ])
      const ids = await this.snapchat.publish({
        accessToken,
        adAccountId: input.adAccountId,
        name: input.name.trim(),
        objective: input.objective,
        dailyBudget: input.dailyBudget,
        startAt: startAt.toISOString(),
        endAt: endAt ? endAt.toISOString() : null,
        countryCode: input.countryCode,
        minAge: input.minAge,
        maxAge: input.maxAge ?? null,
        gender: input.gender,
        media: {
          kind: file.creative.kind,
          bytes: file.bytes,
          contentType: file.creative.contentType,
          fileName: file.fileName,
        },
        brandName: input.brandName.trim(),
        headline: input.headline.trim(),
        callToAction: input.callToAction,
        url,
        startActive: input.startActive,
      })
      await this.db.query(
        `UPDATE campaign_publications
            SET status = 'published', external_ids = $2::jsonb, error = NULL, updated_at = now()
          WHERE id = $1`,
        [id, JSON.stringify(ids)]
      )
    } catch (caught) {
      const error =
        caught instanceof SnapchatPublishError
          ? { code: caught.code, step: caught.step, reason: caught.reason }
          : {
              code: caught instanceof IdentityError ? caught.code : "PUBLISH_FAILED",
              step: null,
              reason: caught instanceof Error ? caught.message.slice(0, 400) : String(caught),
            }
      console.error("campaigns.publish_failed", { id, organizationId, ...error })
      await this.db
        .query(
          `UPDATE campaign_publications SET status = 'failed', error = $2, updated_at = now()
            WHERE id = $1`,
          [id, JSON.stringify(error)]
        )
        .catch((dbError: unknown) =>
          console.error("campaigns.publish_record_failed", { id, dbError })
        )
    }
  }

  // Switches a published campaign on or off on the platform.
  async setActive(
    actor: AuthenticatedActor,
    id: string,
    active: boolean
  ): Promise<PublicationView> {
    const row = await this.row(actor.organizationId, id)
    const ids = json<Partial<SnapchatPublishedIds>>(row.external_ids, {})
    if (row.status !== "published" || !ids.campaignId) {
      throw new IdentityError(
        "PUBLICATION_NOT_PUBLISHED",
        409,
        "business",
        "Only a published campaign can be switched on or off."
      )
    }
    try {
      await this.snapchat.setCampaignStatus({
        accessToken: await this.snapchatAccess.resolveAccessToken(row.connection_id),
        adAccountId: row.ad_account_id,
        campaignId: ids.campaignId,
        active,
      })
    } catch (caught) {
      if (caught instanceof SnapchatPublishError) {
        throw new IdentityError(caught.code, 422, "external", caught.reason, { step: caught.step })
      }
      throw caught
    }
    await this.db.query(
      `UPDATE campaign_publications SET platform_status = $2, updated_at = now() WHERE id = $1`,
      [id, active ? "active" : "paused"]
    )
    return this.get(actor.organizationId, id)
  }

  // Waits for the publishes this process started (tests).
  async settled(): Promise<void> {
    await Promise.all([...this.running])
  }
}
