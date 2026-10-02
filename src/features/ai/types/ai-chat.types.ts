import type { ApplicationCategoryId } from "@/features/applications"

export type ChatMessageRole = "user" | "assistant" | "system_notice"

export interface ChatToolCallTrace {
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
  toolCalls: ChatToolCallTrace[] | null
  model: string | null
  createdAt: string
}
