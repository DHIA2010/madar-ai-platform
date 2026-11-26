import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Day-by-day numbers for single ads, ad sets and campaigns, and when each ad was created --
// what the check-up needs to tell a new ad (wait) from a tired one (it used to do better), and
// what a change did (the days before it against the days after).
//
// Read straight from the synced rows. Only Snapchat and TikTok keep a row per day for every
// level; Meta's sync keeps totals, so a Meta ad has no daily history here (only its age).

export interface DailyPoint {
  day: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
}

type Row = Record<string, unknown>

const payloadOf = (row: Row): Row =>
  (typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload ?? {})) as Row

const dayOf = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null
}

// Row ids look like <platform>:<connection>:<account>:<id>.
function parseRowId(rowId: string) {
  const [platform, connectionId, customerId, ...rest] = rowId.split(":")
  return { platform, connectionId, customerId, externalId: rest.join(":") }
}

function groupByConnection(rowIds: string[], platform: string) {
  const byConnection = new Map<string, Map<string, string>>()
  for (const rowId of rowIds) {
    const parsed = parseRowId(rowId)
    if (parsed.platform !== platform || !parsed.connectionId || !parsed.externalId) continue
    const ids = byConnection.get(parsed.connectionId) ?? new Map<string, string>()
    ids.set(parsed.externalId, rowId)
    byConnection.set(parsed.connectionId, ids)
  }
  return byConnection
}

function add(map: Map<string, Map<string, DailyPoint>>, rowId: string, point: DailyPoint) {
  const days = map.get(rowId) ?? new Map<string, DailyPoint>()
  const existing = days.get(point.day)
  if (existing) {
    existing.spend += point.spend
    existing.impressions += point.impressions
    existing.clicks += point.clicks
    existing.conversions += point.conversions
  } else {
    days.set(point.day, { ...point })
  }
  map.set(rowId, days)
}

export class AdHistory {
  constructor(private readonly db: PostgresDatabase) {}

  // Each row id's days in [from, to] (YYYY-MM-DD), oldest first. Days without activity are left out.
  async daily(
    actor: AuthenticatedActor,
    rowIds: string[],
    from: string,
    to: string
  ): Promise<Map<string, DailyPoint[]>> {
    const collected = new Map<string, Map<string, DailyPoint>>()

    for (const [connectionId, ids] of groupByConnection(rowIds, "snapchat_ads")) {
      const rows = await this.db.query<Row>(
        `SELECT r.record_date, r.payload
           FROM snapchat_records r
           JOIN snapchat_oauth_connections conn ON conn.id = r.connection_id
          WHERE r.connection_id = $1 AND conn.organization_id = $2 AND r.entity_type = 'stats'
            AND r.record_date >= $3::date AND r.record_date <= $4::date`,
        [connectionId, actor.organizationId, from, to]
      )
      for (const row of rows.rows) {
        const payload = payloadOf(row)
        const rowId = ids.get(String(payload.entityId ?? ""))
        const day = dayOf(payload.startTime) ?? dayOf(row.record_date)
        if (!rowId || !day) continue
        add(collected, rowId, {
          day,
          // Snapchat reports money in micro-currency.
          spend: (Number(payload.spend) || 0) / 1_000_000,
          impressions: Number(payload.impressions) || 0,
          clicks: Number(payload.swipes) || 0,
          conversions:
            (Number(payload.conversion_sign_ups) || 0) +
            (Number(payload.conversion_purchases) || 0),
        })
      }
    }

    for (const [connectionId, ids] of groupByConnection(rowIds, "tiktok_ads")) {
      const rows = await this.db.query<Row>(
        `SELECT r.record_date, r.payload
           FROM tiktok_ads_records r
           JOIN tiktok_ads_oauth_connections conn ON conn.id = r.connection_id
          WHERE r.connection_id = $1 AND conn.organization_id = $2
            AND r.entity_type IN ('insights', 'adgroup_insights', 'ad_insights')
            AND r.record_date >= $3::date AND r.record_date <= $4::date`,
        [connectionId, actor.organizationId, from, to]
      )
      for (const row of rows.rows) {
        const payload = payloadOf(row)
        const dimensions = (payload.dimensions ?? {}) as Row
        const metrics = (payload.metrics ?? {}) as Row
        const externalId = String(
          dimensions.ad_id ?? dimensions.adgroup_id ?? dimensions.campaign_id ?? ""
        )
        const rowId = ids.get(externalId)
        const day = dayOf(dimensions.stat_time_day) ?? dayOf(row.record_date)
        if (!rowId || !day) continue
        add(collected, rowId, {
          day,
          spend: Number(metrics.spend) || 0,
          impressions: Number(metrics.impressions) || 0,
          clicks: Number(metrics.clicks) || 0,
          conversions: Number(metrics.conversion) || 0,
        })
      }
    }

    const result = new Map<string, DailyPoint[]>()
    for (const [rowId, days] of collected) {
      result.set(
        rowId,
        [...days.values()]
          .filter((point) => point.impressions > 0 || point.spend > 0)
          .sort((a, b) => a.day.localeCompare(b.day))
      )
    }
    return result
  }

  // When each ad was created on its platform (ISO), where the synced row says.
  async createdAt(actor: AuthenticatedActor, rowIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>()
    const sources = [
      { platform: "snapchat_ads", table: "snapchat_records", conn: "snapchat_oauth_connections" },
      { platform: "tiktok_ads", table: "tiktok_ads_records", conn: "tiktok_ads_oauth_connections" },
      { platform: "meta_ads", table: "meta_records", conn: "meta_oauth_connections" },
    ]
    for (const source of sources) {
      for (const [connectionId, ids] of groupByConnection(rowIds, source.platform)) {
        const rows = await this.db.query<Row>(
          `SELECT r.entity_id, r.payload
             FROM ${source.table} r
             JOIN ${source.conn} conn ON conn.id = r.connection_id
            WHERE r.connection_id = $1 AND conn.organization_id = $2 AND r.entity_type = 'ads'`,
          [connectionId, actor.organizationId]
        )
        for (const row of rows.rows) {
          const rowId = ids.get(String(row.entity_id))
          if (!rowId) continue
          const payload = payloadOf(row)
          const raw = String(
            payload.created_at ?? payload.create_time ?? payload.created_time ?? ""
          )
          if (!raw) continue
          const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
            ? `${raw.replace(" ", "T")}Z`
            : raw
          const date = new Date(iso)
          if (!Number.isNaN(date.getTime())) result.set(rowId, date.toISOString())
        }
      }
    }
    return result
  }
}
