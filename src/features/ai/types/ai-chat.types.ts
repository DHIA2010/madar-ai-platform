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

export interface ChatStructuredResponse {
  type: "analytics_response"
  facts: ChatFact[]
  insights: ChatInsight[]
  metrics: ChatKpiCard[]
  charts: ChatChartSpec[]
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
