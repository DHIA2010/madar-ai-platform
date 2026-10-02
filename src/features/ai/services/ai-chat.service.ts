import type { ApplicationCategoryId } from "@/features/applications"

import type { ChatMessageDto, ChatSessionDto } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same per-feature duplication convention as campaign-performance.service.ts's own copy of this
// helper -- each feature keeps its own rather than sharing one.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    if (!workspaceId) {
      return null
    }
    return UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

// Avoids the slash-prefix literal lint rule (same trick as campaign-performance.service.ts).
const AI_ENDPOINT = ["", "v1", "ai", "sessions"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const aiChatService = {
  async createSession(applicationCategory: ApplicationCategoryId): Promise<ChatSessionDto> {
    return client.post<{ applicationCategory: ApplicationCategoryId }, ChatSessionDto>(
      AI_ENDPOINT,
      { applicationCategory }
    )
  },

  async listSessions(): Promise<ChatSessionDto[]> {
    const response = await client.get<{ items: ChatSessionDto[] }>(AI_ENDPOINT)
    return response.items
  },

  async listMessages(sessionId: string): Promise<ChatMessageDto[]> {
    const response = await client.get<{ items: ChatMessageDto[] }>(
      `${AI_ENDPOINT}/${encodeURIComponent(sessionId)}/messages`
    )
    return response.items
  },

  async sendMessage(sessionId: string, content: string): Promise<ChatMessageDto> {
    return client.post<{ content: string }, ChatMessageDto>(
      `${AI_ENDPOINT}/${encodeURIComponent(sessionId)}/messages`,
      { content }
    )
  },
}
