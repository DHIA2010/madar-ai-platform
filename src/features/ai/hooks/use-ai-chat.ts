"use client"

import { useCallback, useMemo, useState } from "react"

import { APPLICATION_SETTINGS_KEY, type ApplicationCategoryId } from "@/features/applications"
import { useWorkspace } from "@/features/workspace"

import { aiChatService } from "../services"
import type { ChatMessageDto, ChatSessionDto } from "../types"

const CATEGORY_ORDER: ApplicationCategoryId[] = ["advertising", "ecommerce", "pos", "madarApps"]

// Mirrors use-applications-catalog.ts's own statusById derivation -- reuses the org settings
// already loaded app-wide via useWorkspace() instead of fetching them again, so "which
// categories can I start a new AI chat for" always agrees with the applications marketplace's
// own activation state.
export function useAiChat() {
  const { currentOrganization } = useWorkspace()

  const [sessions, setSessions] = useState<ChatSessionDto[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageDto[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isSending, setIsSending] = useState(false)

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
    setMessages(items)
  }, [])

  const createSession = useCallback(async (applicationCategory: ApplicationCategoryId) => {
    const session = await aiChatService.createSession(applicationCategory)
    setSessions((previous) => [session, ...previous])
    setActiveSessionId(session.id)
    setMessages([])
    return session
  }, [])

  // Accepts the category to lazily open a session in, so the dashboard's first send doesn't
  // need to separately await createSession() then re-read state before sending (React state
  // updates aren't visible synchronously within the same call).
  const sendMessage = useCallback(
    async (content: string, categoryIfNoSession?: ApplicationCategoryId) => {
      if (!content.trim()) return
      let sessionId = activeSessionId
      if (!sessionId) {
        if (!categoryIfNoSession) return
        const session = await createSession(categoryIfNoSession)
        sessionId = session.id
      }

      setIsSending(true)
      const pendingUserMessage: ChatMessageDto = {
        id: `pending-${Date.now()}`,
        sessionId,
        role: "user",
        content,
        toolCalls: null,
        model: null,
        createdAt: new Date().toISOString(),
      }
      setMessages((previous) => [...previous, pendingUserMessage])
      try {
        const assistantMessage = await aiChatService.sendMessage(sessionId, content)
        const items = await aiChatService.listMessages(sessionId)
        setMessages(items)
        return assistantMessage
      } finally {
        setIsSending(false)
      }
    },
    [activeSessionId, createSession]
  )

  return {
    sessions,
    activeSessionId,
    messages,
    availableCategories,
    isLoadingSessions,
    isSending,
    refreshSessions,
    openSession,
    createSession,
    sendMessage,
  }
}
