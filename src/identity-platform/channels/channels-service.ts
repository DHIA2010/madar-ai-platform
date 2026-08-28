import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  CampaignsPerformanceAggregationService,
  type CampaignPerformancePlatform,
  type CampaignPerformancePlatformRow,
  type CampaignPerformanceQuery,
} from "../campaigns/performance-service"
import { OrdersAggregationService, type OrderSummaryView } from "../orders/service"
import { StoresAggregationService, type StorePlatform } from "../stores/service"

// The only 4 ad-spend platforms that exist anywhere in this codebase (provider registry +
// connection wizard) -- there is no 5th. "Google Ads" here merges the 3 Google sub-platforms
// (Search/Display/YouTube) the Campaigns page tracks separately, since the Channels page cares
// about one spend number per real ad account connection, not per campaign type. Names match
// PLATFORM_ICON's keys exactly (src/components/platform-badge.tsx) -- note "Snapchat", not
// "Snapchat Ads", matching an inconsistency already present in that icon map.
export type ChannelName = "Google Ads" | "Meta Ads" | "TikTok Ads" | "Snapchat"
const CHANNEL_NAMES: ChannelName[] = ["Google Ads", "Meta Ads", "TikTok Ads", "Snapchat"]
const TOTAL_CHANNELS = CHANNEL_NAMES.length

// Mirrors stores/service.ts's computeSyncHealth (healthy/stale/failed/never_synced) -- ad
// platforms sync daily, not weekly like stores, so the staleness threshold is tighter.
export type ChannelHealth = "healthy" | "stale" | "failed" | "never_synced"
const HEALTH_STALE_AFTER_HOURS = 24
const STALE_SYNC_ALERT_AFTER_MINUTES = 90
const SPEND_ANOMALY_THRESHOLD_PCT = 30

export interface ChannelRow {
  name: ChannelName
  connected: boolean
  spend: number
  revenue: number
  roas: number
  conversions: number
  campaigns: number
  health: ChannelHealth
  lastSyncedAt: string | null
  sparkline: number[]
}

export interface ChannelsSummary {
  spend: number
  spendChangePct: number | null
  revenue: number
  revenueChangePct: number | null
  roas: number
  roasChangePct: number | null
  conversions: number
  conversionsChangePct: number | null
  cpa: number
  cpaChangePct: number | null
  activeChannels: number
  totalChannels: number
}

export interface ChannelsTrendPoint {
  bucketStart: string
  spendByChannel: Record<ChannelName, number>
}

export interface ChannelAlert {
  channel: ChannelName
  type: "stale_sync" | "spend_spike" | "spend_drop"
  severity: "warning" | "error"
  minutesSinceSync?: number
  todaySpend?: number
  trailingAverageSpend?: number
  changePct?: number
}

// The only 3 e-commerce platforms that exist anywhere in this codebase (StoresAggregationService/
// OrdersAggregationService's own PROVIDER_CONFIG) -- no WooCommerce connector exists, so it's
// never included here even though it appears in some earlier design mockups.
const STORE_PLATFORMS: StorePlatform[] = ["Salla", "Zid", "Shopify"]

export interface StorePlatformRow {
  platform: StorePlatform
  // Real count of synced customer records (StoresAggregationService), all-time -- unlike
  // orders/revenue/AOV/trend below, this is not scoped to the selected date range.
  customers: number
  orders: number
  ordersChangePct: number | null
  revenue: number
  revenueChangePct: number | null
  averageOrderValue: number
  trend: number[]
}

const TOP_PRODUCTS_LIMIT = 10

export interface TopProductRow {
  name: string
  orders: number
  quantitySold: number
}

function groupOrderRevenueByDay(orders: OrderSummaryView[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const order of orders) {
    const day = order.createdAt.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + order.amount)
  }
  return byDay
}

interface ChannelsQuery {
  startDate?: string
  endDate?: string
}

interface DateRange {
  startDateSql: string
  endDateSql: string
}

// Same pattern as campaigns/performance-service.ts's resolveDateRange/computeChangePct --
// duplicated locally (both are ~10 lines) rather than cross-importing private internals from
// another domain module, keeping channels/ independent of campaigns/'s implementation details.
const DEFAULT_WINDOW_DAYS = 30

function resolveDateRange(query: ChannelsQuery): { current: DateRange; previous: DateRange } {
  const endDate = query.endDate ? new Date(query.endDate) : new Date()
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const periodMs = endDate.getTime() - startDate.getTime()
  const previousStart = new Date(startDate.getTime() - periodMs)
  const previousEnd = new Date(startDate.getTime() - 1)

  const toSql = (d: Date) => d.toISOString().slice(0, 10)
  return {
    current: { startDateSql: toSql(startDate), endDateSql: toSql(endDate) },
    previous: { startDateSql: toSql(previousStart), endDateSql: toSql(previousEnd) },
  }
}

// Real Postgres casts timestamptz/date -> text fine; pg-mem (this test harness's in-memory
// Postgres) doesn't -- same limitation already worked around in campaigns/performance-service.ts
// (see toActivityDateString there). Selecting the raw column and converting in JS sidesteps it.
function toIsoString(value: string | Date | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function toDateOnlyString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function computeChangePct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function computeChannelHealth(input: {
  connectionStatus: string | null
  lastSyncedAt: string | null
}): ChannelHealth {
  if (input.connectionStatus !== "connected") {
    return input.lastSyncedAt ? "failed" : "never_synced"
  }
  if (!input.lastSyncedAt) {
    return "never_synced"
  }
  const ageHours = (Date.now() - new Date(input.lastSyncedAt).getTime()) / (1000 * 60 * 60)
  return ageHours <= HEALTH_STALE_AFTER_HOURS ? "healthy" : "stale"
}

interface ConnectionState {
  connected: boolean
  connectionStatus: string | null
  lastSyncedAt: string | null
}

async function fetchGoogleConnectionState(
  db: PostgresDatabase,
  actor: AuthenticatedActor
): Promise<ConnectionState> {
  const result = await db.query<{ status: string; last_synced_at: string | Date | null }>(
    `
    SELECT status, last_synced_at
    FROM integration_connections
    WHERE provider_id = 'google-ads' AND organization_id = $1
      AND ($2::uuid IS NULL OR workspace_id = $2::uuid)
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [actor.organizationId, actor.workspaceId ?? null]
  )
  const row = result.rows[0]
  return {
    connected: row?.status === "connected",
    connectionStatus: row?.status ?? null,
    lastSyncedAt: toIsoString(row?.last_synced_at ?? null),
  }
}

// Meta/TikTok/Snapchat connections live in their own *_oauth_connections table, not the shared
// integration_connections table Google Ads uses (confirmed against how each connector's own
// sync pipeline and this file's test seeds create connection rows) -- and none of them write a
// last-synced timestamp onto that row, so it's derived from their own *_sync_runs table instead.
async function fetchOwnTableConnectionState(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  connectionsTable: string,
  syncRunsTable: string
): Promise<ConnectionState> {
  // A correlated subquery ("... WHERE sr.connection_id = conn.id") fails on pg-mem (this test
  // harness's in-memory Postgres) with "column conn.id does not exist" -- a pg-mem-only scoping
  // limitation, not a real Postgres one. A LEFT JOIN + GROUP BY is equivalent and portable.
  const result = await db.query<{ status: string; last_synced_at: string | Date | null }>(
    `
    SELECT conn.status, MAX(sr.completed_at) as last_synced_at
    FROM ${connectionsTable} conn
    LEFT JOIN ${syncRunsTable} sr ON sr.connection_id = conn.id AND sr.status = 'completed'
    WHERE conn.organization_id = $1
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND conn.deleted_at IS NULL
    GROUP BY conn.id, conn.status, conn.updated_at
    ORDER BY conn.updated_at DESC
    LIMIT 1
    `,
    [actor.organizationId, actor.workspaceId ?? null]
  )
  const row = result.rows[0]
  return {
    connected: row?.status === "connected",
    connectionStatus: row?.status ?? null,
    lastSyncedAt: toIsoString(row?.last_synced_at ?? null),
  }
}

async function fetchAllConnectionStates(
  db: PostgresDatabase,
  actor: AuthenticatedActor
): Promise<Record<ChannelName, ConnectionState>> {
  const [google, meta, tiktok, snapchat] = await Promise.all([
    fetchGoogleConnectionState(db, actor),
    fetchOwnTableConnectionState(db, actor, "meta_oauth_connections", "meta_sync_runs"),
    fetchOwnTableConnectionState(db, actor, "tiktok_ads_oauth_connections", "tiktok_ads_sync_runs"),
    fetchOwnTableConnectionState(db, actor, "snapchat_oauth_connections", "snapchat_sync_runs"),
  ])
  return { "Google Ads": google, "Meta Ads": meta, "TikTok Ads": tiktok, Snapchat: snapchat }
}

interface DailySpendRow {
  date: string | Date
  spend: string | number | null
  [key: string]: unknown
}

async function fetchGoogleDailySpend(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<DailySpendRow[]> {
  const result = await db.query<{ date: string | Date; cost_micros: string | number | null }>(
    `
    SELECT m.metric_date as date, SUM(m.cost_micros) as cost_micros
    FROM google_ads_daily_metrics m
    JOIN integration_connections conn ON conn.id = m.connection_id
    WHERE conn.provider_id = 'google-ads' AND conn.organization_id = $1
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND m.metric_scope = 'campaign'
      AND m.metric_date BETWEEN $3::date AND $4::date
    GROUP BY m.metric_date
    ORDER BY m.metric_date
    `,
    [actor.organizationId, actor.workspaceId ?? null, range.startDateSql, range.endDateSql]
  )
  return result.rows.map((row) => ({
    date: row.date,
    spend: (Number(row.cost_micros) || 0) / 1_000_000,
  }))
}

async function fetchMetaDailySpend(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<DailySpendRow[]> {
  const result = await db.query<DailySpendRow>(
    `
    SELECT r.record_date as date, SUM(COALESCE((r.payload->>'spend')::numeric, 0)) as spend
    FROM meta_records r
    JOIN meta_oauth_connections conn ON conn.id = r.connection_id
    WHERE r.entity_type = 'insights' AND conn.organization_id = $1
      AND conn.deleted_at IS NULL AND conn.status = 'connected'
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND r.record_date BETWEEN $3::date AND $4::date
    GROUP BY r.record_date
    ORDER BY r.record_date
    `,
    [actor.organizationId, actor.workspaceId ?? null, range.startDateSql, range.endDateSql]
  )
  return result.rows
}

async function fetchTikTokDailySpend(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<DailySpendRow[]> {
  const result = await db.query<DailySpendRow>(
    `
    SELECT r.record_date as date,
      SUM(COALESCE((r.payload->'metrics'->>'spend')::numeric, 0)) as spend
    FROM tiktok_ads_records r
    JOIN tiktok_ads_oauth_connections conn ON conn.id = r.connection_id
    WHERE r.entity_type = 'insights' AND conn.organization_id = $1
      AND conn.deleted_at IS NULL AND conn.status = 'connected'
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND r.record_date BETWEEN $3::date AND $4::date
    GROUP BY r.record_date
    ORDER BY r.record_date
    `,
    [actor.organizationId, actor.workspaceId ?? null, range.startDateSql, range.endDateSql]
  )
  return result.rows
}

async function fetchSnapchatDailySpend(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<DailySpendRow[]> {
  // entity_type='stats' unifies campaign/ad_squad/ad level rows under one bucket (see
  // campaigns/performance-service.ts's reduceSnapchatStats) -- must filter to level='campaign'
  // or spend gets triple-counted. Spend is micro-currency (1,000,000 = 1.00), same fix as the
  // Campaigns page's Snapchat spend conversion.
  const result = await db.query<DailySpendRow>(
    `
    SELECT r.record_date as date,
      SUM(COALESCE((r.payload->>'spend')::numeric, 0)) / 1000000 as spend
    FROM snapchat_records r
    JOIN snapchat_oauth_connections conn ON conn.id = r.connection_id
    WHERE r.entity_type = 'stats' AND r.payload->>'level' = 'campaign'
      AND conn.organization_id = $1
      AND conn.deleted_at IS NULL AND conn.status = 'connected'
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND r.record_date BETWEEN $3::date AND $4::date
    GROUP BY r.record_date
    ORDER BY r.record_date
    `,
    [actor.organizationId, actor.workspaceId ?? null, range.startDateSql, range.endDateSql]
  )
  return result.rows
}

async function fetchAllDailySpend(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<Record<ChannelName, Map<string, number>>> {
  const [google, meta, tiktok, snapchat] = await Promise.all([
    fetchGoogleDailySpend(db, actor, range),
    fetchMetaDailySpend(db, actor, range),
    fetchTikTokDailySpend(db, actor, range),
    fetchSnapchatDailySpend(db, actor, range),
  ])

  const toMap = (rows: DailySpendRow[]) =>
    new Map(rows.map((row) => [toDateOnlyString(row.date), Number(row.spend) || 0]))

  return {
    "Google Ads": toMap(google),
    "Meta Ads": toMap(meta),
    "TikTok Ads": toMap(tiktok),
    Snapchat: toMap(snapchat),
  }
}

function buildDateList(range: DateRange): string[] {
  const dates: string[] = []
  const cursor = new Date(`${range.startDateSql}T00:00:00.000Z`)
  const end = new Date(`${range.endDateSql}T00:00:00.000Z`)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function mergeGoogleRow(rows: CampaignPerformancePlatformRow[]) {
  const googlePlatforms: CampaignPerformancePlatform[] = [
    "Google Search",
    "Google Display",
    "YouTube",
  ]
  const subset = rows.filter((row) => googlePlatforms.includes(row.platform))
  const spend = subset.reduce((sum, row) => sum + row.spend, 0)
  const revenue = subset.reduce((sum, row) => sum + row.revenue, 0)
  const conversions = subset.reduce((sum, row) => sum + row.conversions, 0)
  const campaigns = subset.reduce((sum, row) => sum + row.activeCampaigns, 0)
  return { spend, revenue, conversions, campaigns, roas: spend > 0 ? revenue / spend : 0 }
}

function findPlatformRow(
  rows: CampaignPerformancePlatformRow[],
  platform: CampaignPerformancePlatform
) {
  const row = rows.find((entry) => entry.platform === platform)
  return {
    spend: row?.spend ?? 0,
    revenue: row?.revenue ?? 0,
    conversions: row?.conversions ?? 0,
    campaigns: row?.activeCampaigns ?? 0,
    roas: row?.roas ?? 0,
  }
}

export class ChannelsAggregationService {
  private readonly campaignsService: CampaignsPerformanceAggregationService
  private readonly ordersService: OrdersAggregationService
  private readonly storesService: StoresAggregationService

  constructor(private readonly db: PostgresDatabase) {
    this.campaignsService = new CampaignsPerformanceAggregationService(db)
    this.ordersService = new OrdersAggregationService(db)
    this.storesService = new StoresAggregationService(db)
  }

  private buildChannelTotals(platformRows: CampaignPerformancePlatformRow[]) {
    return {
      "Google Ads": mergeGoogleRow(platformRows),
      "Meta Ads": findPlatformRow(platformRows, "Meta"),
      "TikTok Ads": findPlatformRow(platformRows, "TikTok"),
      Snapchat: findPlatformRow(platformRows, "Snapchat"),
    } as Record<ChannelName, ReturnType<typeof mergeGoogleRow>>
  }

  async getSummary(actor: AuthenticatedActor, query: ChannelsQuery): Promise<ChannelsSummary> {
    const { current, previous } = resolveDateRange(query)
    const campaignQuery: CampaignPerformanceQuery = {
      startDate: current.startDateSql,
      endDate: current.endDateSql,
    }
    const previousQuery: CampaignPerformanceQuery = {
      startDate: previous.startDateSql,
      endDate: previous.endDateSql,
    }

    const [currentPlatformRows, previousPlatformRows, connectionStates, stores] = await Promise.all(
      [
        this.campaignsService.getPlatformBreakdown(actor, campaignQuery),
        this.campaignsService.getPlatformBreakdown(actor, previousQuery),
        fetchAllConnectionStates(this.db, actor),
        this.storesService.listStores(actor),
      ]
    )

    const currentTotals = this.buildChannelTotals(currentPlatformRows)
    const previousTotals = this.buildChannelTotals(previousPlatformRows)

    const sumField = (
      totals: Record<ChannelName, ReturnType<typeof mergeGoogleRow>>,
      field: "spend" | "revenue" | "conversions"
    ) => CHANNEL_NAMES.reduce((sum, name) => sum + totals[name][field], 0)

    const spend = sumField(currentTotals, "spend")
    const revenue = sumField(currentTotals, "revenue")
    const conversions = sumField(currentTotals, "conversions")
    const previousSpend = sumField(previousTotals, "spend")
    const previousRevenue = sumField(previousTotals, "revenue")
    const previousConversions = sumField(previousTotals, "conversions")

    const roas = spend > 0 ? revenue / spend : 0
    const previousRoas = previousSpend > 0 ? previousRevenue / previousSpend : 0
    const cpa = conversions > 0 ? spend / conversions : 0
    const previousCpa = previousConversions > 0 ? previousSpend / previousConversions : 0

    // "Active Channels" now counts ad-spend channels and e-commerce platforms together (7
    // total: 4 ad channels + 3 store platforms) -- the page covers both, so one combined
    // connectivity number is more useful here than two separate KPI cards.
    const activeAdChannels = CHANNEL_NAMES.filter((name) => connectionStates[name].connected).length
    const connectedStorePlatforms = new Set(
      stores
        .filter((store) => store.connectionStatus === "connected")
        .map((store) => store.platform)
    )
    const activeStorePlatforms = STORE_PLATFORMS.filter((platform) =>
      connectedStorePlatforms.has(platform)
    ).length

    return {
      spend,
      spendChangePct: computeChangePct(spend, previousSpend),
      revenue,
      revenueChangePct: computeChangePct(revenue, previousRevenue),
      roas,
      roasChangePct: computeChangePct(roas, previousRoas),
      conversions,
      conversionsChangePct: computeChangePct(conversions, previousConversions),
      cpa,
      cpaChangePct: computeChangePct(cpa, previousCpa),
      activeChannels: activeAdChannels + activeStorePlatforms,
      totalChannels: TOTAL_CHANNELS + STORE_PLATFORMS.length,
    }
  }

  async getChannelBreakdown(
    actor: AuthenticatedActor,
    query: ChannelsQuery
  ): Promise<{ items: ChannelRow[] }> {
    const { current } = resolveDateRange(query)
    const campaignQuery: CampaignPerformanceQuery = {
      startDate: current.startDateSql,
      endDate: current.endDateSql,
    }

    const [platformRows, connectionStates, dailySpend] = await Promise.all([
      this.campaignsService.getPlatformBreakdown(actor, campaignQuery),
      fetchAllConnectionStates(this.db, actor),
      fetchAllDailySpend(this.db, actor, current),
    ])

    const totals = this.buildChannelTotals(platformRows)
    const dateList = buildDateList(current)

    const items = CHANNEL_NAMES
      // Connected is the authoritative signal, not "has campaign rows" -- a freshly connected
      // channel with no synced campaigns yet must still show up as connected, with real zeros,
      // not be hidden. A channel with no real connection must never appear at all.
      .filter((name) => connectionStates[name].connected)
      .map((name) => {
        const total = totals[name]
        const state = connectionStates[name]
        const series = dailySpend[name]
        const sparkline = dateList.slice(-10).map((date) => series.get(date) ?? 0)

        return {
          name,
          connected: state.connected,
          spend: total.spend,
          revenue: total.revenue,
          roas: total.roas,
          conversions: total.conversions,
          campaigns: total.campaigns,
          health: computeChannelHealth(state),
          lastSyncedAt: state.lastSyncedAt,
          sparkline,
        }
      })

    return { items }
  }

  async getPerformanceTrend(
    actor: AuthenticatedActor,
    query: ChannelsQuery
  ): Promise<{ items: ChannelsTrendPoint[] }> {
    const { current } = resolveDateRange(query)
    const dailySpend = await fetchAllDailySpend(this.db, actor, current)
    const dateList = buildDateList(current)

    // Daily buckets read fine up to ~2 weeks; beyond that the trend chart groups into weekly
    // buckets so a 90-day window doesn't render 90 barely-visible points.
    const bucketSizeDays = dateList.length > 14 ? 7 : 1
    const buckets: ChannelsTrendPoint[] = []
    for (let i = 0; i < dateList.length; i += bucketSizeDays) {
      const bucketDates = dateList.slice(i, i + bucketSizeDays)
      const spendByChannel = CHANNEL_NAMES.reduce(
        (acc, name) => {
          acc[name] = bucketDates.reduce((sum, date) => sum + (dailySpend[name].get(date) ?? 0), 0)
          return acc
        },
        {} as Record<ChannelName, number>
      )
      buckets.push({ bucketStart: bucketDates[0], spendByChannel })
    }

    return { items: buckets }
  }

  async getAlerts(actor: AuthenticatedActor): Promise<{ items: ChannelAlert[] }> {
    const today = new Date()
    const range: DateRange = {
      startDateSql: new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      endDateSql: today.toISOString().slice(0, 10),
    }

    const [connectionStates, dailySpend] = await Promise.all([
      fetchAllConnectionStates(this.db, actor),
      fetchAllDailySpend(this.db, actor, range),
    ])

    const alerts: ChannelAlert[] = []

    for (const name of CHANNEL_NAMES) {
      const state = connectionStates[name]
      if (!state.connected) continue

      if (!state.lastSyncedAt) {
        alerts.push({ channel: name, type: "stale_sync", severity: "error" })
        continue
      }

      const minutesSinceSync = Math.round(
        (Date.now() - new Date(state.lastSyncedAt).getTime()) / (1000 * 60)
      )
      if (minutesSinceSync > STALE_SYNC_ALERT_AFTER_MINUTES) {
        alerts.push({ channel: name, type: "stale_sync", severity: "warning", minutesSinceSync })
      }

      const series = dailySpend[name]
      const todayKey = range.endDateSql
      const todaySpend = series.get(todayKey) ?? 0
      const trailingDates = [...series.keys()].filter((date) => date !== todayKey)
      if (trailingDates.length === 0) continue
      const trailingAverageSpend =
        trailingDates.reduce((sum, date) => sum + (series.get(date) ?? 0), 0) / trailingDates.length
      if (trailingAverageSpend <= 0) continue

      const changePct = computeChangePct(todaySpend, trailingAverageSpend)
      if (changePct === null || Math.abs(changePct) < SPEND_ANOMALY_THRESHOLD_PCT) continue

      alerts.push({
        channel: name,
        type: changePct > 0 ? "spend_spike" : "spend_drop",
        severity: "warning",
        todaySpend,
        trailingAverageSpend,
        changePct,
      })
    }

    return { items: alerts }
  }

  // Real e-commerce platform performance (orders/revenue/AOV), for the "منصات التجارة
  // الإلكترونية" widget on the Channels page -- distinct from the ad-spend channels above, but
  // shown on the same page. Composes OrdersAggregationService (orders/revenue per platform) and
  // StoresAggregationService (real connection status), the same reuse pattern as the ad-spend
  // channel breakdown reuses CampaignsPerformanceAggregationService. No conversion-rate column:
  // GA4 sessions aren't linked to a specific store connection anywhere in this schema (no shared
  // domain/property mapping), so a real per-store conversion rate isn't computable -- showing one
  // would mean fabricating it.
  async getStoresBreakdown(
    actor: AuthenticatedActor,
    query: ChannelsQuery
  ): Promise<{ items: StorePlatformRow[] }> {
    const { current, previous } = resolveDateRange(query)
    const currentQuery = { startDate: current.startDateSql, endDate: current.endDateSql }
    const previousQuery = { startDate: previous.startDateSql, endDate: previous.endDateSql }

    const [currentResult, previousResult, stores] = await Promise.all([
      this.ordersService.listOrders(actor, currentQuery),
      this.ordersService.listOrders(actor, previousQuery),
      this.storesService.listStores(actor),
    ])

    const connectedPlatforms = new Set(
      stores
        .filter((store) => store.connectionStatus === "connected")
        .map((store) => store.platform)
    )
    // A platform can have more than one real store connection (e.g. two Salla stores) -- sum
    // customerCount across all of the platform's connected stores, not just the first.
    const customersByPlatform = new Map<StorePlatform, number>()
    for (const store of stores) {
      if (store.connectionStatus !== "connected") continue
      customersByPlatform.set(
        store.platform,
        (customersByPlatform.get(store.platform) ?? 0) + store.customerCount
      )
    }
    const dateList = buildDateList(current)

    const items: StorePlatformRow[] = STORE_PLATFORMS.filter((platform) =>
      connectedPlatforms.has(platform)
    ).map((platform) => {
      const currentOrders = currentResult.items.filter((order) => order.platform === platform)
      const previousOrders = previousResult.items.filter((order) => order.platform === platform)
      const revenue = currentOrders.reduce((sum, order) => sum + order.amount, 0)
      const previousRevenue = previousOrders.reduce((sum, order) => sum + order.amount, 0)

      const dailyRevenue = groupOrderRevenueByDay(currentOrders)
      const trend = dateList.slice(-10).map((date) => dailyRevenue.get(date) ?? 0)

      return {
        platform,
        customers: customersByPlatform.get(platform) ?? 0,
        orders: currentOrders.length,
        ordersChangePct: computeChangePct(currentOrders.length, previousOrders.length),
        revenue,
        revenueChangePct: computeChangePct(revenue, previousRevenue),
        averageOrderValue: currentOrders.length > 0 ? revenue / currentOrders.length : 0,
        trend,
      }
    })

    return { items }
  }

  // Real per-product order/quantity counts for the "أفضل المنتجات أداءً" widget -- no revenue
  // column. Verified against live Salla order data: the synced order payload's items only carry
  // {name, quantity, thumbnail}, never a per-item price (Salla only syncs orders/products/
  // customers, no separate line-items entity with pricing), so a real per-product revenue figure
  // isn't computable from what's actually synced. Grouped by product name across all connected
  // platforms since order items carry no product id, only a name.
  async getTopProducts(
    actor: AuthenticatedActor,
    query: ChannelsQuery
  ): Promise<{ items: TopProductRow[] }> {
    const { current } = resolveDateRange(query)
    const result = await this.ordersService.listOrders(actor, {
      startDate: current.startDateSql,
      endDate: current.endDateSql,
    })

    const byProduct = new Map<string, { orders: number; quantitySold: number }>()
    for (const order of result.items) {
      const seenInThisOrder = new Set<string>()
      for (const item of order.items) {
        if (!item.name) continue
        const existing = byProduct.get(item.name) ?? { orders: 0, quantitySold: 0 }
        existing.quantitySold += item.quantity
        if (!seenInThisOrder.has(item.name)) {
          existing.orders += 1
          seenInThisOrder.add(item.name)
        }
        byProduct.set(item.name, existing)
      }
    }

    const items = [...byProduct.entries()]
      .map(([name, stats]) => ({ name, orders: stats.orders, quantitySold: stats.quantitySold }))
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, TOP_PRODUCTS_LIMIT)

    return { items }
  }
}
