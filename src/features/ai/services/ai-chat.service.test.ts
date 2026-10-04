// Covers the frontend half of the AI chat streaming fix: real SSE frame parsing off a raw
// fetch ReadableStream (the generic apiClient has no streaming mode and a hard 15s abort
// timeout -- see ai-chat.service.ts's own comment on why sendMessageStream bypasses it
// entirely). These tests prove the parser handles frames split across chunk boundaries (TCP/
// HTTP chunking has no relationship to SSE frame boundaries) and that cancellation/errors route
// through the expected callback, never an unhandled rejection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { aiChatService, type ChatStreamCallbacks } from "./ai-chat.service"

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index >= frames.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(frames[index]))
      index += 1
    },
  })
}

function collectingCallbacks(): ChatStreamCallbacks & {
  deltas: string[]
  statuses: Array<{ stage: string; tool?: string }>
  structured: unknown[]
  completed: unknown[]
  errors: string[]
  cancelledCount: number
} {
  const deltas: string[] = []
  const statuses: Array<{ stage: string; tool?: string }> = []
  const structured: unknown[] = []
  const completed: unknown[] = []
  const errors: string[] = []
  let cancelledCount = 0
  return {
    deltas,
    statuses,
    structured,
    completed,
    errors,
    get cancelledCount() {
      return cancelledCount
    },
    onTextDelta: (delta) => deltas.push(delta),
    onStatus: (stage, tool) => statuses.push({ stage, tool }),
    onStructured: (data) => structured.push(data),
    onComplete: (message) => completed.push(message),
    onError: (message) => errors.push(message),
    onCancelled: () => {
      cancelledCount += 1
    },
  }
}

describe("aiChatService.sendMessageStream", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("parses text_delta, status, and message_complete frames delivered as separate chunks", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          sseBody([
            'event: status\ndata: {"stage":"tool_call","tool":"get_pos_invoices_summary"}\n\n',
            'event: text_delta\ndata: {"delta":"المبيعات "}\n\n',
            'event: text_delta\ndata: {"delta":"انخفضت."}\n\n',
            'event: message_complete\ndata: {"id":"m1","content":"المبيعات انخفضت."}\n\n',
          ]),
          { status: 200 }
        )
      )

    const callbacks = collectingCallbacks()
    await aiChatService.sendMessageStream(
      "session-1",
      "لماذا انخفضت المبيعات؟",
      callbacks,
      new AbortController().signal
    )

    expect(callbacks.statuses).toEqual([{ stage: "tool_call", tool: "get_pos_invoices_summary" }])
    expect(callbacks.deltas).toEqual(["المبيعات ", "انخفضت."])
    expect(callbacks.completed).toEqual([{ id: "m1", content: "المبيعات انخفضت." }])
    expect(callbacks.errors).toEqual([])
  })

  // Genie-level quality audit section 21: proves the frontend can actually consume the
  // progressive-structured-block event (the backend half of this is ai-chat/service.ts's
  // sendMessageStream emitting "structured" the moment the first text_delta arrives, well before
  // message_complete) -- and that it arrives BEFORE message_complete, not only alongside it.
  it("parses a structured frame and delivers it via onStructured before message_complete", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          sseBody([
            'event: text_delta\ndata: {"delta":"الإيرادات انخفضت."}\n\n',
            'event: structured\ndata: {"type":"analytics_response","facts":[],"insights":[],"drivers":[],"contributions":[],"recommendations":[],"metrics":[{"type":"kpi","title":"الإيرادات","value":100,"previousValue":200,"changePercent":-50,"trend":"down","format":"currency"}],"charts":[],"tables":[],"warnings":[],"followUpQuestions":[],"dataPeriod":null,"source":null,"confidence":null}\n\n',
            'event: message_complete\ndata: {"id":"m1","content":"الإيرادات انخفضت."}\n\n',
          ]),
          { status: 200 }
        )
      )

    const order: string[] = []
    const callbacks = collectingCallbacks()
    const originalOnStructured = callbacks.onStructured
    const originalOnComplete = callbacks.onComplete
    callbacks.onStructured = (data) => {
      order.push("structured")
      originalOnStructured(data)
    }
    callbacks.onComplete = (message) => {
      order.push("message_complete")
      originalOnComplete(message)
    }

    await aiChatService.sendMessageStream(
      "session-1",
      "لماذا انخفضت الإيرادات؟",
      callbacks,
      new AbortController().signal
    )

    expect(order).toEqual(["structured", "message_complete"])
    expect(callbacks.structured).toHaveLength(1)
    expect((callbacks.structured[0] as { metrics: unknown[] }).metrics).toHaveLength(1)
  })

  // The actual bug this guards against: a frame's `data:` line split mid-JSON across two
  // separate stream chunks would silently corrupt or drop the event if the parser didn't
  // buffer and wait for the full blank-line-terminated frame before parsing.
  it("reassembles a single SSE frame split across multiple chunk boundaries", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(sseBody(['event: text_delta\ndata: {"delta":', '"جزء من النص"}', "\n\n"]), {
        status: 200,
      })
    )

    const callbacks = collectingCallbacks()
    await aiChatService.sendMessageStream(
      "session-1",
      "سؤال",
      callbacks,
      new AbortController().signal
    )

    expect(callbacks.deltas).toEqual(["جزء من النص"])
  })

  it("surfaces a non-OK HTTP response via onError, never as a thrown/unhandled rejection", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))

    const callbacks = collectingCallbacks()
    await expect(
      aiChatService.sendMessageStream("session-1", "سؤال", callbacks, new AbortController().signal)
    ).resolves.toBeUndefined()

    expect(callbacks.errors).toHaveLength(1)
    expect(callbacks.completed).toEqual([])
  })

  it("maps a 429 response to the rate-limit message specifically", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))

    const callbacks = collectingCallbacks()
    await aiChatService.sendMessageStream(
      "session-1",
      "سؤال",
      callbacks,
      new AbortController().signal
    )

    expect(callbacks.errors[0]).toContain("عدة رسائل")
  })

  it("routes a client-side abort to onCancelled, not onError", async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const error = new DOMException("Aborted", "AbortError")
      return Promise.reject(error)
    })

    const callbacks = collectingCallbacks()
    await aiChatService.sendMessageStream(
      "session-1",
      "سؤال",
      callbacks,
      new AbortController().signal
    )

    expect(callbacks.cancelledCount).toBe(1)
    expect(callbacks.errors).toEqual([])
  })

  it("parses a backend-sent cancelled event the same way as a local abort", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(sseBody(["event: cancelled\ndata: {}\n\n"]), { status: 200 }))

    const callbacks = collectingCallbacks()
    await aiChatService.sendMessageStream(
      "session-1",
      "سؤال",
      callbacks,
      new AbortController().signal
    )

    expect(callbacks.cancelledCount).toBe(1)
  })
})
