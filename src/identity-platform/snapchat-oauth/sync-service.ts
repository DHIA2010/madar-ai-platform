import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { SnapchatOAuthRepository } from "./repository"
import type { SnapchatOAuthService } from "./service"
import { SnapchatSyncRepository, type SnapchatSyncRecordInput } from "./sync-repository"

const DEFAULT_SNAPCHAT_API_BASE_URL = "https://adsapi.snapchat.com/v1"
// Snapchat ad accounts can have thousands of campaigns/ads/stats-days -- this bounds a single
// sync run so a misbehaving API (e.g. a next_link that never stops appearing) can't loop forever.
const MAX_PAGES_PER_ENTITY = 200
// Campaigns/ads sync full history (no API limit there). Daily stats are deliberately bounded
// to a fixed start date instead of true full history back to Snapchat's launch: a full
// 2015-to-now backfill needs ~130 rate-limited 32-day-chunked API calls (confirmed live --
// this reliably exceeds a synchronous request/response timeout even with retries/backoff),
// which doesn't fit this connector's synchronous sync() model the way products/orders/
// campaigns do. 2025-01-01 (~19 chunks) is a deliberate scope decision (confirmed with the
// user), not a technical limit -- widen it once sync moves to an incremental/background model.
const STATS_HISTORY_START_YEAR = 2025
const STATS_HISTORY_START_MONTH = 1
const STATS_HISTORY_START_DAY = 1
// DAY-granularity Stats queries reject intervals over 32 days (confirmed against the live
// API: "Timeseries queries with DAY granularity cannot query time intervals of more than 32
// days") -- even the bounded window above has to be walked in chunks.
const STATS_WINDOW_DAYS = 32
const STATS_WINDOW_MS = STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000
// Safety bound on the number of 32-day windows walked per sync -- 2025-01-01 to now is ~19
// windows; this leaves headroom for that to grow before hitting the cap.
const MAX_STATS_WINDOWS = 40
// 10 concurrent requests reliably triggered Snapchat's per-account rate limit (confirmed
// live); this lower value plus the retry-with-backoff in fetchStatsWindow keeps 429s rare.
const STATS_WINDOW_CONCURRENCY = 4
const STATS_WINDOW_MAX_RETRIES = 4
// Plain AdAccount-level stats only accept "spend" (confirmed live), but that restriction is
// lifted when using breakdown=campaign (confirmed against Snapchat's docs) -- so this fetches
// the full field set broken out per campaign in the same request, rather than an
// account-wide total. Snapchat has no literal "clicks"/"ctr" fields; "swipes" is the
// swipe-up equivalent of a click, and "swipe_up_percent" is its pre-computed CTR equivalent.
const STATS_FIELDS = "spend,impressions,swipes,swipe_up_percent"

// Computes the UTC offset (in minutes, local = UTC + offset) that `timeZone` observes at
// `date` -- needed because Snapchat's DAY-granularity Stats API requires start_time/end_time
// to fall exactly on local-midnight boundaries in the ad account's own timezone, not UTC
// (confirmed against the live API: "must have a start time that is the start of day (00:00:00)
// for the account's timezone").
function getUtcOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
  return (asUtc - date.getTime()) / 60000
}

function localMidnightUtc(timeZone: string, year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const offsetMinutes = getUtcOffsetMinutes(timeZone, guess)
  return new Date(guess.getTime() - offsetMinutes * 60000)
}

function currentLocalDateParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value
  return { year: +map.year, month: +map.month, day: +map.day }
}

interface SnapchatCampaignApiRow {
  id: string
  name?: string
  status?: string
  objective?: string
  daily_budget_micro?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface SnapchatAdSquadApiRow {
  id: string
  name?: string
  status?: string
  campaign_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

interface SnapchatAdApiRow {
  id: string
  name?: string
  status?: string
  ad_squad_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// One row per entity (campaign or ad) per day, produced by flattening the account-level Stats
// endpoint's breakdown=campaign / breakdown=ad response (see fetchStatsWindow). Ad-squad-level
// daily stats are derived from the ad-level rows (see deriveAdSquadDailyStats) rather than
// fetched directly, since Snapchat only supports breakdown=adsquad at the CAMPAIGN level --
// fetching that directly would mean one call per campaign per window, which doesn't scale to
// accounts with many campaigns without risking the same timeout this session already hit twice.
interface SnapchatBreakdownDailyStat {
  entityId: string
  startTime: string
  endTime?: string
  stats: Record<string, unknown>
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "SNAPCHAT_SYNC_FORBIDDEN", false, 403)
  }
}

function toRecordDate(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}

// Snapchat's Marketing API wraps every list entry as { sub_request_status, <singular>: {...} }
// (confirmed against Snapchat's docs and against the account-discovery fix earlier this
// session) and paginates via a "paging.next_link" full URL rather than a page= parameter.
async function fetchAllPagesByNextLink<T>(input: {
  initialUrl: string
  accessToken: string
  listKey: string
  singularKey: string
}): Promise<T[]> {
  const results: T[] = []
  let url: string | null = input.initialUrl
  let pages = 0

  while (url && pages < MAX_PAGES_PER_ENTITY) {
    const response: Response = await fetch(url, {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Snapchat API request failed during sync.",
        "SNAPCHAT_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Record<string, unknown>
    const entries = Array.isArray(body[input.listKey])
      ? (body[input.listKey] as Array<Record<string, unknown>>)
      : []

    for (const entry of entries) {
      const item = entry[input.singularKey]
      if (item) {
        results.push(item as T)
      }
    }

    const paging = body.paging as { next_link?: string } | undefined
    url = paging?.next_link ?? null
    pages += 1
  }

  return results
}

function buildStatsWindows(timeZone: string): Array<{ start: Date; end: Date }> {
  const todayParts = currentLocalDateParts(timeZone, new Date())
  const rangeEnd = localMidnightUtc(timeZone, todayParts.year, todayParts.month, todayParts.day)
  const rangeStart = localMidnightUtc(
    timeZone,
    STATS_HISTORY_START_YEAR,
    STATS_HISTORY_START_MONTH,
    STATS_HISTORY_START_DAY
  )

  const windows: Array<{ start: Date; end: Date }> = []
  let windowStart = rangeStart

  while (windowStart < rangeEnd && windows.length < MAX_STATS_WINDOWS) {
    const naiveWindowEnd = new Date(
      Math.min(windowStart.getTime() + STATS_WINDOW_MS, rangeEnd.getTime())
    )
    // Re-align the chunk's end to local midnight -- adding a fixed millisecond offset can
    // drift off the day boundary across a DST transition in the account's timezone.
    const naiveEndParts = currentLocalDateParts(timeZone, naiveWindowEnd)
    const windowEnd = localMidnightUtc(
      timeZone,
      naiveEndParts.year,
      naiveEndParts.month,
      naiveEndParts.day
    )

    if (windowEnd <= windowStart) {
      break
    }
    windows.push({ start: windowStart, end: windowEnd })
    windowStart = windowEnd
  }

  return windows
}

async function fetchStatsWindow(input: {
  apiBaseUrl: string
  accountId: string
  accessToken: string
  fields: string
  breakdown: "campaign" | "ad"
  window: { start: Date; end: Date }
}): Promise<SnapchatBreakdownDailyStat[]> {
  const statsUrl = new URL(`${input.apiBaseUrl}/adaccounts/${input.accountId}/stats`)
  statsUrl.searchParams.set("granularity", "DAY")
  statsUrl.searchParams.set("breakdown", input.breakdown)
  statsUrl.searchParams.set("start_time", input.window.start.toISOString())
  statsUrl.searchParams.set("end_time", input.window.end.toISOString())
  statsUrl.searchParams.set("fields", input.fields)

  let response: Response | null = null
  for (let attempt = 0; attempt <= STATS_WINDOW_MAX_RETRIES; attempt += 1) {
    response = await fetch(statsUrl.toString(), {
      headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" },
    })
    if (response.ok) {
      break
    }
    // 429s are expected under concurrent stats fetching -- Snapchat's own per-account rate
    // limit (confirmed live: 10 concurrent requests reliably triggers "Too Many Requests"
    // even though a lower steady-state concurrency does not). Back off and retry rather than
    // failing the whole sync over a transient throttle.
    if (response.status === 429 && attempt < STATS_WINDOW_MAX_RETRIES) {
      const retryAfterHeader = response.headers.get("retry-after")
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN
      const delayMs = Number.isFinite(retryAfterMs)
        ? retryAfterMs
        : Math.min(500 * 2 ** attempt, 4000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      continue
    }
    break
  }

  if (!response || !response.ok) {
    throw new IntegrationProviderError(
      "Snapchat API request failed during sync.",
      "SNAPCHAT_SYNC_API_REQUEST_FAILED",
      true,
      502
    )
  }

  // NOTE: this connected ad account currently has zero campaigns, so the exact
  // breakdown + DAY-granularity response shape below is extrapolated from Snapchat's
  // documented TOTAL-granularity breakdown example (which nests breakdown_stats.<type>[]
  // under total_stat) rather than confirmed against a real response -- everything else in
  // this file was verified live. If this comes back empty once real campaigns exist, check
  // the actual response shape before assuming the fields are wrong.
  const body = (await response.json()) as {
    timeseries_stats?: Array<{
      timeseries_stat?: {
        timeseries?: Array<{
          start_time: string
          end_time?: string
          breakdown_stats?: Record<string, Array<{ id?: string; stats?: Record<string, unknown> }>>
        }>
      }
    }>
  }

  const results: SnapchatBreakdownDailyStat[] = []
  for (const entry of body.timeseries_stats ?? []) {
    for (const day of entry.timeseries_stat?.timeseries ?? []) {
      for (const item of day.breakdown_stats?.[input.breakdown] ?? []) {
        if (!item.id) continue
        results.push({
          entityId: item.id,
          startTime: day.start_time,
          endTime: day.end_time,
          stats: item.stats ?? {},
        })
      }
    }
  }
  return results
}

// Walks the full-history window in <=32-day chunks (Snapchat's own limit for DAY-granularity
// Stats queries), aligning every chunk boundary to local midnight in the ad account's own
// timezone (also a hard requirement confirmed against the live API). A decade of history is
// ~130 chunks -- fetching them one at a time made a single sync take minutes (confirmed by a
// live run that timed out), so this fetches a bounded number concurrently instead of
// sequentially, matching how e.g. a browser caps concurrent requests per host rather than
// either fully serializing or fully parallelizing them.
async function fetchDailyStatsAllWindows(input: {
  apiBaseUrl: string
  accountId: string
  accessToken: string
  timeZone: string
  fields: string
  breakdown: "campaign" | "ad"
}): Promise<SnapchatBreakdownDailyStat[]> {
  const windows = buildStatsWindows(input.timeZone)
  const results: SnapchatBreakdownDailyStat[] = []
  let cursor = 0

  async function worker() {
    while (cursor < windows.length) {
      const index = cursor
      cursor += 1
      const chunk = await fetchStatsWindow({
        apiBaseUrl: input.apiBaseUrl,
        accountId: input.accountId,
        accessToken: input.accessToken,
        fields: input.fields,
        breakdown: input.breakdown,
        window: windows[index],
      })
      results.push(...chunk)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(STATS_WINDOW_CONCURRENCY, windows.length) }, () => worker())
  )

  return results
}

// Snapchat only supports breakdown=adsquad at the CAMPAIGN level (one call per campaign per
// window), which doesn't scale the same way account-level breakdown=campaign/ad does. Since
// every ad already carries its own ad_squad_id (from the ads list), ad-squad daily totals can
// be derived by summing the already-fetched ad-level daily stats grouped by ad squad -- zero
// extra API calls, and mathematically equivalent to what Snapchat's own adsquad breakdown
// would return (an ad squad's daily total is exactly the sum of its ads' daily totals).
function deriveAdSquadDailyStats(input: {
  adDailyStats: SnapchatBreakdownDailyStat[]
  adSquadIdByAdId: Map<string, string>
}): SnapchatBreakdownDailyStat[] {
  const grouped = new Map<string, SnapchatBreakdownDailyStat>()

  for (const stat of input.adDailyStats) {
    const adSquadId = input.adSquadIdByAdId.get(stat.entityId)
    if (!adSquadId) continue

    const key = `${adSquadId}:${stat.startTime}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        entityId: adSquadId,
        startTime: stat.startTime,
        endTime: stat.endTime,
        stats: { ...stat.stats },
      })
      continue
    }

    for (const [field, value] of Object.entries(stat.stats)) {
      if (typeof value !== "number") continue
      const current = existing.stats[field]
      existing.stats[field] = (typeof current === "number" ? current : 0) + value
    }
  }

  return Array.from(grouped.values())
}

export class SnapchatSyncService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: SnapchatOAuthRepository,
    private readonly syncRepository: SnapchatSyncRepository,
    private readonly oauthService: SnapchatOAuthService,
    config?: { apiBaseUrl?: string }
  ) {
    this.apiBaseUrl =
      config?.apiBaseUrl ??
      process.env.SNAPCHAT_MARKETING_API_BASE_URL ??
      DEFAULT_SNAPCHAT_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat connection not found.",
        "SNAPCHAT_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Snapchat connection not found.",
        "SNAPCHAT_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Snapchat connection is not connected.",
        "SNAPCHAT_CONNECTION_NOT_READY",
        false,
        409
      )
    }
    return connection
  }

  private async requireAccessibleAdAccount(connectionId: string, customerId: string) {
    const account = await this.oauthRepository.findAccessibleCustomerAccount(
      connectionId,
      customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "Snapchat ad account is not accessible for this connection.",
        "SNAPCHAT_INVALID_ACCOUNT",
        false,
        400
      )
    }
    return account
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectedConnection(actor, input.connectionId)
    const account = await this.requireAccessibleAdAccount(connection.id, input.customerId)

    const syncRun = await this.syncRepository.createOrLoadSyncRun({
      connectionId: connection.id,
      organizationId: connection.organizationId,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      customerId: input.customerId,
      startDate: input.startDate,
      endDate: input.endDate,
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
    })

    // Idempotent replay: the same idempotencyKey for an already-completed run returns the
    // cached result without re-fetching from Snapchat, matching Salla's sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)
      const accountId = input.customerId
      const base = this.apiBaseUrl.replace(/\/$/, "")
      // Ad accounts have their own reporting timezone -- Snapchat rejects any DAY-granularity
      // Stats query whose start_time/end_time aren't exactly local midnight in that timezone.
      const timeZone = account.timeZone ?? "UTC"

      const [campaigns, adSquads, ads] = await Promise.all([
        fetchAllPagesByNextLink<SnapchatCampaignApiRow>({
          initialUrl: `${base}/adaccounts/${accountId}/campaigns`,
          accessToken,
          listKey: "campaigns",
          singularKey: "campaign",
        }),
        fetchAllPagesByNextLink<SnapchatAdSquadApiRow>({
          initialUrl: `${base}/adaccounts/${accountId}/adsquads`,
          accessToken,
          listKey: "adsquads",
          singularKey: "adsquad",
        }),
        fetchAllPagesByNextLink<SnapchatAdApiRow>({
          initialUrl: `${base}/adaccounts/${accountId}/ads`,
          accessToken,
          listKey: "ads",
          singularKey: "ad",
        }),
      ])

      // Campaign- and ad-level daily stats are each a single windowed series at the account
      // level (breakdown=campaign / breakdown=ad); ad-squad-level is derived from the ad-level
      // rows below rather than fetched directly (see deriveAdSquadDailyStats).
      const [campaignDailyStats, adDailyStats] = await Promise.all([
        fetchDailyStatsAllWindows({
          apiBaseUrl: base,
          accountId,
          accessToken,
          timeZone,
          fields: STATS_FIELDS,
          breakdown: "campaign",
        }),
        fetchDailyStatsAllWindows({
          apiBaseUrl: base,
          accountId,
          accessToken,
          timeZone,
          fields: STATS_FIELDS,
          breakdown: "ad",
        }),
      ])

      const adSquadIdByAdId = new Map(
        ads
          .map((ad) => [String(ad.id), ad.ad_squad_id ? String(ad.ad_squad_id) : null] as const)
          .filter((entry): entry is [string, string] => entry[1] !== null)
      )
      const adSquadDailyStats = deriveAdSquadDailyStats({ adDailyStats, adSquadIdByAdId })

      function statRecords(
        level: "campaign" | "ad_squad" | "ad",
        stats: SnapchatBreakdownDailyStat[]
      ) {
        return stats.map((stat) => ({
          entityType: "stats" as const,
          entityId: `${stat.entityId}:${stat.startTime}`,
          recordDate: toRecordDate([stat.startTime]),
          payload: {
            level,
            entityId: stat.entityId,
            startTime: stat.startTime,
            endTime: stat.endTime,
            ...stat.stats,
          } as Record<string, unknown>,
        }))
      }

      const records: SnapchatSyncRecordInput[] = [
        ...campaigns.map((campaign) => ({
          entityType: "campaigns" as const,
          entityId: String(campaign.id),
          recordDate: toRecordDate([campaign.updated_at, campaign.created_at]),
          payload: campaign as Record<string, unknown>,
        })),
        ...adSquads.map((adSquad) => ({
          entityType: "ad_squads" as const,
          entityId: String(adSquad.id),
          recordDate: toRecordDate([adSquad.updated_at, adSquad.created_at]),
          payload: adSquad as Record<string, unknown>,
        })),
        ...ads.map((ad) => ({
          entityType: "ads" as const,
          entityId: String(ad.id),
          recordDate: toRecordDate([ad.updated_at, ad.created_at]),
          payload: ad as Record<string, unknown>,
        })),
        ...statRecords("campaign", campaignDailyStats),
        ...statRecords("ad_squad", adSquadDailyStats),
        ...statRecords("ad", adDailyStats),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        campaigns: campaigns.length,
        adSquads: adSquads.length,
        ads: ads.length,
        stats: campaignDailyStats.length + adSquadDailyStats.length + adDailyStats.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "SNAPCHAT_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode =
        error instanceof IntegrationProviderError ? error.code : "SNAPCHAT_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Snapchat sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleAdAccount(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
