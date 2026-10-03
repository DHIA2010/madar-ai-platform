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
