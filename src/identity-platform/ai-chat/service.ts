import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { AiChatLlmClientLike } from "./llm-client"
import { isApplicationEnabled, requireApplicationEnabled } from "./guards"
import { AiChatRepository } from "./repository"
import { buildToolsForCategory, dispatchToolCall, type AiChatToolServices } from "./tools"
import type { ApplicationCategoryId, ChatMessageDto, ChatSessionDto } from "./types"

const CATEGORY_LABEL: Record<ApplicationCategoryId, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار (التقارير)",
}

function buildSystemPrompt(category: ApplicationCategoryId): string {
  const scopeNote =
    category === "madarApps"
      ? "ملاحظة: من بين تطبيقات مدار، لا تتوفر بيانات حقيقية إلا لقسم التقارير والمؤشرات (KPIs). إذا سُئلت عن المصروفات أو المهام أو المحاسبة أو المستندات، وضّح أن هذه الأقسام لا تحتوي على بيانات متاحة حاليًا، ولا تخترع إجابة."
      : ""

  return [
    `أنت المساعد الذكي لمنصة مدار، وهذه المحادثة مخصصة لقسم "${CATEGORY_LABEL[category]}" فقط.`,
    "أجب فقط بالاستناد إلى نتائج الأدوات (tools) المستدعاة في هذا الدور من المحادثة. لا تذكر أي رقم أو نسبة أو اتجاه لم يأتِ من نتيجة أداة فعلية.",
    "إذا كانت نتيجة الأداة فارغة أو صفرية، صرّح بذلك بوضوح بدلاً من التخمين أو الاستقراء.",
    "إذا سُئلت عن موضوع خارج نطاق هذه المحادثة (قسم آخر غير المذكور أعلاه)، وضّح أن هذه المحادثة مخصصة لهذا القسم فقط واقترح فتح محادثة جديدة لذلك القسم.",
    "أجب باللغة العربية بشكل افتراضي، بأسلوب مختصر ومباشر.",
    scopeNote,
  ]
    .filter(Boolean)
    .join("\n")
}

// Matches the route's own `actor.modulePermissions.includes("ai:view")` check in server.ts --
// kept here too, not just there, as defense in depth for any other caller of this service
// (same reasoning as reports/service.ts's assertActorCanManageReports).
function assertActorCanUseAiChat(actor: AuthenticatedActor) {
  if (!actor.modulePermissions.includes("ai:view")) {
    throw ERRORS.forbidden()
  }
}

export class AiChatService {
  private readonly repository: AiChatRepository

  constructor(
    private readonly db: PostgresDatabase,
    private readonly toolServices: AiChatToolServices,
    private readonly llmClient: AiChatLlmClientLike,
    private readonly model: string
  ) {
    this.repository = new AiChatRepository(db)
  }

  async createSession(
    actor: AuthenticatedActor,
    applicationCategory: ApplicationCategoryId
  ): Promise<ChatSessionDto> {
    assertActorCanUseAiChat(actor)
    await requireApplicationEnabled(this.db, actor.organizationId, applicationCategory)
    return this.repository.createSession({
      organizationId: actor.organizationId,
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      applicationCategory,
    })
  }

  async listSessions(actor: AuthenticatedActor): Promise<ChatSessionDto[]> {
    assertActorCanUseAiChat(actor)
    return this.repository.listSessionsByUser(actor.organizationId, actor.userId)
  }

  private async loadOwnedSession(
    actor: AuthenticatedActor,
    sessionId: string
  ): Promise<ChatSessionDto> {
    const session = await this.repository.findSessionById(sessionId)
    if (
      !session ||
      session.organizationId !== actor.organizationId ||
      session.userId !== actor.userId
    ) {
      throw ERRORS.notFound("Chat session")
    }
    return session
  }

  async listMessages(actor: AuthenticatedActor, sessionId: string): Promise<ChatMessageDto[]> {
    assertActorCanUseAiChat(actor)
    await this.loadOwnedSession(actor, sessionId)
    return this.repository.listMessages(sessionId)
  }

  async sendMessage(
    actor: AuthenticatedActor,
    sessionId: string,
    content: string
  ): Promise<ChatMessageDto> {
    assertActorCanUseAiChat(actor)
    const session = await this.loadOwnedSession(actor, sessionId)

    // Re-checked on every send, not just at session creation -- an org can deactivate an
    // application mid-conversation, and a stale session must not keep answering silently.
    const stillEnabled = await isApplicationEnabled(
      this.db,
      actor.organizationId,
      session.applicationCategory
    )
    if (!stillEnabled) {
      await this.repository.appendMessage({ sessionId, role: "user", content })
      return this.repository.appendMessage({
        sessionId,
        role: "system_notice",
        content: `تطبيق "${CATEGORY_LABEL[session.applicationCategory]}" غير مفعّل حاليًا لمؤسستك، لذلك لا يمكن متابعة هذه المحادثة.`,
      })
    }

    await this.repository.appendMessage({ sessionId, role: "user", content })

    if (!session.title) {
      await this.repository.updateSessionTitle(sessionId, content.slice(0, 80))
    }

    const history = await this.repository.listMessages(sessionId, 20)
    const tools = buildToolsForCategory(session.applicationCategory)

    const result = await this.llmClient.runChatTurn({
      systemPrompt: buildSystemPrompt(session.applicationCategory),
      tools,
      model: this.model,
      messages: history
        .filter((message) => message.role !== "system_notice")
        .map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
        })),
      executeTool: async (toolName, toolInput) => {
        const { result: toolResult, error } = await dispatchToolCall(
          session.applicationCategory,
          toolName,
          toolInput,
          actor,
          this.toolServices
        )
        if (error) {
          return `Error: ${error}`
        }
        return JSON.stringify(toolResult ?? {})
      },
    })

    await this.repository.touchSession(sessionId)

    return this.repository.appendMessage({
      sessionId,
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : null,
      model: this.model,
    })
  }
}
