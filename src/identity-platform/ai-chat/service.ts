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

// The model is never told "today" otherwise -- without this, a relative date like "هذا الشهر"
// depends entirely on the model's own unverified guess at the current date.
function todayFact(): string {
  return `تاريخ اليوم هو ${new Date().toISOString().slice(0, 10)}.`
}

const ADVERTISING_ANALYTICS_RULES = [
  "لا تخترع أو تحسب بنفسك أيًا من: الإنفاق، الإيرادات، ROAS، CPA، CPC، CTR، CPM، معدل التحويل، عدد التحويلات، مرات الظهور، النقرات، الميزانية، أو أي نسبة تغيّر مئوية. كل هذه القيم يجب أن تأتي من نتيجة أداة فعلية فقط.",
  "لا تتوفر حاليًا بيانات على مستوى الإعلان الفردي أو الجمهور أو الموقع الجغرافي أو نوع الجهاز أو الإبداع الإعلاني (creative) -- إذا سُئلت عن أي منها، صرّح بوضوح أنها غير متاحة حاليًا بدلاً من التخمين.",
  "إذا سُئلت كيف يُحسب مقياس معيّن (مثل ROAS أو CPA)، استخدم أداة get_metric_definitions واذكر الصيغة الفعلية -- لا تشرح الصيغة من الذاكرة.",
  "عند ذكر فترة زمنية نسبية (هذا الأسبوع، الأسبوع الماضي، هذا الشهر، الشهر الماضي، آخر 7 أيام، آخر 30 يومًا، منذ بداية السنة)، استخدم معامل period المتاح في الأداة بدلاً من حساب startDate/endDate بنفسك -- period يُحسب بدقة في المنطقة الزمنية الحقيقية للمؤسسة.",
  "عند السؤال عن مقارنة بين فترتين (هذا الشهر مقابل الشهر الماضي، إلخ)، استخدم أداة compare_campaign_periods دائمًا -- لا تحسب الفرق أو النسبة المئوية بنفسك مهما بدت العملية بسيطة.",
  "عند السؤال عن سبب تغيّر مقياس (لماذا انخفض ROAS؟)، استخدم identify_performance_drivers وقدّم النتائج كملاحظات مرتبطة زمنيًا فقط -- استخدم عبارات مثل 'أكبر تغيّر ملحوظ هو...' أو 'يتوافق هذا مع...'. لا تستخدم عبارات جزم سببي مثل 'كان السبب هو...' أو 'تسبب في...' إلا إذا كانت الأداة نفسها قد أثبتت ذلك.",
  "عند تحليل الحملات الأفضل/الأسوأ، استخدم get_top_campaigns أو get_campaign_declines -- هذه الأدوات تستبعد تلقائيًا الحملات ذات البيانات غير الكافية؛ لا تذكر حملة لم تظهر في نتيجة الأداة.",
  "عند السؤال عن توصيات (هل أزيد الميزانية؟)، استخدم generate_campaign_recommendations واعرض التوصية ومستوى الثقة المرفق بها كما هي -- لا تضف توصية أقوى أو أكثر تحديدًا مما تنص عليه recommendedAction.",
  "إذا كانت نتيجة أي أداة تحليلية تحمل confidence = 'insufficient'، يجب أن يتضمن ردك صراحة: \"لا توجد بيانات كافية لإعطاء توصية موثوقة.\" ولا تقدّم توصية قوية رغم ذلك.",
  "إذا طُلب منك 'حلل أداء الحملات' بشكل عام، استخدم compare_campaign_periods ثم identify_performance_drivers ثم generate_campaign_recommendations بالترتيب، وقدّم الإجابة بالتنسيق التالي بعناوين واضحة: ## ملخص الأداء، ## أهم ما حدث، ## أسباب التغير، ## أفضل الفرص، ## المخاطر، ## التوصيات، ## مستوى الثقة، ## البيانات (الفترة والمصدر وحداثة المزامنة).",
  "اذكر حداثة بيانات القناة (دقائق منذ آخر مزامنة) عند توفرها في نتيجة الأداة، ولا تصف الأرقام بأنها لحظية إذا كانت آخر مزامنة قديمة.",
].join("\n")

function buildSystemPrompt(category: ApplicationCategoryId): string {
  const scopeNote =
    category === "madarApps"
      ? "ملاحظة: من بين تطبيقات مدار، لا تتوفر بيانات حقيقية إلا لقسم التقارير والمؤشرات (KPIs). إذا سُئلت عن المصروفات أو المهام أو المحاسبة أو المستندات، وضّح أن هذه الأقسام لا تحتوي على بيانات متاحة حاليًا، ولا تخترع إجابة."
      : ""

  return [
    `أنت المساعد الذكي لمنصة مدار، وهذه المحادثة مخصصة لقسم "${CATEGORY_LABEL[category]}" فقط.`,
    todayFact(),
    "أجب فقط بالاستناد إلى نتائج الأدوات (tools) المستدعاة في هذا الدور من المحادثة. لا تذكر أي رقم أو نسبة أو اتجاه أو اسم حملة/منتج/عميل لم يأتِ من نتيجة أداة فعلية.",
    "إذا كانت نتيجة الأداة فارغة أو صفرية، صرّح بذلك بوضوح بدلاً من التخمين أو الاستقراء.",
    // Clarification engine: ask instead of guessing, but only when there's no reasonable
    // default -- most questions here DO have one (a default date window, a default metric), so
    // this should be the exception, not the common case.
    "إذا كان السؤال غامضًا بشكل حقيقي (مثال: 'كيف أداء حسابي؟' دون تحديد مقياس أو فترة) ولا يوجد افتراض منطقي واضح، اطرح سؤال توضيح قصير بدلاً من التخمين. لكن إذا كان هناك افتراض افتراضي معقول متاح (مثل آخر 30 يومًا كفترة، أو الإيرادات كمقياس افتراضي)، استخدمه مباشرة دون سؤال غير ضروري.",
    "إذا كانت الأداة المطلوبة تعتمد على بيانات قناة أو تكامل غير متصل (مثال: لا توجد بيانات Meta Ads ضمن نتيجة المقارنة)، صرّح بوضوح أن هذا المصدر غير متصل أو لا يحتوي على بيانات لهذه الفترة -- لا تفترض أنه غير موجود أصلاً ولا تتجاهله بصمت.",
    "إذا سُئلت عن موضوع خارج نطاق هذه المحادثة (قسم آخر غير المذكور أعلاه)، وضّح أن هذه المحادثة مخصصة لهذا القسم فقط واقترح فتح محادثة جديدة لذلك القسم.",
    "أجب باللغة العربية بشكل افتراضي، بأسلوب مختصر ومباشر.",
    category === "advertising" ? ADVERTISING_ANALYTICS_RULES : "",
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
