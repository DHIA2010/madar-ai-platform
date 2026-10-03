import type {
  AnomalyFlag,
  CampaignDeclineRow,
  CampaignRecommendation,
  CampaignRow,
  CampaignScalingSignal,
  ChannelComparisonRow,
  ConfidenceLevel,
  MetricKey,
  PeriodComparisonResult,
  PerformanceDriver,
} from "../campaigns/analytics-types"

import type {
  ChartSeriesPoint,
  ChartSpec,
  Fact,
  Insight,
  KpiCard,
  RawToolResult,
  StructuredAnalyticsResponse,
} from "./response-types"

// Which of the ~12 metrics in a MetricSnapshot are worth a KPI card -- the full set would be
// noisy (nobody needs a card for "active campaigns"); these are the ones a business owner
// actually scans first. Matches the headline fields used throughout the campaigns feature.
const HEADLINE_METRICS: Array<{ key: MetricKey; title: string; format: KpiCard["format"] }> = [
  { key: "spend", title: "الإنفاق", format: "currency" },
  { key: "revenue", title: "الإيرادات", format: "currency" },
  { key: "roas", title: "ROAS", format: "multiple" },
  { key: "cpa", title: "تكلفة الاكتساب (CPA)", format: "currency" },
  { key: "conversionRate", title: "معدل التحويل", format: "percent" },
]

const MATERIAL_FACT_PCT = 10

function trend(changePercent: number | null): KpiCard["trend"] {
  if (changePercent === null || Math.abs(changePercent) < 1) return "flat"
  return changePercent > 0 ? "up" : "down"
}

function factFromComparison(comparison: PeriodComparisonResult): Fact[] {
  return comparison.deltas
    .filter((d) => d.changePercent !== null && Math.abs(d.changePercent) >= MATERIAL_FACT_PCT)
    .map((d) => ({
      statement: `${d.metric}: ${d.previous} -> ${d.current} (${d.changePercent! > 0 ? "+" : ""}${d.changePercent}%)`,
      metric: d.metric,
      currentValue: d.current,
      previousValue: d.previous,
      changePercent: d.changePercent,
    }))
}

function kpiCardsFromComparison(comparison: PeriodComparisonResult): KpiCard[] {
  return HEADLINE_METRICS.map(({ key, title, format }) => {
    const delta = comparison.deltas.find((d) => d.metric === key)!
    return {
      type: "kpi" as const,
      title,
      value: delta.current,
      previousValue: delta.previous,
      changePercent: delta.changePercent,
      trend: trend(delta.changePercent),
      format,
    }
  })
}

function kpiCardsFromSnapshot(metrics: Record<MetricKey, number>): KpiCard[] {
  return HEADLINE_METRICS.map(({ key, title, format }) => ({
    type: "kpi" as const,
    title,
    value: metrics[key],
    previousValue: null,
    changePercent: null,
    trend: "flat" as const,
    format,
  }))
}

function insightsFromDrivers(drivers: PerformanceDriver[]): Insight[] {
  return drivers.map((driver) => ({
    statement: driver.narrative,
    relatedMetrics: [driver.metric],
    confidence: "medium" as ConfidenceLevel,
  }))
}

function factsAndInsightsFromAnomalies(anomalies: AnomalyFlag[]): {
  facts: Fact[]
  insights: Insight[]
} {
  const facts: Fact[] = []
  const insights: Insight[] = []
  for (const anomaly of anomalies) {
    facts.push({
      statement: anomaly.detail,
      metric: anomaly.type,
      currentValue: anomaly.changePercent ?? null,
      previousValue: null,
      changePercent: anomaly.changePercent ?? null,
    })
    if (anomaly.supportingChanges && anomaly.supportingChanges.length > 0) {
      const supporting = anomaly.supportingChanges
        .map((d) => `${d.metric} ${d.changePercent! > 0 ? "+" : ""}${d.changePercent}%`)
        .join("، ")
      insights.push({
        statement: `تزامن ${anomaly.entityName} مع تغيّرات أخرى: ${supporting}.`,
        relatedMetrics: anomaly.supportingChanges.map((d) => d.metric),
        confidence: "medium",
      })
    }
  }
  return { facts, insights }
}

function chartFromCampaignRows(
  rows: CampaignRow[] | CampaignDeclineRow[],
  metric: MetricKey,
  title: string
): ChartSpec {
  const data: ChartSeriesPoint[] = rows.map((row) => ({
    label: row.name,
    value: row.metrics[metric],
  }))
  return { type: "chart", chartType: "table", title, series: [{ name: metric, data }] }
}

function chartFromChannelComparison(rows: ChannelComparisonRow[]): ChartSpec {
  return {
    type: "chart",
    chartType: "comparison",
    title: "مقارنة القنوات -- الإيرادات",
    series: [
      { name: "revenue", data: rows.map((r) => ({ label: r.channel, value: r.metrics.revenue })) },
    ],
  }
}

function insightsFromScalingSignals(signals: CampaignScalingSignal[]): Insight[] {
  return signals
    .filter((s) => s.signal !== "insufficient_data" && s.signal !== "neutral")
    .map((s) => ({
      statement: `${s.campaignName}: إشارة ${s.signal === "strong_positive" ? "إيجابية قوية" : s.signal === "positive" ? "إيجابية" : "سلبية"} (ROAS مقارنة بالحساب: ${s.roasVsAccountPercent ?? "—"}%, CPA: ${s.cpaVsAccountPercent ?? "—"}%).`,
      relatedMetrics: ["roas", "cpa"],
      confidence: s.confidence,
    }))
}

// Pure, deterministic, and the ONLY place this envelope is assembled -- every field comes
// straight from a tool's already-computed return value, nothing here calls the LLM or invents a
// number. Returns null when nothing in this turn's tool calls was analytics-shaped (e.g. a plain
// list_pos_shifts call), so a trivial answer doesn't carry a pointless empty structured object.
export function buildStructuredResponse(
  rawResults: RawToolResult[]
): StructuredAnalyticsResponse | null {
  const facts: Fact[] = []
  const insights: Insight[] = []
  const recommendations: CampaignRecommendation[] = []
  const metrics: KpiCard[] = []
  const charts: ChartSpec[] = []
  let dataPeriod: { from: string; to: string } | null = null
  let confidence: ConfidenceLevel | null = null
  let sawAnalyticsTool = false

  for (const { tool, output } of rawResults) {
    switch (tool) {
      case "get_campaign_summary": {
        sawAnalyticsTool = true
        const result = output as { metrics: Record<MetricKey, number>; confidence: ConfidenceLevel }
        metrics.push(...kpiCardsFromSnapshot(result.metrics))
        confidence = result.confidence
        break
      }
      case "compare_campaign_periods": {
        sawAnalyticsTool = true
        const comparison = output as PeriodComparisonResult
        facts.push(...factFromComparison(comparison))
        metrics.push(...kpiCardsFromComparison(comparison))
        dataPeriod = comparison.period.current
        confidence = comparison.confidence
        break
      }
      case "identify_performance_drivers": {
        sawAnalyticsTool = true
        const result = output as {
          comparison: PeriodComparisonResult
          drivers: PerformanceDriver[]
        }
        insights.push(...insightsFromDrivers(result.drivers))
        dataPeriod = dataPeriod ?? result.comparison.period.current
        confidence = confidence ?? result.comparison.confidence
        break
      }
      case "generate_campaign_recommendations": {
        sawAnalyticsTool = true
        const result = output as { recommendations: CampaignRecommendation[] }
        recommendations.push(...result.recommendations)
        break
      }
      case "get_campaign_anomalies": {
        sawAnalyticsTool = true
        const anomalies = output as AnomalyFlag[]
        const derived = factsAndInsightsFromAnomalies(anomalies)
        facts.push(...derived.facts)
        insights.push(...derived.insights)
        break
      }
      case "get_campaign_scaling_signals": {
        sawAnalyticsTool = true
        insights.push(...insightsFromScalingSignals(output as CampaignScalingSignal[]))
        break
      }
      case "get_channel_comparison": {
        sawAnalyticsTool = true
        const rows = output as ChannelComparisonRow[]
        if (rows.length > 0) charts.push(chartFromChannelComparison(rows))
        break
      }
      case "get_top_campaigns": {
        sawAnalyticsTool = true
        const rows = output as CampaignRow[]
        if (rows.length > 0)
          charts.push(chartFromCampaignRows(rows, "revenue", "أفضل الحملات -- الإيرادات"))
        break
      }
      case "get_campaign_declines": {
        sawAnalyticsTool = true
        const rows = output as CampaignDeclineRow[]
        if (rows.length > 0) charts.push(chartFromCampaignRows(rows, "roas", "الحملات المتراجعة"))
        break
      }
      default:
        break
    }
  }

  if (!sawAnalyticsTool) return null

  return {
    type: "analytics_response",
    facts,
    insights,
    recommendations,
    metrics,
    charts,
    dataPeriod,
    source: { domain: "advertising" },
    confidence,
  }
}
