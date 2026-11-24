import type { PostgresDatabase } from "../infrastructure/postgres/database"

// What each creative in the library has done: the campaigns it was used in, the numbers the ad
// platform counted for its ads, and where it stands against the organization's other creatives.
//
// A creative is tied to an ad in two ways: the campaign was published from Madar (campaign_
// publications.external_ids says which ad carries which file), or the ad was found on the platform
// and its file brought into the library (campaign_creative_ads, creative-import.ts). The numbers are
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

// One ad that shows the creative: the campaign it is in, and the ad's own numbers.
export interface CreativeCampaignUse extends CreativeNumbers {
  // The campaign's record of being published from Madar, when it was.
  publicationId: string | null
  adId: string | null
  adName: string | null
  // The campaign's name.
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

  // The names and states of a connection's campaigns, ad sets and ads, as the last sync saw them.
  private async adDetails(connectionId: string) {
    const result = await this.db.query<{
      entity_type: string
      entity_id: string
      payload: unknown
      [key: string]: unknown
    }>(
      `SELECT entity_type, entity_id, payload FROM snapchat_records
        WHERE connection_id = $1 AND entity_type IN ('campaigns', 'ad_squads', 'ads')`,
      [connectionId]
    )
    const byType: Record<string, Map<string, Record<string, unknown>>> = {
      campaigns: new Map(),
      ad_squads: new Map(),
      ads: new Map(),
    }
    for (const row of result.rows) {
      byType[row.entity_type]?.set(row.entity_id, parse<Record<string, unknown>>(row.payload, {}))
    }
    return byType
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
    // Every ad that shows a library creative: the ads tied to one (campaign_creative_ads --
    // brought in from the platform, or added from Madar), and the ads of campaigns published
    // from Madar that have no tie yet.
    const ties = await this.db.query<{
      creative_id: string
      connection_id: string
      ad_id: string
      [key: string]: unknown
    }>(
      `SELECT creative_id, connection_id, ad_id FROM campaign_creative_ads
        WHERE organization_id = $1 AND platform = 'snapchat' AND creative_id IS NOT NULL
        ORDER BY created_at`,
      [organizationId]
    )
    interface Use {
      creativeId: string
      connectionId: string
      adId: string | null
      publication: PublicationRow | null
    }
    const publicationOfAd = new Map<string, PublicationRow>()
    for (const row of publications.rows) {
      const adId = parse<{ adId?: string }>(row.external_ids, {}).adId
      if (adId) publicationOfAd.set(`${row.connection_id}:${adId}`, row)
    }
    const used: Use[] = []
    const seen = new Set<string>()
    for (const tie of ties.rows) {
      const key = `${tie.connection_id}:${tie.ad_id}`
      seen.add(key)
      used.push({
        creativeId: tie.creative_id,
        connectionId: tie.connection_id,
        adId: tie.ad_id,
        publication: publicationOfAd.get(key) ?? null,
      })
    }
    for (const row of publications.rows) {
      if (!row.creative_id) continue
      const adId = parse<{ adId?: string }>(row.external_ids, {}).adId ?? null
      if (adId && seen.has(`${row.connection_id}:${adId}`)) continue
      used.push({
        creativeId: row.creative_id,
        connectionId: row.connection_id,
        adId,
        publication: row,
      })
    }

    const adIdsByConnection = new Map<string, Set<string>>()
    for (const entry of used) {
      if (!entry.adId) continue
      const ids = adIdsByConnection.get(entry.connectionId) ?? new Set<string>()
      ids.add(entry.adId)
      adIdsByConnection.set(entry.connectionId, ids)
    }
    const numbersByAd = new Map<string, CreativeNumbers>()
    const detailsByConnection = new Map<string, Awaited<ReturnType<typeof this.adDetails>>>()
    const currencyByConnection = new Map<string, string | null>()
    for (const [connectionId, adIds] of adIdsByConnection) {
      for (const [adId, numbers] of await this.adNumbers(connectionId, adIds)) {
        numbersByAd.set(adId, numbers)
      }
      detailsByConnection.set(connectionId, await this.adDetails(connectionId))
      const account = await this.db.query<{ currency_code: string | null }>(
        `SELECT currency_code FROM snapchat_ads_accounts WHERE connection_id = $1 LIMIT 1`,
        [connectionId]
      )
      currencyByConnection.set(connectionId, account.rows[0]?.currency_code ?? null)
    }

    const byCreative = new Map<string, CreativeInsights>()
    for (const { creativeId, connectionId, adId, publication } of used) {
      const details = detailsByConnection.get(connectionId)
      const ad = adId ? details?.ads.get(adId) : undefined
      // An ad tied to a creative but deleted on the platform since is no longer a use of it.
      if (!ad && !publication) continue
      const adSet = ad ? details?.ad_squads.get(String(ad.ad_squad_id ?? "")) : undefined
      const campaign = adSet ? details?.campaigns.get(String(adSet.campaign_id ?? "")) : undefined
      const insights = byCreative.get(creativeId) ?? {
        creativeId,
        currency: publication?.currency ?? currencyByConnection.get(connectionId) ?? null,
        campaigns: [],
        ...NO_NUMBERS,
        clickRate: null,
        costPerSignUp: null,
        rank: null,
        rankedOutOf: 0,
      }
      const numbers = (adId ? numbersByAd.get(adId) : undefined) ?? { ...NO_NUMBERS }
      const running = ad
        ? String(ad.status ?? "").toUpperCase() === "ACTIVE"
        : publication?.platform_status === "active"
      insights.campaigns.push({
        publicationId: publication?.id ?? null,
        adId,
        adName: ad && typeof ad.name === "string" ? ad.name : null,
        name:
          (campaign && typeof campaign.name === "string" ? campaign.name : null) ??
          publication?.name ??
          "",
        platform: publication?.platform ?? "snapchat",
        platformStatus: running ? "active" : "paused",
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
