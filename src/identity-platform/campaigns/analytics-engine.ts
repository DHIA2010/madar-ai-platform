import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type { ChannelsAggregationService } from "../channels/channels-service"

import type {
  CampaignPerformancePlatformRow,
  CampaignPerformanceQuery,
  CampaignPerformanceRow,
  CampaignPerformanceSummary,
  CampaignsPerformanceAggregationService,
} from "./performance-service"
import { combineConfidence, computeConfidence } from "./confidence-engine"
import type {
  AnomalyFlag,
  CampaignDeclineRow,
  CampaignRow,
  ChannelComparisonRow,
  ChannelFreshness,
  ContributionRow,
  MetricDelta,
  MetricKey,
  MetricSnapshot,
  PeriodComparisonResult,
  PeriodRange,
  PerformanceDriver,
  SampleSize,
} from "./analytics-types"

const STALE_SYNC_MINUTES = 90

// Minimum magnitude (percentage points) before a metric change is even considered for driver
// analysis or anomaly flagging -- below this, normal day-to-day noise would otherwise get
// reported as a "finding." Mirrors channels-service.ts's own SPEND_ANOMALY_THRESHOLD_PCT (30)
// for the same reasoning, applied to the wider metric set this engine covers.
const MATERIAL_CHANGE_PCT = 15
const ANOMALY_CHANGE_PCT = 30

function daysBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1)
}

// previous === 0 yields null (an undefined percentage), never Infinity/NaN -- see
// analytics-types.ts's MetricDelta comment. This is the one place percentage change is computed
// anywhere in this engine; every caller reuses it instead of re-deriving the formula.
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function snapshotFromSummary(summary: CampaignPerformanceSummary): MetricSnapshot {
  return {
    spend: summary.spend,
    revenue: summary.revenue,
    roas: summary.roas,
    impressions: summary.impressions,
    clicks: summary.clicks,
    ctr: summary.ctr,
    cpc: safeDivide(summary.spend, summary.clicks),
    cpm: safeDivide(summary.spend, summary.impressions) * 1000,
    conversions: summary.conversions,
    conversionRate: summary.conversionRate,
    cpa: summary.cpa,
    activeCampaigns: summary.activeCampaigns,
  }
}

function snapshotFromRow(
  row: CampaignPerformanceRow | CampaignPerformancePlatformRow
): MetricSnapshot {
  const activeCampaigns =
    "activeCampaigns" in row ? row.activeCampaigns : row.status === "Active" ? 1 : 0
  return {
    spend: row.spend,
    revenue: row.revenue,
    roas: row.roas,
    impressions: row.impressions,
    clicks: row.clicks,
    ctr: row.ctr,
    cpc: row.cpc,
    cpm: row.cpm,
    conversions: row.conversions,
    conversionRate: row.conversionRate,
    cpa: row.cpa,
    activeCampaigns,
  }
}

const METRIC_KEYS: MetricKey[] = [
  "spend",
  "revenue",
  "roas",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "conversions",
  "conversionRate",
  "cpa",
  "activeCampaigns",
]

function buildDeltas(current: MetricSnapshot, previous: MetricSnapshot): MetricDelta[] {
  return METRIC_KEYS.map((metric) => ({
    metric,
    current: current[metric],
    previous: previous[metric],
    changePercent: pctChange(current[metric], previous[metric]),
    changeAbsolute: Math.round((current[metric] - previous[metric]) * 100) / 100,
  }))
}

function sampleSizeFromSnapshot(snapshot: MetricSnapshot, days: number): SampleSize {
  return { spend: snapshot.spend, clicks: snapshot.clicks, conversions: snapshot.conversions, days }
}

// Mirrors campaigns/performance-service.ts's own resolveDateRange convention (equal-length
// mirrored previous period) rather than inventing a different default -- "last 30 days vs
// previous 30 days" when nothing more specific is given, same as every existing dashboard call.
export function defaultComparisonRanges(explicit?: { currentFrom?: string; currentTo?: string }): {
  current: PeriodRange
  previous: PeriodRange
} {
  const to = explicit?.currentTo ? new Date(explicit.currentTo) : new Date()
  const from = explicit?.currentFrom
    ? new Date(explicit.currentFrom)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000)
  const spanMs = to.getTime() - from.getTime()
  const previousTo = new Date(from.getTime() - 24 * 60 * 60 * 1000)
  const previousFrom = new Date(previousTo.getTime() - spanMs)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    current: { from: iso(from), to: iso(to) },
    previous: { from: iso(previousFrom), to: iso(previousTo) },
  }
}

export class CampaignAnalyticsEngine {
  constructor(
    private readonly performanceService: CampaignsPerformanceAggregationService,
    private readonly channelsService: ChannelsAggregationService,
    // Duck-typed, not the concrete Redis class -- keeps this engine constructible (and testable)
    // without Redis; server.ts passes the real container.infrastructure.cache, tests pass
    // nothing and simply get no caching. Short TTL only (ad spend data syncs on its own cadence
    // anyway; this just absorbs a burst of near-identical questions in one conversation, not a
    // substitute for sync freshness).
    private readonly cache?: {
      get(key: string): Promise<string | null>
      set(key: string, value: string, ttlSeconds?: number): Promise<void>
    }
  ) {}

  private cacheKey(actor: AuthenticatedActor, name: string, query: unknown): string {
    return `ai-analytics:${actor.organizationId}:${actor.workspaceId ?? "all"}:${name}:${JSON.stringify(query)}`
  }

  private async withCache<T>(
    actor: AuthenticatedActor,
    name: string,
    query: unknown,
    ttlSeconds: number,
    compute: () => Promise<T>
  ): Promise<T> {
    if (!this.cache) return compute()
    const key = this.cacheKey(actor, name, query)
    const cached = await this.cache.get(key)
    if (cached) {
      try {
        return JSON.parse(cached) as T
      } catch {
        // Fall through to recompute -- a corrupt cache entry must never break the feature.
      }
    }
    const result = await compute()
    await this.cache.set(key, JSON.stringify(result), ttlSeconds)
    return result
  }

  private async getFreshness(actor: AuthenticatedActor): Promise<ChannelFreshness[]> {
    const states = await this.channelsService.getConnectionFreshness(actor)
    return Object.entries(states).map(([channel, state]) => {
      const minutesSinceSync = state.lastSyncedAt
        ? Math.round((Date.now() - new Date(state.lastSyncedAt).getTime()) / (1000 * 60))
        : null
      return {
        channel,
        connected: state.connected,
        lastSyncedAt: state.lastSyncedAt,
        minutesSinceSync,
        isStale:
          state.connected && (minutesSinceSync === null || minutesSinceSync > STALE_SYNC_MINUTES),
      }
    })
  }

  // get_campaign_summary -- account-wide snapshot for one period, with freshness + confidence
  // attached so the AI can state both the numbers and how much to trust them in one call.
  async getCampaignSummary(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<{
    metrics: MetricSnapshot
    sampleSize: SampleSize
    confidence: string
    freshness: ChannelFreshness[]
  }> {
    return this.withCache(actor, "campaign-summary", query, 60, async () => {
      const summary = await this.performanceService.getSummary(actor, query)
      const metrics = snapshotFromSummary(summary)
      const days =
        query.startDate && query.endDate ? daysBetween(query.startDate, query.endDate) : 30
      const sampleSize = sampleSizeFromSnapshot(metrics, days)
      const freshness = await this.getFreshness(actor)
      return { metrics, sampleSize, confidence: computeConfidence(sampleSize), freshness }
    })
  }

  // compare_campaign_periods -- the one place "before -> after, +X%" is computed anywhere in this
  // system. Calls getSummary twice with two EXPLICIT, non-overlapping ranges (never relying on
  // performance-service.ts's own internal auto-previous-period logic, which compares each call
  // to ITS OWN prior period, not the caller-specified one) -- reuses the tested aggregation
  // method as-is, computes the diff here.
  async comparePeriods(
    actor: AuthenticatedActor,
    ranges: { current: PeriodRange; previous: PeriodRange }
  ): Promise<PeriodComparisonResult> {
    const [currentSummary, previousSummary] = await Promise.all([
      this.performanceService.getSummary(actor, {
        startDate: ranges.current.from,
        endDate: ranges.current.to,
      }),
      this.performanceService.getSummary(actor, {
        startDate: ranges.previous.from,
        endDate: ranges.previous.to,
      }),
    ])
    const current = snapshotFromSummary(currentSummary)
    const previous = snapshotFromSummary(previousSummary)
    const deltas = buildDeltas(current, previous)
    const freshness = await this.getFreshness(actor)
    const days = daysBetween(ranges.current.from, ranges.current.to)
    const previousDays = daysBetween(ranges.previous.from, ranges.previous.to)
    const sampleSize = sampleSizeFromSnapshot(current, days)
    const previousSampleSize = sampleSizeFromSnapshot(previous, previousDays)
    const confidence = combineConfidence(
      computeConfidence(sampleSize),
      computeConfidence(previousSampleSize)
    )
    return { period: ranges, current, previous, deltas, freshness, sampleSize, confidence }
  }

  // get_channel_comparison -- only channels with real campaigns in range (getPlatformBreakdown
  // already filters to `hasCampaigns`, see performance-service.ts) so a workspace with no
  // Snapchat connection simply never appears, rather than showing a misleading zero row.
  async getChannelComparison(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<ChannelComparisonRow[]> {
    return this.withCache(actor, "channel-comparison", query, 60, async () => {
      const [rows, freshnessList] = await Promise.all([
        this.performanceService.getPlatformBreakdown(actor, query),
        this.getFreshness(actor),
      ])
      const days =
        query.startDate && query.endDate ? daysBetween(query.startDate, query.endDate) : 30
      const freshnessByChannel = new Map(freshnessList.map((f) => [f.channel, f]))
      return rows.map((row) => {
        const metrics = snapshotFromRow(row)
        const sampleSize = sampleSizeFromSnapshot(metrics, days)
        return {
          channel: row.platform,
          metrics,
          freshness: freshnessByChannel.get(row.platform) ?? {
            channel: row.platform,
            connected: true,
            lastSyncedAt: null,
            minutesSinceSync: null,
            isStale: false,
          },
          sampleSize,
          confidence: computeConfidence(sampleSize),
        }
      })
    })
  }

  private async listAllCampaigns(
    actor: AuthenticatedActor,
    query: CampaignPerformanceQuery
  ): Promise<CampaignPerformanceRow[]> {
    // pageSize capped at 200 by listCampaigns itself (performance-service.ts) -- one call is
    // enough for any workspace this engine will realistically see in its first version.
    const page = await this.performanceService.listCampaigns(actor, {
      ...query,
      page: 1,
      pageSize: 200,
    })
    return page.items
  }

  // get_top_campaigns / get_lowest_performing_campaigns, by any metric. Rows below the
  // confidence-engine's minimum sample thresholds are dropped before ranking -- never "the best
  // campaign" based on 5 clicks (requirement: don't expose rankings where the sample is too
  // small).
  async getCampaignRanking(
    actor: AuthenticatedActor,
    options: {
      query: CampaignPerformanceQuery
      metric: MetricKey
      direction: "top" | "bottom"
      limit: number
    }
  ): Promise<CampaignRow[]> {
    const rows = await this.listAllCampaigns(actor, options.query)
    const days =
      options.query.startDate && options.query.endDate
        ? daysBetween(options.query.startDate, options.query.endDate)
        : 30
    const ranked = rows
      .map((row) => {
        const metrics = snapshotFromRow(row)
        const sampleSize = sampleSizeFromSnapshot(metrics, days)
        return {
          id: row.id,
          name: row.name,
          platform: row.platform,
          status: row.status,
          metrics,
          sampleSize,
          confidence: computeConfidence(sampleSize),
        }
      })
      // "insufficient" confidence campaigns are excluded from ranking entirely -- they can still
      // be seen via get_campaign_summary/list, just never surfaced as "the best"/"the worst."
      .filter((row) => row.confidence !== "insufficient")
      .sort((a, b) =>
        options.direction === "top"
          ? b.metrics[options.metric] - a.metrics[options.metric]
          : a.metrics[options.metric] - b.metrics[options.metric]
      )
    return ranked.slice(0, options.limit)
  }

  // get_campaign_declines -- per-campaign period-over-period comparison, joined by campaign id
  // across two listCampaigns() calls. A campaign present only in one period (new or ended) is
  // skipped -- a 0->X or X->0 "decline" would be a comparison against nothing, not a real trend.
  async getCampaignDeclines(
    actor: AuthenticatedActor,
    options: {
      ranges: { current: PeriodRange; previous: PeriodRange }
      metric: MetricKey
      limit: number
    }
  ): Promise<CampaignDeclineRow[]> {
    const [currentRows, previousRows] = await Promise.all([
      this.listAllCampaigns(actor, {
        startDate: options.ranges.current.from,
        endDate: options.ranges.current.to,
      }),
      this.listAllCampaigns(actor, {
        startDate: options.ranges.previous.from,
        endDate: options.ranges.previous.to,
      }),
    ])
    const previousById = new Map(previousRows.map((row) => [row.id, row]))
    const days = daysBetween(options.ranges.current.from, options.ranges.current.to)
    const previousDays = daysBetween(options.ranges.previous.from, options.ranges.previous.to)

    const joined: CampaignDeclineRow[] = []
    for (const row of currentRows) {
      const previousRow = previousById.get(row.id)
      if (!previousRow) continue
      const metrics = snapshotFromRow(row)
      const previousMetrics = snapshotFromRow(previousRow)
      const sampleSize = sampleSizeFromSnapshot(metrics, days)
      const previousSampleSize = sampleSizeFromSnapshot(previousMetrics, previousDays)
      const confidence = combineConfidence(
        computeConfidence(sampleSize),
        computeConfidence(previousSampleSize)
      )
      if (confidence === "insufficient") continue
      joined.push({
        id: row.id,
        name: row.name,
        platform: row.platform,
        status: row.status,
        metrics,
        sampleSize,
        confidence,
        previousMetrics,
        deltas: buildDeltas(metrics, previousMetrics),
      })
    }

    return joined
      .filter((row) => row.metrics[options.metric] - row.previousMetrics[options.metric] < 0)
      .sort(
        (a, b) =>
          a.metrics[options.metric] -
          a.previousMetrics[options.metric] -
          (b.metrics[options.metric] - b.previousMetrics[options.metric])
      )
      .slice(0, options.limit)
  }

  // get_campaign_anomalies -- combines the EXISTING, already-shipped channel-level alerts
  // (channels-service.ts's getAlerts: stale sync + spend spike/drop, untouched here) with new
  // campaign-level threshold checks on the same transparent-rules philosophy, not ML.
  async detectAnomalies(actor: AuthenticatedActor): Promise<AnomalyFlag[]> {
    const [channelAlerts, ranges] = await Promise.all([
      this.channelsService.getAlerts(actor),
      Promise.resolve(defaultComparisonRanges()),
    ])
    const flags: AnomalyFlag[] = channelAlerts.items.map((alert) => ({
      type: alert.type,
      scope: "channel",
      entityId: null,
      entityName: alert.channel,
      severity: alert.severity === "error" ? "critical" : "warning",
      detail:
        alert.type === "stale_sync"
          ? `${alert.channel}: لم تتم المزامنة منذ ${alert.minutesSinceSync ?? "فترة غير معروفة"} دقيقة`
          : `${alert.channel}: الإنفاق اليومي ${alert.changePct && alert.changePct > 0 ? "ارتفع" : "انخفض"} ${Math.abs(alert.changePct ?? 0)}% عن المتوسط`,
      changePercent: alert.changePct ?? null,
    }))

    const declines = await this.getCampaignDeclines(actor, { ranges, metric: "roas", limit: 20 })
    for (const campaign of declines) {
      for (const delta of campaign.deltas) {
        if (delta.changePercent === null || Math.abs(delta.changePercent) < ANOMALY_CHANGE_PCT)
          continue
        const anomalyType: AnomalyFlag["type"] | null =
          delta.metric === "roas" && delta.changePercent < 0
            ? "roas_drop"
            : delta.metric === "cpa" && delta.changePercent > 0
              ? "cpa_spike"
              : delta.metric === "ctr" && delta.changePercent < 0
                ? "ctr_collapse"
                : delta.metric === "cpc" && delta.changePercent > 0
                  ? "cpc_spike"
                  : delta.metric === "conversionRate" && delta.changePercent < 0
                    ? "conversion_rate_drop"
                    : null
        if (!anomalyType) continue
        flags.push({
          type: anomalyType,
          scope: "campaign",
          entityId: campaign.id,
          entityName: campaign.name,
          severity: Math.abs(delta.changePercent) >= 50 ? "critical" : "warning",
          detail: `${campaign.name}: ${delta.metric} تغيّر ${delta.changePercent}% مقارنة بالفترة السابقة`,
          changePercent: delta.changePercent,
        })
      }
    }
    return flags
  }

  // identify_performance_drivers -- pure arithmetic over an already-computed comparison. Never
  // calls the LLM, never asserts causation -- only ranks which already-observed changes are
  // largest in magnitude and consistent in direction with the metric under investigation.
  identifyPerformanceDrivers(
    comparison: PeriodComparisonResult,
    targetMetric: MetricKey
  ): PerformanceDriver[] {
    const targetDelta = comparison.deltas.find((d) => d.metric === targetMetric)
    const targetDirection = targetDelta && targetDelta.changeAbsolute < 0 ? "down" : "up"

    const candidates = comparison.deltas.filter(
      (d) =>
        d.metric !== targetMetric &&
        d.changePercent !== null &&
        Math.abs(d.changePercent) >= MATERIAL_CHANGE_PCT
    )
    const ranked = candidates
      .slice()
      .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))

    return ranked.map((delta, index) => {
      const direction = (delta.changeAbsolute < 0 ? "down" : "up") as "up" | "down"
      const verb = direction === "up" ? "ارتفع" : "انخفض"
      return {
        metric: delta.metric,
        changePercent: delta.changePercent,
        changeAbsolute: delta.changeAbsolute,
        direction,
        magnitudeRank: index + 1,
        narrative:
          index === 0
            ? `أكبر تغيّر ملحوظ هو ${verb} ${delta.metric} بنسبة ${Math.abs(delta.changePercent ?? 0)}%، وهو ما يتوافق زمنيًا مع اتجاه ${targetDirection === "down" ? "انخفاض" : "ارتفاع"} ${targetMetric}.`
            : `${verb} ${delta.metric} أيضًا بنسبة ${Math.abs(delta.changePercent ?? 0)}%.`,
      }
    })
  }

  // contribution-aware ranking (section 10): sorts by absolute currency impact, not percentage,
  // so a campaign with -15% ROAS on 100,000 SAR of spend outranks one with -50% ROAS on 100 SAR.
  async getContributionAnalysis(
    actor: AuthenticatedActor,
    options: { ranges: { current: PeriodRange; previous: PeriodRange }; limit: number }
  ): Promise<ContributionRow[]> {
    const [currentRows, previousRows] = await Promise.all([
      this.listAllCampaigns(actor, {
        startDate: options.ranges.current.from,
        endDate: options.ranges.current.to,
      }),
      this.listAllCampaigns(actor, {
        startDate: options.ranges.previous.from,
        endDate: options.ranges.previous.to,
      }),
    ])
    const previousById = new Map(previousRows.map((row) => [row.id, row]))
    const totalSpend = currentRows.reduce((sum, row) => sum + row.spend, 0)
    const totalRevenue = currentRows.reduce((sum, row) => sum + row.revenue, 0)

    const rows: ContributionRow[] = currentRows.map((row) => {
      const previousRow = previousById.get(row.id)
      const revenueDeltaAbsolute = previousRow
        ? Math.round((row.revenue - previousRow.revenue) * 100) / 100
        : null
      const roasDeteriorationScore =
        previousRow && previousRow.roas > row.roas
          ? Math.round((previousRow.roas - row.roas) * row.spend * 100) / 100
          : null
      return {
        entityId: row.id,
        entityName: row.name,
        spend: row.spend,
        revenue: row.revenue,
        spendShare: safeDivide(row.spend, totalSpend),
        revenueShare: safeDivide(row.revenue, totalRevenue),
        revenueDeltaAbsolute,
        roasDeteriorationScore,
      }
    })

    return rows
      .filter((row) => (row.roasDeteriorationScore ?? 0) > 0 || (row.revenueDeltaAbsolute ?? 0) < 0)
      .sort((a, b) => (b.roasDeteriorationScore ?? 0) - (a.roasDeteriorationScore ?? 0))
      .slice(0, options.limit)
  }
}
