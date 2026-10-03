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

export interface ChatStructuredResponse {
  type: "analytics_response"
  metrics: ChatKpiCard[]
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
