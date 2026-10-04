"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { APPLICATION_SETTINGS_KEY, type ApplicationCategoryId } from "@/features/applications"
import { useWorkspace } from "@/features/workspace"

import { aiChatService } from "../services"
import type { ChatMessageDto, ChatSessionDto, ChatStreamingMessageDto } from "../types"

const CATEGORY_ORDER: ApplicationCategoryId[] = ["advertising", "ecommerce", "pos", "madarApps"]

function toStreamingMessage(message: ChatMessageDto): ChatStreamingMessageDto {
  return { ...message, status: "completed" }
}

// Mirrors use-applications-catalog.ts's own statusById derivation -- reuses the org settings
// already loaded app-wide via useWorkspace() instead of fetching them again, so "which
// categories can I start a new AI chat for" always agrees with the applications marketplace's
// own activation state.
//
// Request lifecycle (see ai-chat/service.ts's sendMessageStream and interfaces/rest/server.ts's
// SSE route for the backend half): every send gets its own AbortController, keyed by sessionId
// in activeRequestsRef -- never a single conversation-wide "isSending" boolean. This is what
// actually fixes the "nothing, then two answers appear together" bug: previously, a slow send
// got silently aborted by the generic HTTP client's 15s timeout with no catch block, leaving the
// backend to finish and persist a reply nobody was listening for, which only surfaced once the
// NEXT message's full-history refetch happened to include it. Streaming means the user sees the
// answer arriving well before any timeout could matter, and each session's own AbortController
// means one request's failure/cancellation can never bleed into another's state.
export function useAiChat() {
  const { currentOrganization } = useWorkspace()

  const [sessions, setSessions] = useState<ChatSessionDto[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatStreamingMessageDto[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  // Which sessions currently have an in-flight send -- a Set, not one global boolean, so this
  // hook could serve multiple concurrently-streaming sessions correctly if the UI ever grows a
  // session switcher (today's dashboard only ever has one active session, but the state here
  // doesn't assume that).
  const [streamingSessionIds, setStreamingSessionIds] = useState<ReadonlySet<string>>(new Set())
  const activeRequestsRef = useRef<Map<string, AbortController>>(new Map())

  const availableCategories = useMemo<ApplicationCategoryId[]>(() => {
    const settings = currentOrganization?.settings
    if (!settings) return []
    return CATEGORY_ORDER.filter((category) => settings[APPLICATION_SETTINGS_KEY[category]])
  }, [currentOrganization?.settings])

  const refreshSessions = useCallback(async () => {
    setIsLoadingSessions(true)
    try {
      const items = await aiChatService.listSessions()
      setSessions(items)
    } finally {
      setIsLoadingSessions(false)
    }
  }, [])

  const openSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId)
    const items = await aiChatService.listMessages(sessionId)
    setMessages(items.map(toStreamingMessage))
  }, [])

  const createSession = useCallback(async (applicationCategory: ApplicationCategoryId) => {
    const session = await aiChatService.createSession(applicationCategory)
    setSessions((previous) => [session, ...previous])
    setActiveSessionId(session.id)
    setMessages([])
    return session
  }, [])

  const updateMessage = useCallback(
    (id: string, updater: (message: ChatStreamingMessageDto) => ChatStreamingMessageDto) => {
      setMessages((previous) =>
        previous.map((message) => (message.id === id ? updater(message) : message))
      )
    },
    []
  )

  const setSessionStreaming = useCallback((sessionId: string, streaming: boolean) => {
    setStreamingSessionIds((previous) => {
      const next = new Set(previous)
      if (streaming) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }, [])

  // Accepts the category to lazily open a session in, so the dashboard's first send doesn't
  // need to separately await createSession() then re-read state before sending (React state
  // updates aren't visible synchronously within the same call).
  const sendMessage = useCallback(
    async (content: string, categoryIfNoSession?: ApplicationCategoryId) => {
      const trimmed = content.trim()
      if (!trimmed) return

      let sessionId = activeSessionId
      if (!sessionId) {
        if (!categoryIfNoSession) return
        const session = await createSession(categoryIfNoSession)
        sessionId = session.id
      }

      // Explicit single-flight per session (never a silent queue): the product's existing
      // decision was "don't let the user send a second message while one is generating" (the
      // dashboard already disables the input via isSending) -- kept as-is, but enforced here
      // too so a stale closure or a double-click can't bypass the UI-only disabled attribute and
      // fire two overlapping requests into the same session.
      if (activeRequestsRef.current.has(sessionId)) {
        return
      }

      const requestId = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const userMessageId = `pending-user-${requestId}`
      const assistantMessageId = `pending-assistant-${requestId}`

      setMessages((previous) => [
        ...previous,
        {
          id: userMessageId,
          sessionId,
          role: "user",
          content: trimmed,
          toolCalls: null,
          structured: null,
          model: null,
          createdAt: nowIso,
          status: "completed",
        },
        {
          id: assistantMessageId,
          sessionId,
          role: "assistant",
          content: "",
          toolCalls: null,
          structured: null,
          model: null,
          createdAt: nowIso,
          status: "pending",
          statusLabel: "جاري التفكير...",
        },
      ])

      const controller = new AbortController()
      activeRequestsRef.current.set(sessionId, controller)
      setSessionStreaming(sessionId, true)

      let receivedAnyText = false
      try {
        await aiChatService.sendMessageStream(
          sessionId,
          trimmed,
          {
            onStatus: (stage, tool) => {
              if (receivedAnyText) return
              updateMessage(assistantMessageId, (message) => ({
                ...message,
                status: "streaming",
                statusLabel: tool ? `جاري تنفيذ: ${tool}` : "جاري تحليل البيانات...",
              }))
            },
            onTextDelta: (delta) => {
              receivedAnyText = true
              updateMessage(assistantMessageId, (message) => ({
                ...message,
                status: "streaming",
                statusLabel: undefined,
                content: message.content + delta,
              }))
            },
            // Genie-level quality audit section 21: arrives once, typically alongside the first
            // text_delta -- lets KPI cards/drivers/charts/recommendations render progressively
            // instead of only appearing once the whole answer has finished streaming.
            onStructured: (structured) => {
              updateMessage(assistantMessageId, (message) => ({ ...message, structured }))
            },
            onComplete: (finalMessage) => {
              updateMessage(assistantMessageId, () => ({ ...finalMessage, status: "completed" }))
            },
            onError: (errorMessage) => {
              updateMessage(assistantMessageId, (message) => ({
                ...message,
                status: "failed",
                statusLabel: undefined,
                content: message.content || errorMessage,
              }))
            },
            onCancelled: () => {
              updateMessage(assistantMessageId, (message) => ({
                ...message,
                status: "cancelled",
                statusLabel: undefined,
              }))
            },
          },
          controller.signal
        )
      } finally {
        activeRequestsRef.current.delete(sessionId)
        setSessionStreaming(sessionId, false)
      }
    },
    [activeSessionId, createSession, setSessionStreaming, updateMessage]
  )

  // Part 7: stops the fetch (and, through it, the backend's in-flight model call -- see the SSE
  // route's request.on("close") handler) without touching any other session's state.
  const cancelMessage = useCallback((sessionId: string) => {
    activeRequestsRef.current.get(sessionId)?.abort()
  }, [])

  const isSessionStreaming = useCallback(
    (sessionId: string) => streamingSessionIds.has(sessionId),
    [streamingSessionIds]
  )

  return {
    sessions,
    activeSessionId,
    messages,
    availableCategories,
    isLoadingSessions,
    // Backward-compatible derived flag for the current dashboard (one active session at a
    // time) -- new UI should prefer isSessionStreaming(sessionId) for per-session granularity.
    isSending: activeSessionId ? streamingSessionIds.has(activeSessionId) : false,
    isSessionStreaming,
    refreshSessions,
    openSession,
    createSession,
    sendMessage,
    cancelMessage,
  }
}
