import type { CampaignRecommendation, ConfidenceLevel } from "../campaigns/analytics-types"

// Phase 2's Fact/Insight/Recommendation separation. A Fact is a directly observed number (or
// pair of numbers); an Insight is an interpretation spanning multiple facts (always hedged --
// see analytics-engine.ts's identifyPerformanceDrivers); a Recommendation is the existing
// CampaignRecommendation type, unchanged. None of these three is ever built from LLM text --
// response-formatter.ts derives all of them from the same tool-call results already computed
// deterministically this turn.
export interface Fact {
  statement: string
  metric: string
  currentValue: number | null
  previousValue: number | null
  changePercent: number | null
}

export interface Insight {
  statement: string
  relatedMetrics: string[]
  confidence: ConfidenceLevel
}

// Analysis Orchestration audit (Genie-upgrade, round 2) section 7/11/12: the driver/contribution
// analysis behind a hedged Insight.statement was already being computed deterministically
// (decomposeRevenueChange, PosSalesAnalyticsEngine's product ranking, identifyPerformanceDrivers,
// run_kpi_preview's groupByDimension+compareEnabled mode) -- it just had nowhere structured to
// go, so response-formatter.ts flattened it into prose before the frontend ever saw it. These two
// types give that same already-computed data a typed home so a frontend can render a dedicated
// driver callout or contribution table instead of re-parsing a sentence. Purely additive: Insight/
// Fact/ReportTable keep carrying the same information for whatever already consumes them.
export interface DriverEvidence {
  metric: string
  current: number
  previous: number
  changePercent: number | null
}

export interface DriverFinding {
  // Which factor this is ("orders", "aov", "roas", ...) -- the catalog/metric key, not a
  // display label, so a frontend can map it to its own formatting/icon if it wants to.
  metric: string
  role: "primary" | "secondary"
  direction: "up" | "down"
  changePercent: number | null
  // Always hedged, non-causal phrasing -- same convention as Insight.statement.
  statement: string
  evidence: DriverEvidence[]
  confidence: ConfidenceLevel
}

export interface ContributionFinding {
  label: string
  // The dimension this label came from ("product", "campaign", "platform", "payment_method",
  // ...) -- lets a frontend group/label a contribution table by what it's actually breaking
  // down, since one answer can only ever carry contributions from a single dimension today.
  dimension: string
  currentValue: number
  previousValue: number
  delta: number
  // Share of the TOTAL absolute change across every contributor in this breakdown (0-100) --
  // null when there's no change to attribute a share of.
  contributionSharePercent: number | null
}

export interface KpiCard {
  type: "kpi"
  title: string
  value: number
  previousValue: number | null
  changePercent: number | null
  trend: "up" | "down" | "flat"
  format: "currency" | "multiple" | "percent" | "number"
}

export interface ChartSeriesPoint {
  label: string
  value: number
}

export interface ChartSpec {
  type: "chart"
  chartType: "line" | "bar" | "donut" | "table" | "comparison"
  title: string
  series: Array<{ name: string; data: ChartSeriesPoint[] }>
}

// For multi-field record lists (shifts, orders, stores, invoices) that ChartSpec's single
// label/value series can't represent. Every cell value is either already display-ready (dates,
// statuses, and text are formatted server-side, in the organization's own timezone where
// relevant -- see response-formatter.ts's formatDate/formatDateTime) or a raw number the frontend
// formats consistently with how KpiCard.format is applied (currency/percent/number). null means
// "no value" uniformly across every column type; the frontend renders it as "—", never "null" or
// "N/A". This is the structural fix for the "raw pipe-delimited table" failure mode: a tool that
// returns a list of records gets a ReportTable here instead of being left for the LLM's prose to
// describe unassisted.
export type ReportColumnFormat = "text" | "datetime" | "currency" | "percent" | "status" | "number"

export interface ReportTableColumn {
  key: string
  label: string
  format: ReportColumnFormat
}

export interface ReportTable {
  title: string
  columns: ReportTableColumn[]
  rows: Array<Record<string, string | number | null>>
}

// Surfaces exactly the conditions section 14 of the Genie-upgrade audit asked never be silently
// dropped: a period that hasn't fully elapsed yet, a disconnected/stale channel, or a sample too
// small to trust. Distinct from `confidence` (a single overall level) -- a response can be "high"
// confidence yet still carry a warning worth stating plainly (e.g. "this month is incomplete").
export type DataQualityWarningType =
  | "incomplete_period"
  | "disconnected_channel"
  | "insufficient_sample"
  | "stale_sync"

export interface DataQualityWarning {
  type: DataQualityWarningType
  message: string
}

// The envelope persisted alongside a chat_messages row (see ai-chat/repository.ts's `structured`
// column) -- purely additive to the existing `content` prose string, never a replacement for it.
// A message with no analytics tool calls (e.g. a plain get_metric_definitions lookup) simply has
// `structured: null`; the frontend falls back to rendering `content` as before, so this never
// breaks existing rendering (Phase 9's explicit backward-compatibility requirement). This same
// envelope doubles as the "report" the AI-response redesign asked for -- its fields already cover
// a report's header/KPIs/sections/recommendations/source, so there is no separate parallel report
// schema; `tables` is the one field added to let record-listing tools (shifts, orders, stores)
// stop falling back to unassisted LLM prose for data they return.
export interface StructuredAnalyticsResponse {
  type: "analytics_response"
  facts: Fact[]
  insights: Insight[]
  // Additive, both default to [] when a tool's result carries no driver/contribution analysis
  // (most non-"why" questions). See DriverFinding/ContributionFinding's own comments.
  drivers: DriverFinding[]
  contributions: ContributionFinding[]
  recommendations: CampaignRecommendation[]
  metrics: KpiCard[]
  charts: ChartSpec[]
  tables: ReportTable[]
  warnings: DataQualityWarning[]
  // Deterministic, templated per tool (never LLM-generated -- see response-formatter.ts's
  // FOLLOW_UP_TEMPLATES) so they stay grounded in what this turn's tools actually returned,
  // never a generic "anything else?" prompt.
  followUpQuestions: string[]
  dataPeriod: { from: string; to: string } | null
  source: { domain: string } | null
  confidence: ConfidenceLevel | null
}

// What response-formatter.ts actually consumes -- the RAW (never re-serialized/truncated) output
// of each tool call made during a turn, captured by ai-chat/service.ts before it gets
// JSON.stringify'd for the LLM. Using the raw object (not the 6000-char-truncated outputSummary
// string already stored in chat_messages.tool_calls) means the formatter never has to re-parse
// JSON that might have been cut off mid-string.
export interface RawToolResult {
  tool: string
  output: unknown
}
