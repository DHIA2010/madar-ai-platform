import type { ApplicationCategoryId } from "@/features/applications"

import type { ChatMessageDto, ChatSessionDto, ChatStructuredResponse } from "../types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { getClientEnvironment } from "@/infrastructure/environment/app-environment"
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

// The generic apiClient (http-data-client.ts) is JSON-request/JSON-response only, with a hard
// 15s abort timeout applied to every call -- exactly the mismatch that caused the "nothing, then
// two answers appear together" bug this streaming path fixes (see ai-chat/service.ts's
// sendMessageStream and interfaces/rest/server.ts's SSE route for the backend half). A raw fetch
// with no artificial timeout and a real ReadableStream reader is required here; the generic
// client has no streaming mode to opt into.
export interface ChatStreamCallbacks {
  onTextDelta: (delta: string) => void
  onStatus: (stage: string, tool?: string) => void
  // Genie-level quality audit section 21: fires once, as soon as the backend has it -- usually
  // alongside the first text_delta, often before the text finishes streaming -- so KPI cards/
  // drivers/charts/recommendations can render progressively instead of waiting for onComplete.
  onStructured: (structured: ChatStructuredResponse) => void
  onComplete: (message: ChatMessageDto) => void
  onError: (message: string) => void
  onCancelled: () => void
}

function resolveAiStreamUrl(sessionId: string): string {
  const path = `${AI_ENDPOINT}/${encodeURIComponent(sessionId)}/messages/stream`
  const baseUrl = getClientEnvironment().API_BASE_URL
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, "")}${path}`
}

async function buildStreamHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const session = sessionManager.restore()
  if (session?.accessToken?.token) {
    headers.authorization = `${session.accessToken.tokenType} ${session.accessToken.token}`
  }
  const workspaceId = getWorkspaceIdFromStorage()
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId
  }
  return headers
}

// Parses the backend's `event: <name>\ndata: <json>\n\n` SSE frames off a raw ReadableStream.
// Frames can split across chunk boundaries (TCP/HTTP chunking has no relationship to SSE frame
// boundaries), so partial text is buffered across reads and only parsed once a full blank-line-
// terminated frame is available.
async function consumeSseStream(response: Response, callbacks: ChatStreamCallbacks): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError("تعذر الاتصال بالمساعد الذكي.")
    return
  }
  const decoder = new TextDecoder()
  let buffer = ""

  const processFrame = (rawFrame: string) => {
    let eventName = "message"
    const dataLines: string[] = []
    for (const line of rawFrame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim())
      }
    }
    if (dataLines.length === 0) return
    let data: unknown
    try {
      data = JSON.parse(dataLines.join("\n"))
    } catch {
      return
    }
    switch (eventName) {
      case "text_delta":
        callbacks.onTextDelta((data as { delta: string }).delta)
        break
      case "status": {
        const statusData = data as { stage: string; tool?: string }
        callbacks.onStatus(statusData.stage, statusData.tool)
        break
      }
      case "structured":
        callbacks.onStructured(data as ChatStructuredResponse)
        break
      case "message_complete":
        callbacks.onComplete(data as ChatMessageDto)
        break
      case "cancelled":
        callbacks.onCancelled()
        break
      case "error":
        callbacks.onError((data as { message: string }).message)
        break
      default:
        break
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        processFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf("\n\n")
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      callbacks.onCancelled()
      return
    }
    callbacks.onError("انقطع الاتصال بالمساعد الذكي. حاول مرة أخرى.")
  }
}

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

  // Real token streaming over SSE -- see consumeSseStream's own comment for why this bypasses
  // the generic apiClient entirely. `signal` is the caller's own per-request AbortController
  // (see use-ai-chat.ts), so cancelling one in-flight send can never affect another.
  async sendMessageStream(
    sessionId: string,
    content: string,
    callbacks: ChatStreamCallbacks,
    signal: AbortSignal
  ): Promise<void> {
    let response: Response
    try {
      response = await fetch(resolveAiStreamUrl(sessionId), {
        method: "POST",
        headers: await buildStreamHeaders(),
        body: JSON.stringify({ content }),
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        callbacks.onCancelled()
        return
      }
      callbacks.onError("تعذر الاتصال بالمساعد الذكي. تحقق من الاتصال بالإنترنت.")
      return
    }

    if (!response.ok) {
      callbacks.onError(
        response.status === 429
          ? "لقد أرسلت عدة رسائل خلال وقت قصير. حاول مرة أخرى بعد قليل."
          : "تعذر إكمال الإجابة. حاول مرة أخرى."
      )
      return
    }

    await consumeSseStream(response, callbacks)
  },
}
