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
  stopReason: "end_turn" | "max_tokens" | "refusal" | "error"
}

// What ai-chat/service.ts actually depends on -- lets tests inject a scripted stub instead of a
// real Anthropic client (see tests/ai-chat.test.ts), without needing a subclass or a real API key.
export interface AiChatLlmClientLike {
  runChatTurn(input: RunChatTurnInput): Promise<RunChatTurnResult>
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
}
