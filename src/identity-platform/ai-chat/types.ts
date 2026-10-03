import type { StructuredAnalyticsResponse } from "./response-types"

// Redeclared locally rather than imported from the frontend's
// applications-catalog.service.ts -- same reasoning as command-handlers.ts's own
// APPLICATION_SETTINGS_KEY copy: backend modules must not import frontend feature code.
export type ApplicationCategoryId = "advertising" | "ecommerce" | "pos" | "madarApps"

export type ChatMessageRole = "user" | "assistant" | "system_notice"

export interface ToolCallTrace {
  tool: string
  input: Record<string, unknown>
  outputSummary: string
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
  toolCalls: ToolCallTrace[] | null
  // Deterministic facts/insights/recommendations/KPI cards/chart specs built from this turn's
  // tool results -- see ai-chat/response-formatter.ts. null for any message with nothing
  // analytics-shaped to show (most POS/ecommerce/plain-text turns).
  structured: StructuredAnalyticsResponse | null
  model: string | null
  createdAt: string
}

export interface SendChatMessageInput {
  content: string
}
