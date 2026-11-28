import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  parseServiceAccountKey,
  type SearchConsoleClient,
  type SearchConsoleFilter,
  type SearchConsoleRow,
  type ServiceAccountKey,
} from "./search-console"

// Madar Admin → السيو: how madar.my does in Google search -- clicks, impressions, position,
// the searches and pages behind them, and the searches Madar Admin follows day by day.

type Row = Record<string, unknown>

const DAY_MS = 86_400_000
const DEFAULT_RANGE_DAYS = 28
const MAX_RANGE_DAYS = 480
// Search Console's numbers settle about two days late.
const DATA_DELAY_DAYS = 2
const MAX_TRACKED_KEYWORDS = 50
const CACHE_MS = 10 * 60_000

export interface SeoStatus {
  connected: boolean
  clientEmail: string | null
  siteUrl: string | null
  connectedAt: string | null
}

export interface SeoTotals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SeoQueryRow extends SeoTotals {
  key: string
  previousPosition: number | null
  previousClicks: number
}

export interface SeoTrackedKeyword {
  id: string
  keyword: string
  createdAt: string
  current: SeoTotals | null
  previousPosition: number | null
  daily: Array<{ date: string; position: number; clicks: number; impressions: number }>
}

export interface SeoReport {
  siteUrl: string
  range: { startDate: string; endDate: string }
  previousRange: { startDate: string; endDate: string }
  totals: SeoTotals
  previousTotals: SeoTotals
  daily: Array<{ date: string } & SeoTotals>
  queries: SeoQueryRow[]
  pages: SeoQueryRow[]
  tracked: SeoTrackedKeyword[]
  fetchedAt: string
}

export interface SeoReportQuery {
  startDate?: string
  endDate?: string
  // ISO 3166-1 alpha-3, lower case ("sau"), or empty for every country.
  country?: string
  device?: "mobile" | "desktop" | "tablet"
}

type ClientFactory = (key: ServiceAccountKey) => SearchConsoleClient

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (time: number) => new Date(time).toISOString().slice(0, 10)
const emptyTotals = (): SeoTotals => ({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
const toTotals = (row: SearchConsoleRow | undefined): SeoTotals =>
  row
    ? { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }
    : emptyTotals()

// A keyword as Search Console stores searches: trimmed, single-spaced, lower case.
export const normalizeKeyword = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase()

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Picks the madar.my property out of what the robot can read (a domain property first).
export function pickSite(sites: Array<{ siteUrl: string }>): string | null {
  const urls = sites.map((site) => site.siteUrl)
  return (
    urls.find((url) => url === "sc-domain:madar.my") ??
    urls.find((url) => url.includes("www.madar.my")) ??
    urls.find((url) => url.includes("madar.my")) ??
    urls[0] ??
    null
  )
}

export class SeoService {
  private cache = new Map<string, { at: number; report: SeoReport }>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly client: ClientFactory,
    private readonly seal: (plain: string) => string,
    private readonly open: (sealed: string) => string,
    private readonly now: () => Date = () => new Date()
  ) {}

  private async settingsRow(): Promise<Row | undefined> {
    const result = await this.db.query<Row>(`SELECT * FROM seo_settings WHERE id = 1`)
    return result.rows[0]
  }

  async status(): Promise<SeoStatus> {
    const row = await this.settingsRow()
    const connectedAt = row?.connected_at
    return {
      connected: Boolean(row?.sealed_service_account && row?.site_url),
      clientEmail: (row?.client_email as string | null) ?? null,
      siteUrl: (row?.site_url as string | null) ?? null,
      connectedAt: connectedAt
        ? new Date(connectedAt instanceof Date ? connectedAt : String(connectedAt)).toISOString()
        : null,
    }
  }

  // Checks the key with Google and finds the madar.my property before saving anything.
  async connect(keyText: string, connectedBy: string): Promise<SeoStatus> {
    let key: ServiceAccountKey
    try {
      key = parseServiceAccountKey(keyText)
    } catch (error) {
      throw ERRORS.validation({ key: (error as Error).message })
    }
    let sites: Array<{ siteUrl: string }>
    try {
      sites = await this.client(key).sites()
    } catch (error) {
      throw ERRORS.validation({ key: `Google refused the key: ${(error as Error).message}` })
    }
    const siteUrl = pickSite(sites)
    if (!siteUrl) {
      throw ERRORS.validation({
        key: `The robot can't see any Search Console property yet. Add ${key.client_email} as a user of madar.my in Search Console, then try again.`,
      })
    }
    await this.db.query(
      `UPDATE seo_settings SET sealed_service_account = $1, client_email = $2, site_url = $3,
         connected_at = $4, connected_by = $5, updated_at = now()
       WHERE id = 1`,
      [
        this.seal(JSON.stringify(key)),
        key.client_email,
        siteUrl,
        this.now().toISOString(),
        connectedBy,
      ]
    )
    this.cache.clear()
    return this.status()
  }

  async disconnect(): Promise<void> {
    await this.db.query(
      `UPDATE seo_settings SET sealed_service_account = NULL, client_email = NULL, site_url = NULL,
         connected_at = NULL, connected_by = NULL, updated_at = now()
       WHERE id = 1`
    )
    this.cache.clear()
  }

  async keywords(): Promise<Array<{ id: string; keyword: string; createdAt: string }>> {
    const result = await this.db.query<Row>(
      `SELECT id, keyword, created_at FROM seo_tracked_keywords ORDER BY created_at ASC`
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      keyword: String(row.keyword),
      createdAt: new Date(
        row.created_at instanceof Date ? row.created_at : String(row.created_at)
      ).toISOString(),
    }))
  }

  async addKeywords(values: string[], createdBy: string): Promise<number> {
    const existing = await this.keywords()
    const known = new Set(existing.map((entry) => entry.keyword))
    const fresh = [...new Set(values.map(normalizeKeyword).filter(Boolean))].filter(
      (keyword) => !known.has(keyword)
    )
    if (existing.length + fresh.length > MAX_TRACKED_KEYWORDS) {
      throw ERRORS.validation({
        keywords: `You can follow up to ${MAX_TRACKED_KEYWORDS} searches.`,
      })
    }
    for (const keyword of fresh) {
      await this.db.query(
        `INSERT INTO seo_tracked_keywords (id, keyword, created_by, created_at)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), keyword, createdBy, this.now().toISOString()]
      )
    }
    if (fresh.length > 0) this.cache.clear()
    return fresh.length
  }

  async removeKeyword(id: string): Promise<void> {
    await this.db.query(`DELETE FROM seo_tracked_keywords WHERE id = $1`, [id])
    this.cache.clear()
  }

  private range(query: SeoReportQuery) {
    const latest = this.now().getTime() - DATA_DELAY_DAYS * DAY_MS
    let end = query.endDate && ISO_DATE.test(query.endDate) ? Date.parse(query.endDate) : latest
    if (end > latest) end = latest
    let start =
      query.startDate && ISO_DATE.test(query.startDate)
        ? Date.parse(query.startDate)
        : end - (DEFAULT_RANGE_DAYS - 1) * DAY_MS
    if (start > end) start = end
    if (end - start > (MAX_RANGE_DAYS - 1) * DAY_MS) start = end - (MAX_RANGE_DAYS - 1) * DAY_MS
    const length = Math.round((end - start) / DAY_MS) + 1
    const previousEnd = start - DAY_MS
    const previousStart = previousEnd - (length - 1) * DAY_MS
    return {
      range: { startDate: day(start), endDate: day(end) },
      previousRange: { startDate: day(previousStart), endDate: day(previousEnd) },
    }
  }

  async report(query: SeoReportQuery = {}): Promise<SeoReport | null> {
    const row = await this.settingsRow()
    if (!row?.sealed_service_account || !row?.site_url) return null
    const siteUrl = String(row.site_url)
    const { range, previousRange } = this.range(query)
    const tracked = await this.keywords()
    const cacheKey = JSON.stringify([
      siteUrl,
      range,
      query.country ?? "",
      query.device ?? "",
      tracked.map((entry) => entry.keyword),
    ])
    const cached = this.cache.get(cacheKey)
    if (cached && this.now().getTime() - cached.at < CACHE_MS) return cached.report

    const client = this.client(
      JSON.parse(this.open(String(row.sealed_service_account))) as ServiceAccountKey
    )
    const filters: SearchConsoleFilter[] = []
    if (query.country) {
      filters.push({ dimension: "country", operator: "equals", expression: query.country })
    }
    if (query.device) {
      filters.push({ dimension: "device", operator: "equals", expression: query.device })
    }
    const trackedRegex = tracked.length
      ? `^(${tracked.map((entry) => escapeRegex(entry.keyword)).join("|")})$`
      : null
    const trackedFilters: SearchConsoleFilter[] = trackedRegex
      ? [...filters, { dimension: "query", operator: "includingRegex", expression: trackedRegex }]
      : []
    const ask = (
      span: { startDate: string; endDate: string },
      dimensions: Array<"date" | "query" | "page">,
      rowLimit: number,
      extra: SearchConsoleFilter[] = filters
    ) => client.query(siteUrl, { ...span, dimensions, rowLimit, filters: extra })

    const [
      totals,
      previousTotals,
      daily,
      queries,
      previousQueries,
      pages,
      previousPages,
      trackedNow,
      trackedBefore,
      trackedDaily,
    ] = await Promise.all([
      ask(range, [], 1),
      ask(previousRange, [], 1),
      ask(range, ["date"], 500),
      ask(range, ["query"], 250),
      ask(previousRange, ["query"], 2000),
      ask(range, ["page"], 50),
      ask(previousRange, ["page"], 500),
      trackedRegex ? ask(range, ["query"], 500, trackedFilters) : Promise.resolve([]),
      trackedRegex ? ask(previousRange, ["query"], 500, trackedFilters) : Promise.resolve([]),
      trackedRegex ? ask(range, ["query", "date"], 25_000, trackedFilters) : Promise.resolve([]),
    ])

    const withPrevious = (current: SearchConsoleRow[], before: SearchConsoleRow[]) => {
      const earlier = new Map(before.map((entry) => [entry.keys[0], entry]))
      return current.map((entry) => {
        const previous = earlier.get(entry.keys[0])
        return {
          key: entry.keys[0] ?? "",
          ...toTotals(entry),
          previousPosition: previous ? previous.position : null,
          previousClicks: previous ? previous.clicks : 0,
        }
      })
    }
    const now = new Map(trackedNow.map((entry) => [entry.keys[0], entry]))
    const before = new Map(trackedBefore.map((entry) => [entry.keys[0], entry]))

    const report: SeoReport = {
      siteUrl,
      range,
      previousRange,
      totals: toTotals(totals[0]),
      previousTotals: toTotals(previousTotals[0]),
      daily: daily
        .map((entry) => ({ date: entry.keys[0] ?? "", ...toTotals(entry) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      queries: withPrevious(queries, previousQueries),
      pages: withPrevious(pages, previousPages),
      tracked: tracked.map((entry) => ({
        ...entry,
        current: now.has(entry.keyword) ? toTotals(now.get(entry.keyword)) : null,
        previousPosition: before.get(entry.keyword)?.position ?? null,
        daily: trackedDaily
          .filter((point) => point.keys[0] === entry.keyword)
          .map((point) => ({
            date: point.keys[1] ?? "",
            position: point.position,
            clicks: point.clicks,
            impressions: point.impressions,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      })),
      fetchedAt: this.now().toISOString(),
    }
    this.cache.set(cacheKey, { at: this.now().getTime(), report })
    if (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value as string)
    return report
  }

  // What the blog agent plans with: Saudi Arabia, the last 28 days. Null when not connected.
  async searchSignals(): Promise<{
    averagePosition: number
    followed: Array<{ keyword: string; position: number | null; impressions: number }>
    opportunities: Array<{ keyword: string; position: number; impressions: number; clicks: number }>
    pages: Array<{ path: string; position: number; impressions: number }>
  } | null> {
    const report = await this.report({ country: "sau" })
    if (!report) return null
    const path = (url: string) => {
      try {
        return decodeURIComponent(new URL(url).pathname)
      } catch {
        return url
      }
    }
    return {
      averagePosition: report.totals.position,
      followed: report.tracked.map((entry) => ({
        keyword: entry.keyword,
        position: entry.current?.position ?? null,
        impressions: entry.current?.impressions ?? 0,
      })),
      opportunities: report.queries
        .filter((row) => row.position > 3 && row.position <= 30)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15)
        .map((row) => ({
          keyword: row.key,
          position: row.position,
          impressions: row.impressions,
          clicks: row.clicks,
        })),
      pages: report.pages.slice(0, 10).map((row) => ({
        path: path(row.key),
        position: row.position,
        impressions: row.impressions,
      })),
    }
  }
}
