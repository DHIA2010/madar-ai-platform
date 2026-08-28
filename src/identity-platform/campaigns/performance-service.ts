import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// One shared row shape every platform/level normalizes into -- see the Campaigns dashboard
// plan's "Phase 0: Contract freeze". Every metric field is always present, 0 (not null) when
// a platform/level has no data for it, matching how the frontend already always renders a
// number in these columns.
export type CampaignPerformancePlatform =
  | "Google Search"
  | "Google Display"
  | "YouTube"
  | "Meta"
  | "TikTok"
  | "Snapchat"
export type CampaignPerformanceLevel = "campaign" | "adGroup" | "ad" | "keyword"

export interface CampaignPerformanceRow {
  id: string
  parentId: string | null
  platform: CampaignPerformancePlatform
  level: CampaignPerformanceLevel
  name: string
  status: string
  objective: string | null
  activityDate: string | null
  spend: number
  revenue: number
  roas: number
  clicks: number
  conversions: number
  conversionRate: number
  ctr: number
  cpc: number
  cpa: number
  impressions: number
  cost: number
  qualityScore: number
  impressionShare: number
  searchTopImpressionRate: number
  cpm: number
  viewableImpressions: number
  viewability: number
  views: number
  viewRate: number
  watchTime: number
  averageViewDuration: number
  view25: number
  view50: number
  view75: number
  view100Completion: number
  reach: number
  frequency: number
  videoPlays: number
  threeSecondViews: number
  thruPlays: number
  addToCart: number
  checkoutStarted: number
  purchases: number
  purchaseValue: number
}

export interface CampaignPerformancePlatformRow extends CampaignPerformanceRow {
  activeCampaigns: number
}

export interface CampaignPerformanceSummary {
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
  conversionRate: number
  conversionRateChangePct: number | null
  activeCampaigns: number
  activeCampaignsChangePct: number | null
}

export interface CampaignPerformanceQuery {
  startDate?: string
  endDate?: string
  platform?: CampaignPerformancePlatform
  status?: string
  search?: string
}

export interface CampaignPerformancePage {
  items: CampaignPerformanceRow[]
  pagination: { page: number; pageSize: number; total: number }
}

// Same "sum current + previous mirrored period, compute % change" pattern as
// OrdersAggregationService.computeChangePct/buildSummary.
function computeChangePct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function zeroRow(input: {
  id: string
  parentId: string | null
  platform: CampaignPerformancePlatform
  level: CampaignPerformanceLevel
  name: string
  status: string
  objective: string | null
  activityDate: string | null
}): CampaignPerformanceRow {
  return {
    ...input,
    spend: 0,
    revenue: 0,
    roas: 0,
    clicks: 0,
    conversions: 0,
    conversionRate: 0,
    ctr: 0,
    cpc: 0,
    cpa: 0,
    impressions: 0,
    cost: 0,
    qualityScore: 0,
    impressionShare: 0,
    searchTopImpressionRate: 0,
    cpm: 0,
    viewableImpressions: 0,
    viewability: 0,
    views: 0,
    viewRate: 0,
    watchTime: 0,
    averageViewDuration: 0,
    view25: 0,
    view50: 0,
    view75: 0,
    view100Completion: 0,
    reach: 0,
    frequency: 0,
    videoPlays: 0,
    threeSecondViews: 0,
    thruPlays: 0,
    addToCart: 0,
    checkoutStarted: 0,
    purchases: 0,
    purchaseValue: 0,
  }
}

// Fills in the derived ratio fields (roas/cpa/conversionRate/cpc) that every platform computes
// the same way once spend/revenue/clicks/conversions are known -- avoids repeating this math in
// every per-platform fetch function.
function finalizeRow(row: CampaignPerformanceRow): CampaignPerformanceRow {
  return {
    ...row,
    roas: row.spend > 0 ? Number((row.revenue / row.spend).toFixed(2)) : 0,
    cpa: row.conversions > 0 ? Number((row.spend / row.conversions).toFixed(2)) : 0,
    cpc: row.clicks > 0 ? Number((row.spend / row.clicks).toFixed(2)) : 0,
    conversionRate: row.clicks > 0 ? Number(((row.conversions / row.clicks) * 100).toFixed(2)) : 0,
    ctr: row.impressions > 0 ? Number(((row.clicks / row.impressions) * 100).toFixed(2)) : 0,
    cost: row.spend,
  }
}

// Bucketed by substring match on whatever raw status text each platform actually returns --
// same reasoning as orders/service.ts's bucketOrderStatus: no platform's exact status
// vocabulary is fully confirmed against live data yet, so a loose match is what lets one
// shared "Active"/"Paused"/"Other" filter work across all three without guessing exact enums.
function bucketCampaignStatus(rawStatus: string): "Active" | "Paused" | "Other" {
  const text = rawStatus.toLowerCase()
  if (text.includes("enable") || text.includes("active")) {
    return "Active"
  }
  if (text.includes("pause") || text.includes("disable")) {
    return "Paused"
  }
  return "Other"
}

function matchesFilters(row: CampaignPerformanceRow, query: CampaignPerformanceQuery): boolean {
  if (query.platform && row.platform !== query.platform) {
    return false
  }
  if (
    query.status &&
    query.status !== "All Statuses" &&
    bucketCampaignStatus(row.status) !== query.status
  ) {
    return false
  }
  if (query.search) {
    const needle = query.search.toLowerCase()
    if (!row.name.toLowerCase().includes(needle)) {
      return false
    }
  }
  return true
}

interface DateRange {
  startDateSql: string
  endDateSql: string
}

const DEFAULT_WINDOW_DAYS = 30
const MAX_ROWS_PER_LEVEL = 5000

function resolveDateRange(query: CampaignPerformanceQuery): {
  current: DateRange
  previous: DateRange
} {
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

// -- Google Ads --------------------------------------------------------------------------

function googlePlatform(channelType: string | null): CampaignPerformancePlatform {
  const normalized = (channelType ?? "").toUpperCase()
  if (normalized === "VIDEO") return "YouTube"
  if (normalized === "DISPLAY") return "Google Display"
  return "Google Search"
}

interface GoogleMetricRow {
  entity_id: string
  connection_id: string
  customer_id: string
  name: string
  status: string
  channel_type: string | null
  campaign_id: string | null
  ad_group_id: string | null
  objective: string | null
  quality_score: string | number | null
  impressions: string
  clicks: string
  cost_micros: string
  conversions: string
  conversion_value: string
  search_impression_share: string | null
  search_top_impression_share: string | null
  active_view_impressions: string | null
  active_view_measurable_impressions: string | null
  active_view_viewability: string | null
  video_views: string | null
  video_quartile_p25_rate: string | null
  video_quartile_p50_rate: string | null
  video_quartile_p75_rate: string | null
  video_quartile_p100_rate: string | null
  average_watch_time_seconds: string | null
  activity_date: string | Date | null
  [key: string]: unknown
}

function toActivityDateString(value: string | Date | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function mapGoogleRow(
  row: GoogleMetricRow,
  level: CampaignPerformanceLevel,
  parentId: string | null
): CampaignPerformanceRow {
  const platform = googlePlatform(row.channel_type)
  const base = zeroRow({
    id: `google_ads:${row.connection_id}:${row.customer_id}:${row.entity_id}`,
    parentId,
    platform,
    level,
    name: row.name,
    status: row.status,
    objective: row.objective,
    activityDate: toActivityDateString(row.activity_date),
  })

  const spend = Number(row.cost_micros) / 1_000_000
  const revenue = Number(row.conversion_value)

  return finalizeRow({
    ...base,
    spend,
    revenue,
    clicks: Number(row.clicks),
    conversions: Number(row.conversions),
    impressions: Number(row.impressions),
    cpm:
      Number(row.impressions) > 0
        ? Number(((spend / Number(row.impressions)) * 1000).toFixed(2))
        : 0,
    qualityScore: row.quality_score ? Number(row.quality_score) : 0,
    impressionShare: row.search_impression_share ? Number(row.search_impression_share) * 100 : 0,
    searchTopImpressionRate: row.search_top_impression_share
      ? Number(row.search_top_impression_share) * 100
      : 0,
    viewableImpressions: Number(row.active_view_impressions ?? 0),
    viewability: row.active_view_viewability ? Number(row.active_view_viewability) * 100 : 0,
    views: Number(row.video_views ?? 0),
    view25: row.video_quartile_p25_rate ? Number(row.video_quartile_p25_rate) * 100 : 0,
    view50: row.video_quartile_p50_rate ? Number(row.video_quartile_p50_rate) * 100 : 0,
    view75: row.video_quartile_p75_rate ? Number(row.video_quartile_p75_rate) * 100 : 0,
    view100Completion: row.video_quartile_p100_rate
      ? Number(row.video_quartile_p100_rate) * 100
      : 0,
    averageViewDuration: Number(row.average_watch_time_seconds ?? 0),
    watchTime: Number(row.average_watch_time_seconds ?? 0) * Number(row.video_views ?? 0),
  })
}

async function fetchGoogleCampaignRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<CampaignPerformanceRow[]> {
  const result = await db.query<GoogleMetricRow>(
    `
    SELECT
      m.campaign_id as entity_id, m.connection_id, m.customer_id,
      c.name, c.status, c.channel_type, null as campaign_id, null as ad_group_id,
      null as objective, null as quality_score,
      SUM(m.impressions) as impressions, SUM(m.clicks) as clicks, SUM(m.cost_micros) as cost_micros,
      SUM(m.conversions) as conversions, SUM(m.conversion_value) as conversion_value,
      AVG(m.search_impression_share) as search_impression_share,
      AVG(m.search_top_impression_share) as search_top_impression_share,
      SUM(m.active_view_impressions) as active_view_impressions,
      SUM(m.active_view_measurable_impressions) as active_view_measurable_impressions,
      AVG(m.active_view_viewability) as active_view_viewability,
      SUM(m.video_views) as video_views,
      AVG(m.video_quartile_p25_rate) as video_quartile_p25_rate,
      AVG(m.video_quartile_p50_rate) as video_quartile_p50_rate,
      AVG(m.video_quartile_p75_rate) as video_quartile_p75_rate,
      AVG(m.video_quartile_p100_rate) as video_quartile_p100_rate,
      AVG(m.average_watch_time_seconds) as average_watch_time_seconds,
      MAX(m.metric_date) as activity_date
    FROM google_ads_daily_metrics m
    JOIN google_ads_campaigns c
      ON c.connection_id = m.connection_id AND c.customer_id = m.customer_id AND c.campaign_id = m.campaign_id
    JOIN integration_connections conn ON conn.id = m.connection_id
    WHERE m.metric_scope = 'campaign'
      AND conn.provider_id = 'google-ads' AND conn.organization_id = $1
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND m.metric_date BETWEEN $3::date AND $4::date
    GROUP BY m.campaign_id, m.connection_id, m.customer_id, c.name, c.status, c.channel_type
    LIMIT $5
    `,
    [
      actor.organizationId,
      actor.workspaceId ?? null,
      range.startDateSql,
      range.endDateSql,
      MAX_ROWS_PER_LEVEL,
    ]
  )
  return result.rows.map((row) => mapGoogleRow(row, "campaign", null))
}

async function fetchGoogleAdGroupRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  campaignId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalCampaignId] = campaignId.split(":")
  const result = await db.query<GoogleMetricRow>(
    `
    SELECT
      m.ad_group_id as entity_id, m.connection_id, m.customer_id,
      ag.name, ag.status, c.channel_type, ag.campaign_id, null as ad_group_id,
      null as objective, null as quality_score,
      SUM(m.impressions) as impressions, SUM(m.clicks) as clicks, SUM(m.cost_micros) as cost_micros,
      SUM(m.conversions) as conversions, SUM(m.conversion_value) as conversion_value,
      null as search_impression_share, null as search_top_impression_share,
      SUM(m.active_view_impressions) as active_view_impressions,
      SUM(m.active_view_measurable_impressions) as active_view_measurable_impressions,
      AVG(m.active_view_viewability) as active_view_viewability,
      SUM(m.video_views) as video_views,
      AVG(m.video_quartile_p25_rate) as video_quartile_p25_rate,
      AVG(m.video_quartile_p50_rate) as video_quartile_p50_rate,
      AVG(m.video_quartile_p75_rate) as video_quartile_p75_rate,
      AVG(m.video_quartile_p100_rate) as video_quartile_p100_rate,
      AVG(m.average_watch_time_seconds) as average_watch_time_seconds,
      MAX(m.metric_date) as activity_date
    FROM google_ads_daily_metrics m
    JOIN google_ads_ad_groups ag
      ON ag.connection_id = m.connection_id AND ag.customer_id = m.customer_id AND ag.ad_group_id = m.ad_group_id
    JOIN google_ads_campaigns c
      ON c.connection_id = ag.connection_id AND c.customer_id = ag.customer_id AND c.campaign_id = ag.campaign_id
    JOIN integration_connections conn ON conn.id = m.connection_id
    WHERE m.metric_scope = 'ad_group'
      AND conn.provider_id = 'google-ads' AND conn.organization_id = $1
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND m.connection_id = $3 AND m.customer_id = $4 AND ag.campaign_id = $5
      AND m.metric_date BETWEEN $6::date AND $7::date
    GROUP BY m.ad_group_id, m.connection_id, m.customer_id, ag.name, ag.status, c.channel_type, ag.campaign_id
    LIMIT $8
    `,
    [
      actor.organizationId,
      actor.workspaceId ?? null,
      connectionId,
      customerId,
      externalCampaignId,
      range.startDateSql,
      range.endDateSql,
      MAX_ROWS_PER_LEVEL,
    ]
  )
  return result.rows.map((row) => mapGoogleRow(row, "adGroup", campaignId))
}

async function fetchGoogleLeafRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  adGroupId: string,
  level: "ads" | "keywords"
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalAdGroupId] = adGroupId.split(":")

  if (level === "keywords") {
    const result = await db.query<GoogleMetricRow>(
      `
      SELECT
        m.keyword_id as entity_id, m.connection_id, m.customer_id,
        k.keyword_text as name, k.status, c.channel_type, k.campaign_id, k.ad_group_id,
        null as objective, k.quality_score,
        SUM(m.impressions) as impressions, SUM(m.clicks) as clicks, SUM(m.cost_micros) as cost_micros,
        SUM(m.conversions) as conversions, SUM(m.conversion_value) as conversion_value,
        null as search_impression_share, null as search_top_impression_share,
        null as active_view_impressions, null as active_view_measurable_impressions,
        null as active_view_viewability, null as video_views,
        null as video_quartile_p25_rate, null as video_quartile_p50_rate,
        null as video_quartile_p75_rate, null as video_quartile_p100_rate,
        null as average_watch_time_seconds,
        MAX(m.metric_date) as activity_date
      FROM google_ads_daily_metrics m
      JOIN google_ads_keywords k
        ON k.connection_id = m.connection_id AND k.customer_id = m.customer_id AND k.keyword_id = m.keyword_id
      JOIN google_ads_campaigns c
        ON c.connection_id = k.connection_id AND c.customer_id = k.customer_id AND c.campaign_id = k.campaign_id
      JOIN integration_connections conn ON conn.id = m.connection_id
      WHERE m.metric_scope = 'keyword'
        AND conn.provider_id = 'google-ads' AND conn.organization_id = $1
        AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
        AND m.connection_id = $3 AND m.customer_id = $4 AND k.ad_group_id = $5
        AND m.metric_date BETWEEN $6::date AND $7::date
      GROUP BY m.keyword_id, m.connection_id, m.customer_id, k.keyword_text, k.status, c.channel_type,
               k.campaign_id, k.ad_group_id, k.quality_score
      LIMIT $8
      `,
      [
        actor.organizationId,
        actor.workspaceId ?? null,
        connectionId,
        customerId,
        externalAdGroupId,
        range.startDateSql,
        range.endDateSql,
        MAX_ROWS_PER_LEVEL,
      ]
    )
    return result.rows.map((row) => mapGoogleRow(row, "keyword", adGroupId))
  }

  const result = await db.query<GoogleMetricRow>(
    `
    SELECT
      m.ad_id as entity_id, m.connection_id, m.customer_id,
      coalesce(a.headline, a.ad_id) as name, a.status, c.channel_type, a.campaign_id, a.ad_group_id,
      null as objective, null as quality_score,
      SUM(m.impressions) as impressions, SUM(m.clicks) as clicks, SUM(m.cost_micros) as cost_micros,
      SUM(m.conversions) as conversions, SUM(m.conversion_value) as conversion_value,
      null as search_impression_share, null as search_top_impression_share,
      SUM(m.active_view_impressions) as active_view_impressions,
      SUM(m.active_view_measurable_impressions) as active_view_measurable_impressions,
      AVG(m.active_view_viewability) as active_view_viewability,
      SUM(m.video_views) as video_views,
      AVG(m.video_quartile_p25_rate) as video_quartile_p25_rate,
      AVG(m.video_quartile_p50_rate) as video_quartile_p50_rate,
      AVG(m.video_quartile_p75_rate) as video_quartile_p75_rate,
      AVG(m.video_quartile_p100_rate) as video_quartile_p100_rate,
      AVG(m.average_watch_time_seconds) as average_watch_time_seconds,
      MAX(m.metric_date) as activity_date
    FROM google_ads_daily_metrics m
    JOIN google_ads_ads a
      ON a.connection_id = m.connection_id AND a.customer_id = m.customer_id AND a.ad_id = m.ad_id
    JOIN google_ads_campaigns c
      ON c.connection_id = a.connection_id AND c.customer_id = a.customer_id AND c.campaign_id = a.campaign_id
    JOIN integration_connections conn ON conn.id = m.connection_id
    WHERE m.metric_scope = 'ad'
      AND conn.provider_id = 'google-ads' AND conn.organization_id = $1
      AND ($2::uuid IS NULL OR conn.workspace_id = $2::uuid)
      AND m.connection_id = $3 AND m.customer_id = $4 AND a.ad_group_id = $5
      AND m.metric_date BETWEEN $6::date AND $7::date
    GROUP BY m.ad_id, m.connection_id, m.customer_id, a.headline, a.ad_id, a.status, c.channel_type,
             a.campaign_id, a.ad_group_id
    LIMIT $8
    `,
    [
      actor.organizationId,
      actor.workspaceId ?? null,
      connectionId,
      customerId,
      externalAdGroupId,
      range.startDateSql,
      range.endDateSql,
      MAX_ROWS_PER_LEVEL,
    ]
  )
  return result.rows.map((row) => mapGoogleRow(row, "ad", adGroupId))
}

// -- Meta Ads ------------------------------------------------------------------------------
// meta_records is a generic entity_type/payload table (no typed metric columns), so rows are
// fetched scoped-but-raw and grouped/reduced in JS -- same "SQL filters, JS interprets"
// division of labor as orders/service.ts's per-provider normalize functions, just applied to
// a group of rows instead of one row at a time.

interface MetaRawRecordRow {
  connection_id: string
  workspace_id: string | null
  customer_id: string
  entity_type: string
  entity_id: string
  record_date: string
  payload: Record<string, unknown>
  [key: string]: unknown
}

async function fetchMetaRawRecords(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  entityTypes: string[],
  range: DateRange | null,
  connectionId?: string
): Promise<MetaRawRecordRow[]> {
  // Built conditionally (rather than fixed "$N::date IS NULL OR ..." placeholders) because
  // pg-mem (the test harness's in-memory Postgres) can't execute that pattern combined with
  // entity_type = ANY(...) across a JOIN ("lookups on joins" -- a pg-mem limitation, not a
  // real Postgres one) -- only including clauses that are actually active sidesteps it.
  const conditions = [
    "r.entity_type = ANY($1::text[])",
    "conn.organization_id = $2",
    "conn.deleted_at IS NULL",
    "conn.status = 'connected'",
  ]
  const values: unknown[] = [entityTypes, actor.organizationId]
  if (actor.workspaceId) {
    values.push(actor.workspaceId)
    conditions.push(`conn.workspace_id = $${values.length}`)
  }
  if (connectionId) {
    values.push(connectionId)
    conditions.push(`r.connection_id = $${values.length}`)
  }
  if (range) {
    values.push(range.startDateSql)
    conditions.push(`r.record_date >= $${values.length}::date`)
    values.push(range.endDateSql)
    conditions.push(`r.record_date <= $${values.length}::date`)
  }
  values.push(MAX_ROWS_PER_LEVEL)

  const result = await db.query<MetaRawRecordRow>(
    `
    SELECT r.connection_id, conn.workspace_id, r.customer_id, r.entity_type, r.entity_id,
           r.record_date, r.payload
    FROM meta_records r
    JOIN meta_oauth_connections conn ON conn.id = r.connection_id
    WHERE ${conditions.join(" AND ")}
    LIMIT $${values.length}
    `,
    values
  )
  return result.rows
}

// Meta's unified cross-channel action types (verified against Meta's Ads Insights docs) --
// "omni_" avoids double-counting across on-Facebook/off-Facebook/app purchases.
const META_PURCHASE_ACTION_TYPES = new Set(["omni_purchase"])
const META_ADD_TO_CART_ACTION_TYPES = new Set(["omni_add_to_cart"])
const META_CHECKOUT_ACTION_TYPES = new Set(["omni_initiated_checkout"])

function sumMetaActionValues(actions: unknown, actionTypes: Set<string>): number {
  if (!Array.isArray(actions)) return 0
  return actions.reduce((sum: number, entry) => {
    if (!entry || typeof entry !== "object") return sum
    const action = entry as { action_type?: string; value?: string }
    if (action.action_type && actionTypes.has(action.action_type)) {
      return sum + (Number(action.value) || 0)
    }
    return sum
  }, 0)
}

function reduceMetaInsights(payloads: Record<string, unknown>[]) {
  let spend = 0
  let impressions = 0
  let clicks = 0
  let reach = 0
  let purchases = 0
  let purchaseValue = 0
  let addToCart = 0
  let checkoutStarted = 0
  let videoPlays = 0
  let thruPlays = 0
  let latestDate: string | null = null

  for (const payload of payloads) {
    spend += Number(payload.spend) || 0
    impressions += Number(payload.impressions) || 0
    clicks += Number(payload.clicks) || 0
    reach += Number(payload.reach) || 0
    purchases += sumMetaActionValues(payload.actions, META_PURCHASE_ACTION_TYPES)
    purchaseValue += sumMetaActionValues(payload.action_values, META_PURCHASE_ACTION_TYPES)
    addToCart += sumMetaActionValues(payload.actions, META_ADD_TO_CART_ACTION_TYPES)
    checkoutStarted += sumMetaActionValues(payload.actions, META_CHECKOUT_ACTION_TYPES)
    if (Array.isArray(payload.video_play_actions)) {
      videoPlays += sumMetaActionValues(payload.video_play_actions, new Set(["video_view"]))
    }
    if (Array.isArray(payload.video_thruplay_watched_actions)) {
      thruPlays += sumMetaActionValues(
        payload.video_thruplay_watched_actions,
        new Set(["video_view"])
      )
    }
    const dateStart = typeof payload.date_start === "string" ? payload.date_start : null
    if (dateStart && (!latestDate || dateStart > latestDate)) {
      latestDate = dateStart
    }
  }

  return {
    spend,
    impressions,
    clicks,
    reach,
    purchases,
    purchaseValue,
    addToCart,
    checkoutStarted,
    videoPlays,
    thruPlays,
    latestDate,
  }
}

async function fetchMetaCampaignRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<CampaignPerformanceRow[]> {
  const [insightRows, campaignRows] = await Promise.all([
    fetchMetaRawRecords(db, actor, ["insights"], range),
    fetchMetaRawRecords(db, actor, ["campaigns"], null),
  ])

  const campaignByKey = new Map<string, MetaRawRecordRow>()
  for (const row of campaignRows) {
    campaignByKey.set(`${row.connection_id}:${row.entity_id}`, row)
  }

  const grouped = new Map<
    string,
    {
      connectionId: string
      customerId: string
      campaignId: string
      payloads: Record<string, unknown>[]
    }
  >()
  for (const row of insightRows) {
    const campaignId = String(row.payload.campaign_id ?? "")
    if (!campaignId) continue
    const key = `${row.connection_id}:${campaignId}`
    const existing = grouped.get(key)
    if (existing) {
      existing.payloads.push(row.payload)
    } else {
      grouped.set(key, {
        connectionId: row.connection_id,
        customerId: row.customer_id,
        campaignId,
        payloads: [row.payload],
      })
    }
  }

  return Array.from(grouped.values()).map((group) => {
    const meta = campaignByKey.get(`${group.connectionId}:${group.campaignId}`)
    const name = String(meta?.payload.name ?? group.campaignId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const objective = (meta?.payload.objective as string | undefined) ?? null
    const reduced = reduceMetaInsights(group.payloads)

    return finalizeRow({
      ...zeroRow({
        id: `meta_ads:${group.connectionId}:${group.customerId}:${group.campaignId}`,
        parentId: null,
        platform: "Meta",
        level: "campaign",
        name,
        status,
        objective,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      revenue: reduced.purchaseValue,
      clicks: reduced.clicks,
      conversions: reduced.purchases,
      impressions: reduced.impressions,
      reach: reduced.reach,
      videoPlays: reduced.videoPlays,
      thruPlays: reduced.thruPlays,
      addToCart: reduced.addToCart,
      checkoutStarted: reduced.checkoutStarted,
      purchases: reduced.purchases,
      purchaseValue: reduced.purchaseValue,
      cpm:
        reduced.impressions > 0
          ? Number(((reduced.spend / reduced.impressions) * 1000).toFixed(2))
          : 0,
    })
  })
}

async function fetchMetaAdGroupRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  campaignId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalCampaignId] = campaignId.split(":")
  const [insightRows, adsetRows] = await Promise.all([
    fetchMetaRawRecords(db, actor, ["adset_insights"], range, connectionId),
    fetchMetaRawRecords(db, actor, ["adsets"], null, connectionId),
  ])

  const adsetByKey = new Map<string, MetaRawRecordRow>()
  for (const row of adsetRows) {
    adsetByKey.set(row.entity_id, row)
  }

  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of insightRows) {
    const adsetId = String(row.payload.adset_id ?? "")
    const rowCampaignId = String(row.payload.campaign_id ?? "")
    if (!adsetId || rowCampaignId !== externalCampaignId) continue
    const existing = grouped.get(adsetId)
    if (existing) {
      existing.push(row.payload)
    } else {
      grouped.set(adsetId, [row.payload])
    }
  }

  return Array.from(grouped.entries()).map(([adsetId, payloads]) => {
    const meta = adsetByKey.get(adsetId)
    const name = String(meta?.payload.name ?? adsetId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const reduced = reduceMetaInsights(payloads)

    return finalizeRow({
      ...zeroRow({
        id: `meta_ads:${connectionId}:${customerId}:${adsetId}`,
        parentId: campaignId,
        platform: "Meta",
        level: "adGroup",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      revenue: reduced.purchaseValue,
      clicks: reduced.clicks,
      conversions: reduced.purchases,
      impressions: reduced.impressions,
      reach: reduced.reach,
      videoPlays: reduced.videoPlays,
      thruPlays: reduced.thruPlays,
      addToCart: reduced.addToCart,
      checkoutStarted: reduced.checkoutStarted,
      purchases: reduced.purchases,
      purchaseValue: reduced.purchaseValue,
    })
  })
}

async function fetchMetaAdRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  adGroupId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalAdsetId] = adGroupId.split(":")
  const [insightRows, adRows] = await Promise.all([
    fetchMetaRawRecords(db, actor, ["ad_insights"], range, connectionId),
    fetchMetaRawRecords(db, actor, ["ads"], null, connectionId),
  ])

  const adByKey = new Map<string, MetaRawRecordRow>()
  for (const row of adRows) {
    adByKey.set(row.entity_id, row)
  }

  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of insightRows) {
    const adId = String(row.payload.ad_id ?? "")
    const rowAdsetId = String(row.payload.adset_id ?? "")
    if (!adId || rowAdsetId !== externalAdsetId) continue
    const existing = grouped.get(adId)
    if (existing) {
      existing.push(row.payload)
    } else {
      grouped.set(adId, [row.payload])
    }
  }

  return Array.from(grouped.entries()).map(([adId, payloads]) => {
    const meta = adByKey.get(adId)
    const name = String(meta?.payload.name ?? adId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const reduced = reduceMetaInsights(payloads)

    return finalizeRow({
      ...zeroRow({
        id: `meta_ads:${connectionId}:${customerId}:${adId}`,
        parentId: adGroupId,
        platform: "Meta",
        level: "ad",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      revenue: reduced.purchaseValue,
      clicks: reduced.clicks,
      conversions: reduced.purchases,
      impressions: reduced.impressions,
      purchases: reduced.purchases,
      purchaseValue: reduced.purchaseValue,
      addToCart: reduced.addToCart,
      checkoutStarted: reduced.checkoutStarted,
    })
  })
}

// -- TikTok Ads ----------------------------------------------------------------------------

interface TikTokRawRecordRow {
  connection_id: string
  customer_id: string
  entity_type: string
  entity_id: string
  record_date: string
  payload: Record<string, unknown>
  [key: string]: unknown
}

async function fetchTikTokRawRecords(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  entityTypes: string[],
  range: DateRange | null,
  connectionId?: string
): Promise<TikTokRawRecordRow[]> {
  // See fetchMetaRawRecords' comment: built conditionally to sidestep a pg-mem-only
  // limitation with "$N IS NULL OR ..." combined with ANY(...) across a JOIN.
  const conditions = [
    "r.entity_type = ANY($1::text[])",
    "conn.organization_id = $2",
    "conn.deleted_at IS NULL",
    "conn.status = 'connected'",
  ]
  const values: unknown[] = [entityTypes, actor.organizationId]
  if (actor.workspaceId) {
    values.push(actor.workspaceId)
    conditions.push(`conn.workspace_id = $${values.length}`)
  }
  if (connectionId) {
    values.push(connectionId)
    conditions.push(`r.connection_id = $${values.length}`)
  }
  if (range) {
    values.push(range.startDateSql)
    conditions.push(`r.record_date >= $${values.length}::date`)
    values.push(range.endDateSql)
    conditions.push(`r.record_date <= $${values.length}::date`)
  }
  values.push(MAX_ROWS_PER_LEVEL)

  const result = await db.query<TikTokRawRecordRow>(
    `
    SELECT r.connection_id, r.customer_id, r.entity_type, r.entity_id, r.record_date, r.payload
    FROM tiktok_ads_records r
    JOIN tiktok_ads_oauth_connections conn ON conn.id = r.connection_id
    WHERE ${conditions.join(" AND ")}
    LIMIT $${values.length}
    `,
    values
  )
  return result.rows
}

function reduceTikTokInsights(rows: TikTokRawRecordRow[]) {
  let spend = 0
  let impressions = 0
  let clicks = 0
  let conversions = 0
  let latestDate: string | null = null

  for (const row of rows) {
    const dimensions = (row.payload.dimensions ?? {}) as Record<string, unknown>
    const metrics = (row.payload.metrics ?? {}) as Record<string, unknown>
    spend += Number(metrics.spend) || 0
    impressions += Number(metrics.impressions) || 0
    clicks += Number(metrics.clicks) || 0
    conversions += Number(metrics.conversion) || 0
    const day =
      typeof dimensions.stat_time_day === "string" ? dimensions.stat_time_day.slice(0, 10) : null
    if (day && (!latestDate || day > latestDate)) {
      latestDate = day
    }
  }

  return { spend, impressions, clicks, conversions, latestDate }
}

async function fetchTikTokCampaignRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<CampaignPerformanceRow[]> {
  const [insightRows, campaignRows] = await Promise.all([
    fetchTikTokRawRecords(db, actor, ["insights"], range),
    fetchTikTokRawRecords(db, actor, ["campaigns"], null),
  ])

  const campaignByKey = new Map<string, TikTokRawRecordRow>()
  for (const row of campaignRows) {
    campaignByKey.set(`${row.connection_id}:${row.entity_id}`, row)
  }

  const grouped = new Map<string, TikTokRawRecordRow[]>()
  for (const row of insightRows) {
    const dimensions = (row.payload.dimensions ?? {}) as Record<string, unknown>
    const campaignId = String(dimensions.campaign_id ?? "")
    if (!campaignId) continue
    const key = `${row.connection_id}:${campaignId}`
    const existing = grouped.get(key)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(key, [row])
    }
  }

  return Array.from(grouped.entries()).map(([key, rows]) => {
    const [connectionId, campaignId] = key.split(":")
    const meta = campaignByKey.get(key)
    const name = String(meta?.payload.campaign_name ?? campaignId)
    const status = String(meta?.payload.operation_status ?? "UNKNOWN")
    const objective = (meta?.payload.objective_type as string | undefined) ?? null
    const reduced = reduceTikTokInsights(rows)
    const customerId = rows[0]?.customer_id ?? ""

    return finalizeRow({
      ...zeroRow({
        id: `tiktok_ads:${connectionId}:${customerId}:${campaignId}`,
        parentId: null,
        platform: "TikTok",
        level: "campaign",
        name,
        status,
        objective,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.clicks,
      conversions: reduced.conversions,
      impressions: reduced.impressions,
      cpm:
        reduced.impressions > 0
          ? Number(((reduced.spend / reduced.impressions) * 1000).toFixed(2))
          : 0,
    })
  })
}

async function fetchTikTokAdGroupRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  campaignId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalCampaignId] = campaignId.split(":")
  const [insightRows, adgroupRows] = await Promise.all([
    fetchTikTokRawRecords(db, actor, ["adgroup_insights"], range, connectionId),
    fetchTikTokRawRecords(db, actor, ["adgroups"], null, connectionId),
  ])

  const adgroupByKey = new Map<string, TikTokRawRecordRow>()
  for (const row of adgroupRows) {
    if (String(row.payload.campaign_id ?? "") === externalCampaignId) {
      adgroupByKey.set(row.entity_id, row)
    }
  }

  const grouped = new Map<string, TikTokRawRecordRow[]>()
  for (const row of insightRows) {
    const dimensions = (row.payload.dimensions ?? {}) as Record<string, unknown>
    const adgroupId = String(dimensions.adgroup_id ?? "")
    if (!adgroupId || !adgroupByKey.has(adgroupId)) continue
    const existing = grouped.get(adgroupId)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(adgroupId, [row])
    }
  }

  return Array.from(grouped.entries()).map(([adgroupId, rows]) => {
    const meta = adgroupByKey.get(adgroupId)
    const name = String(meta?.payload.adgroup_name ?? adgroupId)
    const status = String(meta?.payload.operation_status ?? "UNKNOWN")
    const reduced = reduceTikTokInsights(rows)

    return finalizeRow({
      ...zeroRow({
        id: `tiktok_ads:${connectionId}:${customerId}:${adgroupId}`,
        parentId: campaignId,
        platform: "TikTok",
        level: "adGroup",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.clicks,
      conversions: reduced.conversions,
      impressions: reduced.impressions,
    })
  })
}

async function fetchTikTokAdRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  adGroupId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalAdgroupId] = adGroupId.split(":")
  const [insightRows, adRows] = await Promise.all([
    fetchTikTokRawRecords(db, actor, ["ad_insights"], range, connectionId),
    fetchTikTokRawRecords(db, actor, ["ads"], null, connectionId),
  ])

  const adByKey = new Map<string, TikTokRawRecordRow>()
  for (const row of adRows) {
    if (String(row.payload.adgroup_id ?? "") === externalAdgroupId) {
      adByKey.set(row.entity_id, row)
    }
  }

  const grouped = new Map<string, TikTokRawRecordRow[]>()
  for (const row of insightRows) {
    const dimensions = (row.payload.dimensions ?? {}) as Record<string, unknown>
    const adId = String(dimensions.ad_id ?? "")
    if (!adId || !adByKey.has(adId)) continue
    const existing = grouped.get(adId)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(adId, [row])
    }
  }

  return Array.from(grouped.entries()).map(([adId, rows]) => {
    const meta = adByKey.get(adId)
    const name = String(meta?.payload.ad_name ?? adId)
    const status = String(meta?.payload.operation_status ?? "UNKNOWN")
    const reduced = reduceTikTokInsights(rows)

    return finalizeRow({
      ...zeroRow({
        id: `tiktok_ads:${connectionId}:${customerId}:${adId}`,
        parentId: adGroupId,
        platform: "TikTok",
        level: "ad",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.clicks,
      conversions: reduced.conversions,
      impressions: reduced.impressions,
    })
  })
}

// -- Snapchat Ads ----------------------------------------------------------------------------
// snapchat_records already unifies all 3 granularities under one 'stats' entity_type, with a
// `level` field in the payload distinguishing campaign/ad_squad/ad -- unlike Meta/TikTok, no
// per-granularity entity_type split was needed here (already built that way, see migration
// 027_snapchat_ad_squads.sql). Snapchat's STATS_FIELDS ("spend,impressions,swipes,
// swipe_up_percent") has no clicks field by that name -- "swipes" (swipe-up interactions) is
// the closest equivalent, mapped to the shared row's `clicks` field. No conversions/revenue
// field is synced for Snapchat at all today, so both stay 0, matching TikTok's already-
// accepted "real metrics only, not guessed ones" precedent from Phase 3.

interface SnapchatRawRecordRow {
  connection_id: string
  customer_id: string
  entity_type: string
  entity_id: string
  record_date: string
  payload: Record<string, unknown>
  [key: string]: unknown
}

async function fetchSnapchatRawRecords(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  entityTypes: string[],
  range: DateRange | null,
  connectionId?: string
): Promise<SnapchatRawRecordRow[]> {
  // See fetchMetaRawRecords' comment: built conditionally to sidestep a pg-mem-only
  // limitation with "$N IS NULL OR ..." combined with ANY(...) across a JOIN.
  const conditions = [
    "r.entity_type = ANY($1::text[])",
    "conn.organization_id = $2",
    "conn.deleted_at IS NULL",
    "conn.status = 'connected'",
  ]
  const values: unknown[] = [entityTypes, actor.organizationId]
  if (actor.workspaceId) {
    values.push(actor.workspaceId)
    conditions.push(`conn.workspace_id = $${values.length}`)
  }
  if (connectionId) {
    values.push(connectionId)
    conditions.push(`r.connection_id = $${values.length}`)
  }
  if (range) {
    values.push(range.startDateSql)
    conditions.push(`r.record_date >= $${values.length}::date`)
    values.push(range.endDateSql)
    conditions.push(`r.record_date <= $${values.length}::date`)
  }
  values.push(MAX_ROWS_PER_LEVEL)

  const result = await db.query<SnapchatRawRecordRow>(
    `
    SELECT r.connection_id, r.customer_id, r.entity_type, r.entity_id, r.record_date, r.payload
    FROM snapchat_records r
    JOIN snapchat_oauth_connections conn ON conn.id = r.connection_id
    WHERE ${conditions.join(" AND ")}
    LIMIT $${values.length}
    `,
    values
  )
  return result.rows
}

function reduceSnapchatStats(rows: SnapchatRawRecordRow[]) {
  let spend = 0
  let impressions = 0
  let swipes = 0
  let latestDate: string | null = null

  for (const row of rows) {
    spend += Number(row.payload.spend) || 0
    impressions += Number(row.payload.impressions) || 0
    swipes += Number(row.payload.swipes) || 0
    const startTime =
      typeof row.payload.startTime === "string" ? row.payload.startTime.slice(0, 10) : null
    if (startTime && (!latestDate || startTime > latestDate)) {
      latestDate = startTime
    }
  }

  return { spend, impressions, swipes, latestDate }
}

async function fetchSnapchatCampaignRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange
): Promise<CampaignPerformanceRow[]> {
  const [statRows, campaignRows] = await Promise.all([
    fetchSnapchatRawRecords(db, actor, ["stats"], range),
    fetchSnapchatRawRecords(db, actor, ["campaigns"], null),
  ])

  const campaignByKey = new Map<string, SnapchatRawRecordRow>()
  for (const row of campaignRows) {
    campaignByKey.set(`${row.connection_id}:${row.entity_id}`, row)
  }

  const grouped = new Map<string, SnapchatRawRecordRow[]>()
  for (const row of statRows) {
    if (row.payload.level !== "campaign") continue
    const campaignId = String(row.payload.entityId ?? "")
    if (!campaignId) continue
    const key = `${row.connection_id}:${campaignId}`
    const existing = grouped.get(key)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(key, [row])
    }
  }

  return Array.from(grouped.entries()).map(([key, rows]) => {
    const [connectionId, campaignId] = key.split(":")
    const meta = campaignByKey.get(key)
    const name = String(meta?.payload.name ?? campaignId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const objective = (meta?.payload.objective as string | undefined) ?? null
    const reduced = reduceSnapchatStats(rows)
    const customerId = rows[0]?.customer_id ?? ""

    return finalizeRow({
      ...zeroRow({
        id: `snapchat_ads:${connectionId}:${customerId}:${campaignId}`,
        parentId: null,
        platform: "Snapchat",
        level: "campaign",
        name,
        status,
        objective,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.swipes,
      impressions: reduced.impressions,
      cpm:
        reduced.impressions > 0
          ? Number(((reduced.spend / reduced.impressions) * 1000).toFixed(2))
          : 0,
    })
  })
}

async function fetchSnapchatAdGroupRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  campaignId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalCampaignId] = campaignId.split(":")
  const [statRows, adSquadRows] = await Promise.all([
    fetchSnapchatRawRecords(db, actor, ["stats"], range, connectionId),
    fetchSnapchatRawRecords(db, actor, ["ad_squads"], null, connectionId),
  ])

  const adSquadByKey = new Map<string, SnapchatRawRecordRow>()
  for (const row of adSquadRows) {
    if (String(row.payload.campaign_id ?? "") === externalCampaignId) {
      adSquadByKey.set(row.entity_id, row)
    }
  }

  const grouped = new Map<string, SnapchatRawRecordRow[]>()
  for (const row of statRows) {
    if (row.payload.level !== "ad_squad") continue
    const adSquadId = String(row.payload.entityId ?? "")
    if (!adSquadId || !adSquadByKey.has(adSquadId)) continue
    const existing = grouped.get(adSquadId)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(adSquadId, [row])
    }
  }

  return Array.from(grouped.entries()).map(([adSquadId, rows]) => {
    const meta = adSquadByKey.get(adSquadId)
    const name = String(meta?.payload.name ?? adSquadId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const reduced = reduceSnapchatStats(rows)

    return finalizeRow({
      ...zeroRow({
        id: `snapchat_ads:${connectionId}:${customerId}:${adSquadId}`,
        parentId: campaignId,
        platform: "Snapchat",
        level: "adGroup",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.swipes,
      impressions: reduced.impressions,
    })
  })
}

async function fetchSnapchatAdRows(
  db: PostgresDatabase,
  actor: AuthenticatedActor,
  range: DateRange,
  adGroupId: string
): Promise<CampaignPerformanceRow[]> {
  const [, connectionId, customerId, externalAdSquadId] = adGroupId.split(":")
  const [statRows, adRows] = await Promise.all([
    fetchSnapchatRawRecords(db, actor, ["stats"], range, connectionId),
    fetchSnapchatRawRecords(db, actor, ["ads"], null, connectionId),
  ])

  const adByKey = new Map<string, SnapchatRawRecordRow>()
  for (const row of adRows) {
    if (String(row.payload.ad_squad_id ?? "") === externalAdSquadId) {
      adByKey.set(row.entity_id, row)
    }
  }

  const grouped = new Map<string, SnapchatRawRecordRow[]>()
  for (const row of statRows) {
    if (row.payload.level !== "ad") continue
    const adId = String(row.payload.entityId ?? "")
    if (!adId || !adByKey.has(adId)) continue
    const existing = grouped.get(adId)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(adId, [row])
    }
  }

  return Array.from(grouped.entries()).map(([adId, rows]) => {
    const meta = adByKey.get(adId)
    const name = String(meta?.payload.name ?? adId)
    const status = String(meta?.payload.status ?? "UNKNOWN")
    const reduced = reduceSnapchatStats(rows)

    return finalizeRow({
      ...zeroRow({
        id: `snapchat_ads:${connectionId}:${customerId}:${adId}`,
        parentId: adGroupId,
        platform: "Snapchat",
        level: "ad",
        name,
        status,
        objective: null,
        activityDate: reduced.latestDate,
      }),
      spend: reduced.spend,
      clicks: reduced.swipes,
      impressions: reduced.impressions,
    })
  })
}

// -- Aggregation service ---------------------------------------------------------------------

function sumRows(rows: CampaignPerformanceRow[]) {
  return rows.reduce(
    (acc, row) => ({
      spend: acc.spend + row.spend,
      revenue: acc.revenue + row.revenue,
      conversions: acc.conversions + row.conversions,
      clicks: acc.clicks + row.clicks,
      activeCampaigns:
        acc.activeCampaigns + (bucketCampaignStatus(row.status) === "Active" ? 1 : 0),
    }),
    { spend: 0, revenue: 0, conversions: 0, clicks: 0, activeCampaigns: 0 }
  )
}

export class CampaignsPerformanceAggregationService {
  constructor(private readonly db: PostgresDatabase) {}

  private async fetchAllCampaignRows(
    actor: AuthenticatedActor,
    range: DateRange
  ): Promise<CampaignPerformanceRow[]> {
    const [google, meta, tiktok, snapchat] = await Promise.all([
      fetchGoogleCampaignRows(this.db, actor, range),
      fetchMetaCampaignRows(this.db, actor, range),
      fetchTikTokCampaignRows(this.db, actor, range),
      fetchSnapchatCampaignRows(this.db, actor, range),
    ])
    return [...google, ...meta, ...tiktok, ...snapchat]
  }

  async getSummary(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<CampaignPerformanceSummary> {
    const { current, previous } = resolveDateRange(query)
    const [currentRows, previousRows] = await Promise.all([
      this.fetchAllCampaignRows(actor, current),
      this.fetchAllCampaignRows(actor, previous),
    ])

    const filteredCurrent = currentRows.filter((row) => matchesFilters(row, query))
    const currentTotals = sumRows(filteredCurrent)
    const previousTotals = sumRows(previousRows.filter((row) => matchesFilters(row, query)))

    const cpa = currentTotals.conversions > 0 ? currentTotals.spend / currentTotals.conversions : 0
    const previousCpa =
      previousTotals.conversions > 0 ? previousTotals.spend / previousTotals.conversions : 0
    const conversionRate =
      currentTotals.clicks > 0 ? (currentTotals.conversions / currentTotals.clicks) * 100 : 0
    const previousConversionRate =
      previousTotals.clicks > 0 ? (previousTotals.conversions / previousTotals.clicks) * 100 : 0
    const roas = currentTotals.spend > 0 ? currentTotals.revenue / currentTotals.spend : 0
    const previousRoas =
      previousTotals.spend > 0 ? previousTotals.revenue / previousTotals.spend : 0

    return {
      spend: currentTotals.spend,
      spendChangePct: computeChangePct(currentTotals.spend, previousTotals.spend),
      revenue: currentTotals.revenue,
      revenueChangePct: computeChangePct(currentTotals.revenue, previousTotals.revenue),
      roas,
      roasChangePct: computeChangePct(roas, previousRoas),
      conversions: currentTotals.conversions,
      conversionsChangePct: computeChangePct(currentTotals.conversions, previousTotals.conversions),
      cpa,
      cpaChangePct: computeChangePct(cpa, previousCpa),
      conversionRate,
      conversionRateChangePct: computeChangePct(conversionRate, previousConversionRate),
      activeCampaigns: currentTotals.activeCampaigns,
      activeCampaignsChangePct: computeChangePct(
        currentTotals.activeCampaigns,
        previousTotals.activeCampaigns
      ),
    }
  }

  async getPlatformBreakdown(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<CampaignPerformancePlatformRow[]> {
    const { current } = resolveDateRange(query)
    const rows = (await this.fetchAllCampaignRows(actor, current)).filter((row) =>
      matchesFilters(row, query)
    )

    const platforms: CampaignPerformancePlatform[] = [
      "Google Search",
      "Google Display",
      "YouTube",
      "Meta",
      "TikTok",
      "Snapchat",
    ]

    return platforms
      .map((platform) => {
        const subset = rows.filter((row) => row.platform === platform)
        const totals = sumRows(subset)
        const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0

        return {
          ...finalizeRow({
            ...zeroRow({
              id: `platform:${platform}`,
              parentId: null,
              platform,
              level: "campaign",
              name: platform,
              status: totals.activeCampaigns > 0 ? "Active" : "No Data",
              objective: null,
              activityDate: null,
            }),
            spend: totals.spend,
            revenue: totals.revenue,
            clicks: totals.clicks,
            conversions: totals.conversions,
          }),
          roas,
          activeCampaigns: totals.activeCampaigns,
        }
      })
      .filter((row) => row.activeCampaigns > 0 || row.spend > 0)
  }

  async listCampaigns(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery & { page?: number; pageSize?: number }
  ): Promise<CampaignPerformancePage> {
    const { current } = resolveDateRange(query)
    const rows = (await this.fetchAllCampaignRows(actor, current)).filter((row) =>
      matchesFilters(row, query)
    )

    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 200))
    const start = (page - 1) * pageSize
    const items = rows.slice(start, start + pageSize)

    return { items, pagination: { page, pageSize, total: rows.length } }
  }

  async listAdGroups(
    actor: AuthenticatedActor,
    campaignId: string,
    query: CampaignPerformanceQuery
  ): Promise<{ items: CampaignPerformanceRow[] }> {
    const { current } = resolveDateRange(query)
    const [platform] = campaignId.split(":")

    if (platform === "google_ads") {
      return { items: await fetchGoogleAdGroupRows(this.db, actor, current, campaignId) }
    }
    if (platform === "meta_ads") {
      return { items: await fetchMetaAdGroupRows(this.db, actor, current, campaignId) }
    }
    if (platform === "tiktok_ads") {
      return { items: await fetchTikTokAdGroupRows(this.db, actor, current, campaignId) }
    }
    if (platform === "snapchat_ads") {
      return { items: await fetchSnapchatAdGroupRows(this.db, actor, current, campaignId) }
    }
    return { items: [] }
  }

  async listAdsOrKeywords(
    actor: AuthenticatedActor,
    adGroupId: string,
    level: "ads" | "keywords",
    query: CampaignPerformanceQuery
  ): Promise<{ items: CampaignPerformanceRow[] }> {
    const { current } = resolveDateRange(query)
    const [platform] = adGroupId.split(":")

    if (platform === "google_ads") {
      return { items: await fetchGoogleLeafRows(this.db, actor, current, adGroupId, level) }
    }
    if (platform === "meta_ads") {
      return { items: await fetchMetaAdRows(this.db, actor, current, adGroupId) }
    }
    if (platform === "tiktok_ads") {
      return { items: await fetchTikTokAdRows(this.db, actor, current, adGroupId) }
    }
    if (platform === "snapchat_ads") {
      return { items: await fetchSnapchatAdRows(this.db, actor, current, adGroupId) }
    }
    return { items: [] }
  }
}
