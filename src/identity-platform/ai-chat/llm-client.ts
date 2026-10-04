import Anthropic from "@anthropic-ai/sdk"

import type { ToolCallTrace } from "./types"

const MAX_TOOL_ROUNDS = 5
const MAX_OUTPUT_TOKENS = 2048
// A tool call that hangs (a slow upstream sync provider, a stuck query) must not hold the whole
// chat turn open indefinitely -- bounds worst-case request latency and cost (section 25: "tool
// execution timeout").
const TOOL_EXECUTION_TIMEOUT_MS = 15_000

async function withTimeout(promise: Promise<string>, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("Error: tool execution timed out."), timeoutMs)
  })
  const result = await Promise.race([promise, timeout])
  clearTimeout(timer!)
  return result
}

export interface ChatTurnMessage {
  role: "user" | "assistant"
  content: string
}

export interface RunChatTurnInput {
  systemPrompt: string
  tools: Anthropic.Tool[]
  messages: ChatTurnMessage[]
  model: string
  // Executes one tool call and returns a short, model-readable summary of the result (or an
  // error string) -- owned by the caller (ai-chat/service.ts) since only it holds the actor/
  // services needed to actually run the tool.
  executeTool: (toolName: string, input: Record<string, unknown>) => Promise<string>
}

export interface RunChatTurnResult {
  text: string
  toolCalls: ToolCallTrace[]
  stopReason: "end_turn" | "max_tokens" | "refusal" | "error" | "cancelled"
}

// Emitted during a streaming turn as the model's final narration round generates (never during a
// tool-calling round -- see runChatTurnStreaming's own comment on why that separation is
// structural, not a convention the model is trusted to follow). "status" marks real backend
// stages (a tool about to run) rather than a fabricated progress animation.
export type ChatStreamEvent =
  | { type: "status"; stage: "tool_call"; tool: string }
  | { type: "text_delta"; delta: string }

export interface RunChatTurnStreamingInput extends RunChatTurnInput {
  onEvent: (event: ChatStreamEvent) => void
  // Checked between rounds and passed straight through to the Anthropic request so an aborted
  // client request tears down the in-flight model call too, not just the HTTP response to the
  // browser (see interfaces/rest/server.ts's SSE route, which aborts this on request.on("close")).
  signal?: AbortSignal
}

// What ai-chat/service.ts actually depends on -- lets tests inject a scripted stub instead of a
// real Anthropic client (see tests/ai-chat.test.ts), without needing a subclass or a real API key.
export interface AiChatLlmClientLike {
  runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult>
  runChatTurnStreaming(input: RunChatTurnStreamingInput): Promise<RunChatTurnResult>
}

// Owns the manual tool-use loop: call the model, execute any tool_use blocks it asks for, feed
// the results back as a tool_result turn, repeat until it stops asking for tools (end_turn) or a
// round cap is hit. Non-streaming by design (see the plan's "Streaming: not in v1" section) --
// this codebase has no SSE/chunked-response precedent anywhere, so v1 returns one buffered answer.
export class AiChatLlmClient implements AiChatLlmClientLike {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly defaultModel: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult> {
    const conversation: Anthropic.MessageParam[] = input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))
    const toolCalls: ToolCallTrace[] = []

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let response: Anthropic.Message
      try {
        response = await this.client.messages.create({
          model: input.model || this.defaultModel,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: input.systemPrompt,
          tools: input.tools,
          messages: conversation,
        })
      } catch (error) {
        return {
          text:
            error instanceof Error
              ? `حدث خطأ أثناء الاتصال بالمساعد الذكي: ${error.message}`
              : "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
          toolCalls,
          stopReason: "error",
        }
      }

      if (response.stop_reason === "refusal") {
        return {
          text: "لا يمكن للمساعد الإجابة على هذا السؤال.",
          toolCalls,
          stopReason: "refusal",
        }
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      )

      if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim()
        return {
          text: text || "لم يتمكن المساعد من إنشاء رد.",
          toolCalls,
          stopReason: response.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
        }
      }

      conversation.push({ role: "assistant", content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUseBlocks) {
        const resultText = await withTimeout(
          input.executeTool(block.name, (block.input as Record<string, unknown>) ?? {}),
          TOOL_EXECUTION_TIMEOUT_MS
        )
        toolCalls.push({
          tool: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
          // 6000 (not the original 2000) -- a compare_campaign_periods/generate_campaign_
          // recommendations result (deltas + evidence + recommendations) is a meaningfully
          // larger structured payload than a plain summary, and this trace is this system's
          // only durable traceability record (section 10/19/33) for what evidence actually
          // produced a given answer -- truncating it defeats that purpose.
          outputSummary: resultText.slice(0, 6000),
        })
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
        })
      }
      conversation.push({ role: "user", content: toolResults })
    }

    return {
      text: "تجاوز المساعد الحد الأقصى لعدد خطوات البحث عن البيانات. حاول إعادة صياغة سؤالك.",
      toolCalls,
      stopReason: "max_tokens",
    }
  }

  // Same manual tool-use loop as runChatTurn, but every round uses the Anthropic streaming API
  // instead of a single buffered call. Text is only ever forwarded to onEvent for a round whose
  // first content block is text (never tool_use) -- the system prompt's existing design already
  // has the model separate "call a tool" rounds from "write the final answer" round (runChatTurn
  // itself already discards any text that happened to come back alongside a tool_use block), so
  // checking just the first block is enough in practice. Known, accepted limitation: a response
  // that mixes an explanatory preamble BEFORE a tool_use block in the same round would have that
  // preamble streamed to the user before this turn's data is actually in hand -- not something
  // this system prompt currently asks the model to do, and not worth the complexity of a
  // retract-and-replay protocol for a case that doesn't occur in practice today.
  async runChatTurnStreaming(input: RunChatTurnStreamingInput): Promise<RunChatTurnResult> {
    const conversation: Anthropic.MessageParam[] = input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }))
    const toolCalls: ToolCallTrace[] = []

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (input.signal?.aborted) {
        return { text: "", toolCalls, stopReason: "cancelled" }
      }

      let finalMessage: Anthropic.Message
      let sawToolUse = false
      try {
        const stream = this.client.messages.stream(
          {
            model: input.model || this.defaultModel,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: input.systemPrompt,
            tools: input.tools,
            messages: conversation,
          },
          { signal: input.signal }
        )
        stream.on("streamEvent", (event) => {
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            sawToolUse = true
          }
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            if (!sawToolUse) {
              input.onEvent({ type: "text_delta", delta: event.delta.text })
            }
          }
        })
        finalMessage = await stream.finalMessage()
      } catch (error) {
        if (input.signal?.aborted) {
          return { text: "", toolCalls, stopReason: "cancelled" }
        }
        return {
          text:
            error instanceof Error
              ? `حدث خطأ أثناء الاتصال بالمساعد الذكي: ${error.message}`
              : "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
          toolCalls,
          stopReason: "error",
        }
      }

      if (finalMessage.stop_reason === "refusal") {
        return {
          text: "لا يمكن للمساعد الإجابة على هذا السؤال.",
          toolCalls,
          stopReason: "refusal",
        }
      }

      const toolUseBlocks = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      )

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== "tool_use") {
        const text = finalMessage.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim()
        return {
          text: text || "لم يتمكن المساعد من إنشاء رد.",
          toolCalls,
          stopReason: finalMessage.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
        }
      }

      conversation.push({ role: "assistant", content: finalMessage.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUseBlocks) {
        input.onEvent({ type: "status", stage: "tool_call", tool: block.name })
        // Known, accepted limitation: `signal` is NOT threaded into executeTool/withTimeout, so
        // a cancellation that lands while a tool is already mid-execution won't interrupt that
        // specific DB query -- it still runs to completion (or its own 15s timeout) before the
        // next per-round `signal?.aborted` check above takes effect. Doing better would mean
        // threading an AbortSignal through every tool's own query in tools.ts, a much larger,
        // riskier change than this task's actual scope (request lifecycle/streaming/isolation)
        // justifies. The part that matters most for responsiveness -- the Anthropic model call
        // itself -- IS cancelled immediately via `signal` above.
        const resultText = await withTimeout(
          input.executeTool(block.name, (block.input as Record<string, unknown>) ?? {}),
          TOOL_EXECUTION_TIMEOUT_MS
        )
        toolCalls.push({
          tool: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
          outputSummary: resultText.slice(0, 6000),
        })
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
        })
      }
      conversation.push({ role: "user", content: toolResults })
    }

    return {
      text: "تجاوز المساعد الحد الأقصى لعدد خطوات البحث عن البيانات. حاول إعادة صياغة سؤالك.",
      toolCalls,
      stopReason: "max_tokens",
    }
  }
}
