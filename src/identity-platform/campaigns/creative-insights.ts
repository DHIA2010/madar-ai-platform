import type { PostgresDatabase } from "../infrastructure/postgres/database"

// What each creative in the library has done: the campaigns it was used in, the numbers the ad
// platform counted for its ads, and where it stands against the organization's other creatives.
//
// A creative is tied to an ad only when the campaign was published from Madar -- that is where
// Madar learns which ad carries which file (campaign_publications.external_ids). The numbers are
// the ad's own daily figures from the Snapchat sync (snapchat_records, level "ad"), so they are
// as fresh as the last sync and cover the ad's whole life.

export interface CreativeNumbers {
  impressions: number
  // Snapchat's "swipes": the taps that open the ad's link.
  clicks: number
  spend: number
  pageViews: number
  signUps: number
}

export interface CreativeCampaignUse extends CreativeNumbers {
  publicationId: string
  name: string
  platform: string
  platformStatus: "active" | "paused"
}

export interface CreativeInsights extends CreativeNumbers {
  creativeId: string
  currency: string | null
  campaigns: CreativeCampaignUse[]
  // Taps out of every 100 views. Null until the creative has been seen at all.
  clickRate: number | null
  costPerSignUp: number | null
  // 1 is the best. Null until the creative has been seen often enough to be judged fairly.
  rank: number | null
  rankedOutOf: number
}

// Below this many views a tap rate is mostly luck, so the creative is not ranked yet.
export const MIN_IMPRESSIONS_TO_RANK = 1000

const NO_NUMBERS: CreativeNumbers = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  pageViews: 0,
  signUps: 0,
}

const add = (into: CreativeNumbers, more: CreativeNumbers) => {
  into.impressions += more.impressions
  into.clicks += more.clicks
  into.spend += more.spend
  into.pageViews += more.pageViews
  into.signUps += more.signUps
}

const parse = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

interface PublicationRow {
  id: string
  name: string
  platform: string
  connection_id: string
  creative_id: string | null
  currency: string | null
  platform_status: string
  external_ids: unknown
  [key: string]: unknown
}

export class CreativeInsightsService {
  constructor(private readonly db: PostgresDatabase) {}

  // The ad-level daily figures of one connection, summed per ad.
  private async adNumbers(
    connectionId: string,
    adIds: Set<string>
  ): Promise<Map<string, CreativeNumbers>> {
    const result = await this.db.query<{ payload: unknown; [key: string]: unknown }>(
      `SELECT payload FROM snapchat_records
        WHERE connection_id = $1 AND entity_type = 'stats' AND payload->>'level' = 'ad'`,
      [connectionId]
    )
    const totals = new Map<string, CreativeNumbers>()
    for (const row of result.rows) {
      const payload = parse<Record<string, unknown>>(row.payload, {})
      const adId = typeof payload.entityId === "string" ? payload.entityId : null
      if (!adId || !adIds.has(adId)) continue
      const current = totals.get(adId) ?? { ...NO_NUMBERS }
      add(current, {
        impressions: Number(payload.impressions) || 0,
        clicks: Number(payload.swipes) || 0,
        // Snapchat reports money in millionths of the account's currency.
        spend: (Number(payload.spend) || 0) / 1_000_000,
        pageViews: Number(payload.conversion_page_views) || 0,
        signUps: Number(payload.conversion_sign_ups) || 0,
      })
      totals.set(adId, current)
    }
    return totals
  }

  async forOrganization(organizationId: string): Promise<CreativeInsights[]> {
    const publications = await this.db.query<PublicationRow>(
      `SELECT id, name, platform, connection_id, creative_id, currency, platform_status,
              external_ids
         FROM campaign_publications
        WHERE organization_id = $1 AND status = 'published'
        ORDER BY created_at DESC`,
      [organizationId]
    )
    const used = publications.rows
      .map((row) => ({
        row,
        adId: parse<{ adId?: string }>(row.external_ids, {}).adId ?? null,
      }))
      .filter((entry) => entry.row.creative_id)

    const adIdsByConnection = new Map<string, Set<string>>()
    for (const entry of used) {
      if (!entry.adId) continue
      const ids = adIdsByConnection.get(entry.row.connection_id) ?? new Set<string>()
      ids.add(entry.adId)
      adIdsByConnection.set(entry.row.connection_id, ids)
    }
    const numbersByAd = new Map<string, CreativeNumbers>()
    for (const [connectionId, adIds] of adIdsByConnection) {
      for (const [adId, numbers] of await this.adNumbers(connectionId, adIds)) {
        numbersByAd.set(adId, numbers)
      }
    }

    const byCreative = new Map<string, CreativeInsights>()
    for (const { row, adId } of used) {
      const creativeId = row.creative_id as string
      const insights = byCreative.get(creativeId) ?? {
        creativeId,
        currency: row.currency,
        campaigns: [],
        ...NO_NUMBERS,
        clickRate: null,
        costPerSignUp: null,
        rank: null,
        rankedOutOf: 0,
      }
      const numbers = (adId ? numbersByAd.get(adId) : undefined) ?? { ...NO_NUMBERS }
      insights.campaigns.push({
        publicationId: row.id,
        name: row.name,
        platform: row.platform,
        platformStatus: row.platform_status === "active" ? "active" : "paused",
        ...numbers,
      })
      add(insights, numbers)
      byCreative.set(creativeId, insights)
    }

    const all = [...byCreative.values()]
    for (const insights of all) {
      insights.clickRate =
        insights.impressions > 0 ? (insights.clicks / insights.impressions) * 100 : null
      insights.costPerSignUp = insights.signUps > 0 ? insights.spend / insights.signUps : null
    }
    // Ranked by tap rate: it is the one figure that judges the design itself, whatever the
    // campaign's budget or goal was. Equal rates fall back to the creative seen more.
    const ranked = all
      .filter((insights) => insights.impressions >= MIN_IMPRESSIONS_TO_RANK)
      .sort((a, b) => (b.clickRate ?? 0) - (a.clickRate ?? 0) || b.impressions - a.impressions)
    ranked.forEach((insights, index) => {
      insights.rank = index + 1
    })
    for (const insights of all) insights.rankedOutOf = ranked.length
    return all
  }
}
