import type { ApplicationCategoryId } from "@/features/applications"

export type ChatMessageRole = "user" | "assistant" | "system_notice"

export interface ChatToolCallTrace {
  tool: string
  input: Record<string, unknown>
  outputSummary: string
}

export type ChatConfidenceLevel = "high" | "medium" | "low" | "insufficient"

// Mirrors ai-chat/response-types.ts's KpiCard -- a deterministic value already computed
// server-side, never something the frontend formats or invents on its own.
export interface ChatKpiCard {
  type: "kpi"
  title: string
  value: number
  previousValue: number | null
  changePercent: number | null
  trend: "up" | "down" | "flat"
  format: "currency" | "multiple" | "percent" | "number"
}

// Mirrors ai-chat/response-types.ts's Fact/Insight -- again, always a direct readout of a tool's
// own already-computed output, never text the frontend has to interpret or format itself.
export interface ChatFact {
  statement: string
  metric: string
  currentValue: number | null
  previousValue: number | null
  changePercent: number | null
}

export interface ChatInsight {
  statement: string
  relatedMetrics: string[]
  confidence: ChatConfidenceLevel
}

// Mirrors ai-chat/response-types.ts's DriverEvidence/DriverFinding/ContributionFinding -- the
// same driver/contribution analysis that used to only exist flattened into an Insight.statement
// or a generic ReportTable, now typed so the dashboard can render a dedicated driver callout /
// contribution breakdown instead of treating it as plain prose or an undifferentiated table.
export interface ChatDriverEvidence {
  metric: string
  current: number
  previous: number
  changePercent: number | null
}

export interface ChatDriverFinding {
  metric: string
  role: "primary" | "secondary"
  direction: "up" | "down"
  changePercent: number | null
  statement: string
  evidence: ChatDriverEvidence[]
  confidence: ChatConfidenceLevel
}

export interface ChatContributionFinding {
  label: string
  dimension: string
  currentValue: number
  previousValue: number
  delta: number
  contributionSharePercent: number | null
}

// Mirrors ai-chat/campaigns/analytics-types.ts's CampaignRecommendation -- pre-existing,
// evidence-gated recommendation data the backend already computes and transmits
// (generate_campaign_recommendations), but that this type never declared, so it was silently
// unreachable from the dashboard despite being sent on the wire. Section 10/11 of the Genie-
// upgrade audit explicitly wants a visible "💡 Recommendation" section -- this is what closes it.
export type ChatRecommendationType =
  | "budget_review"
  | "budget_increase_consideration"
  | "investigate_decline"
  | "investigate_inefficiency"
  | "review_targeting"
  | "review_creative"
  | "no_action"

export interface ChatAnalyticalEvidence {
  metric: string
  currentValue: number | null
  previousValue: number | null
  changePercent: number | null
}

export interface ChatRecommendation {
  type: ChatRecommendationType
  priority: "high" | "medium" | "low"
  entityName: string
  reason: string
  evidence: ChatAnalyticalEvidence[]
  confidence: ChatConfidenceLevel
  recommendedAction: string
}

export interface ChatChartPoint {
  label: string
  value: number
}

export interface ChatChartSpec {
  type: "chart"
  chartType: "line" | "bar" | "donut" | "table" | "comparison"
  title: string
  series: Array<{ name: string; data: ChatChartPoint[] }>
}

// Mirrors ai-chat/response-types.ts's ReportTable -- a multi-column record list (shifts, orders,
// stores) that ChartSpec's single label/value series can't represent. Datetime/status/text cells
// already carry their final display string, formatted server-side in the organization's own
// timezone; currency/percent/number cells carry a raw value the frontend formats the same way it
// already formats a KPI card. null means "no value" for any column, rendered as "—".
export type ChatReportColumnFormat =
  | "text"
  | "datetime"
  | "currency"
  | "percent"
  | "status"
  | "number"

export interface ChatReportTableColumn {
  key: string
  label: string
  format: ChatReportColumnFormat
}

export interface ChatReportTable {
  title: string
  columns: ChatReportTableColumn[]
  rows: Array<Record<string, string | number | null>>
}

// Mirrors ai-chat/response-types.ts's DataQualityWarning -- surfaced distinctly from `confidence`
// so a "high confidence" answer can still carry an honest caveat (an incomplete period, a stale
// channel) instead of it being silently dropped.
export type ChatDataQualityWarningType =
  | "incomplete_period"
  | "disconnected_channel"
  | "insufficient_sample"
  | "stale_sync"

export interface ChatDataQualityWarning {
  type: ChatDataQualityWarningType
  message: string
}

export interface ChatStructuredResponse {
  type: "analytics_response"
  facts: ChatFact[]
  insights: ChatInsight[]
  drivers: ChatDriverFinding[]
  contributions: ChatContributionFinding[]
  recommendations: ChatRecommendation[]
  metrics: ChatKpiCard[]
  charts: ChatChartSpec[]
  tables: ChatReportTable[]
  warnings: ChatDataQualityWarning[]
  followUpQuestions: string[]
  dataPeriod: { from: string; to: string } | null
  confidence: ChatConfidenceLevel | null
}

export interface ChatSessionDto {
  id: string
  organizationId: string
  workspaceId: string | null
  userId: string
  applicationCategory: ApplicationCategoryId
  title: string | null
  status: "active" | "archived"
  createdAt: string
  updatedAt: string
}

export interface ChatMessageDto {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  toolCalls: ChatToolCallTrace[] | null
  structured: ChatStructuredResponse | null
  model: string | null
  createdAt: string
}

// Per-message lifecycle, not a single conversation-wide boolean -- each message (the request
// that produced it) owns its own state so one slow/failed/cancelled turn never freezes or
// misrepresents any other message's status. A message loaded from the backend (listMessages) is
// always implicitly "completed": the DB only ever stores a message once a turn finished, so this
// field is optional and only ever set for a message created client-side during an active send.
export type ChatMessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled"

export interface ChatStreamingMessageDto extends ChatMessageDto {
  status: ChatMessageStatus
  // A transient, user-facing stage label ("جاري تحليل البيانات...") shown only while status is
  // "pending"/"streaming" and no text has arrived yet -- cleared once the first text_delta lands.
  statusLabel?: string
}
