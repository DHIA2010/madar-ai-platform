import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import { getOrganizationTimezone } from "../shared/date-range-resolver"

import type { AiChatLlmClientLike, ChatStreamEvent } from "./llm-client"
import { isApplicationEnabled, requireApplicationEnabled } from "./guards"
import { AiChatRepository } from "./repository"
import { buildStructuredResponse } from "./response-formatter"
import type { RawToolResult } from "./response-types"
import { buildToolsForCategory, dispatchToolCall, type AiChatToolServices } from "./tools"
import type { ApplicationCategoryId, ChatMessageDto, ChatSessionDto, ToolCallTrace } from "./types"

// Signals a cancelled turn distinctly from a real failure -- the caller (the SSE route) must
// emit a "cancelled" status rather than "error", and critically must NOT treat this as "retry
// with the same request," since the backend has already stopped. No assistant message is ever
// persisted for a cancelled turn (see sendMessageStream's own comment on why) -- the user's own
// question, already appended before the model call starts, is the only row that survives.
export class ChatTurnCancelledError extends Error {
  constructor() {
    super("AI chat turn was cancelled before completion.")
    this.name = "ChatTurnCancelledError"
  }
}

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

// Fixes the reported "raw pipe-delimited table" failure mode at its actual source: the LLM was
// never told it shouldn't hand-draw tables, so when a tool returned a list of records (shifts,
// orders, products) with nothing else to go on, it fell back to ASCII/pipe formatting. The
// structural fix is response-formatter.ts's ReportTable (rendered separately by the frontend);
// this prompt rule is the second, necessary layer -- it tells the model that detail layer already
// exists, so its own prose should stay a short summary instead of re-describing every record.
const PRESENTATION_RULES = [
  'لا تستخدم أبدًا رمز الخط العمودي (|) أو جداول بتنسيق ASCII أو عرض بيانات بشكل "حقل: قيمة | حقل: قيمة" في ردك. لا تحاول رسم جدول بنفسك بأي شكل نصي.',
  "عندما تُرجع إحدى الأدوات قائمة سجلات متعددة (ورديات، طلبات، فواتير، منتجات، متاجر)، لا تُعدّد كل سجل وكل حقل في النص -- هذه التفاصيل تُعرض تلقائيًا في جدول منفصل ضمن واجهة المحادثة. اكتفِ في ردك بفقرة موجزة جدًا (جملة أو جملتين): العدد الإجمالي، والحالة العامة، وأي ملاحظة مهمة واحدة إن وجدت.",
  'لا تعرض أبدًا تاريخًا أو وقتًا بصيغته الخام مثل 2026-09-22T20:32:00Z -- التنسيق المقروء يُعرض تلقائيًا في الجدول أو البطاقة؛ إذا احتجت لذكر تاريخ في النص، اذكره بصياغة عربية طبيعية (مثل "22 سبتمبر") لا كسلسلة ISO.',
  'لا تكتب أبدًا null أو undefined أو N/A أو [] في ردك. إذا كانت قيمة غير متوفرة، صرّح بذلك بجملة طبيعية (مثل "غير متوفر حاليًا") أو اترك الأمر لعرض الجدول الذي يستخدم شرطة (—) تلقائيًا.',
].join("\n")

// Fixes the reported "لا توجد خيار 'كل الوقت' ضمن الفترات المتاحة" failure: the model had no
// period value to express "all time" with, so it listed the available periods back at the user
// instead of answering. The structural fix is RELATIVE_PERIODS' new "all_time" value (resolved
// deterministically against each domain's own real earliest/latest data -- never a guessed date,
// see shared/analytics-rules.ts/tools.ts's resolveAllTimeRange); this prompt rule is what tells
// the model that value exists and when to reach for it instead of asking a clarifying question.
const TIME_INTENT_RULES = [
  'إذا ذكر المستخدم أي صيغة تعني "كل الفترة المتاحة" (مثل: كل الوقت، من البداية، منذ إنشاء الحساب، كل البيانات، جميع البيانات، تاريخيًا، على مر التاريخ، من البداية إلى الآن، all time، lifetime، since the beginning)، استخدم القيمة period="all_time" في الأداة مباشرة -- لا تسأل المستخدم عن الفترة التي يقصدها، ولا تقل إن هذا الخيار غير متاح.',
  "all_time يُحسب من البيانات الفعلية المتاحة (أقدم وأحدث تاريخ حقيقي في المصدر)، وليس من تاريخ افتراضي. إذا احتوت نتيجة الأداة على queriedPeriod، اذكر الفترة الفعلية في ردك بصياغة طبيعية (مثل: \"من 15 يناير 2025 وحتى اليوم\") بدلاً من ذكر 'كل الوقت' فقط دون تحديد.",
  "إذا كانت رسالة المستخدم تصحيحًا لفترة زمنية سبق ذكرها في نفس المحادثة (مثال: بعد سؤال عن 'هذا الشهر'، يقول المستخدم 'لا، كل الوقت' أو 'لا، أقصد الأسبوع الماضي')، أعد استدعاء نفس الأداة بنفس المقياس والكيان لكن بالفترة الجديدة فقط -- لا تُعد تحليل نية الرسالة بالكامل ولا تسأل أسئلة توضيحية إضافية ما دامت الفترة الجديدة واضحة.",
].join("\n")

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

// Universal Data Intelligence audit, Step 3: tells the model when to reach for the generic query
// engine (get_report_catalog + run_kpi_preview) instead of either refusing a question or trying
// to force it into one of the fixed, hand-written tools above. This is the prompt half of "don't
// write a new dedicated tool for every question shape" -- the backend half is the catalog itself.
const GENERIC_QUERY_RULES = [
  "إذا سُئلت سؤالاً تحليليًا معقولاً عن بيانات هذا القسم ولا توجد أداة مخصصة تجيب عنه مباشرة (مثل: 'أي فئة منتجات حققت أعلى مبيعات؟'، 'من أكثر عميل اشترى؟'، 'ما إجمالي هامش الربح هذا الشهر؟')، لا تقل إن البيانات غير متوفرة قبل التحقق -- استخدم get_report_catalog لمعرفة مصادر البيانات/الحقول/الأبعاد المتاحة فعليًا، ثم استخدم run_kpi_preview لتنفيذ الاستعلام الفعلي.",
  "في run_kpi_preview: استخدم groupByDimension عندما يطلب السؤال 'أي/أكثر/أفضل X ساهم في Y' (يُعيد ترتيبًا تنازليًا لأعلى 10 نتائج). استخدم compareEnabled=true عندما يطلب السؤال مقارنة بالفترة السابقة. لا تستخدم dataSource أو field أو اسم بُعد لم يرد حرفيًا في نتيجة get_report_catalog -- هذا يُرفض من الخادم فورًا.",
  "عند سؤال 'لماذا ارتفع/انخفض X' أو 'أي المنتجات/العملاء/الفئات تسبب في التغيير' ولا توجد أداة تشخيصية مخصصة لهذا المصدر، استخدم run_kpi_preview مع groupByDimension وcompareEnabled=true معًا -- النتيجة تُرتّب تلقائيًا بأكبر تغيّر (زيادة أو نخفاض) أولًا، ويحمل كل عنصر previousValue/delta/deltaPercent. اعرض هذا كملاحظة تزامن (مثل 'أكبر مساهم في التغيّر هو...')، ولا تستخدم صياغة جزم سببي (لا تقل 'كان السبب' أو 'تسبب في') إلا إذا كانت الأداة نفسها أثبتت ذلك.",
  "إذا كانت أداة مخصصة (مثل analyze_sales_performance أو get_top_selling_products) تجيب عن السؤال مباشرة وبتحليل أعمق (تفصيل الأسباب، مستوى الثقة، إلخ)، فضّلها دائمًا على run_kpi_preview -- الأخير هو الخيار العام عند عدم وجود أداة أكثر تخصصًا فقط.",
].join("\n")

// Section 3 of the "Next Level" audit: without this, a follow-up like "قارنها بالشهر الماضي"
// has no structured anchor to the prior turn's actual query (dataSource/field/period/dimension)
// -- only the model's own prose summary of it, which is lossy and not meant to be re-parsed.
// formatToolCallsAnnotation (below) attaches a compact, machine-readable record of each past
// assistant turn's real tool calls to the message history sent to the LLM; this is the prompt
// half telling it how to read and use that record.
const CONVERSATION_CONTEXT_RULES = [
  "كل رسالة سابقة من المساعد في هذه المحادثة قد يتبعها سطر [أدوات مستخدمة في هذا الرد: ...] يسرد اسم الأداة والمعاملات الفعلية (dataSource وfield وperiod وgroupByDimension وغيرها) التي استُخدمت لإنتاج ذلك الرد. هذا السطر معلومة داخلية للسياق فقط -- لا تذكره للمستخدم ولا تُشر إلى وجوده.",
  "إذا كان سؤال المستخدم الحالي متابعة لسؤال سابق (مثل 'قارنها بالشهر الماضي'، 'وماذا عن المنتجات؟'، 'طيب الأسبوع الماضي؟'، 'نفس الشيء لكن...')، استخرج المعاملات (dataSource/field/aggregation/metric) من آخر استدعاء أداة ذي صلة في [أدوات مستخدمة]، وغيّر فقط الجزء الذي غيّره المستخدم صريحًا في سؤاله الحالي (الفترة، البُعد، المقياس) -- لا تطلب توضيحًا لما هو واضح من السياق.",
  "إذا سأل المستخدم 'ما السبب؟' أو 'لماذا؟' أو 'وش السبب' بعد مقارنة سابقة، استخدم نفس الفترتين (الحالية والسابقة) من آخر مقارنة مذكورة في [أدوات مستخدمة] عند استدعاء أداة تشخيصية (مثل identify_performance_drivers) -- لا تطلب من المستخدم تحديد الفترة من جديد.",
  "مهم: مهما كانت المعاملات مطابقة لاستدعاء سابق، استدعِ الأداة المناسبة من جديد في هذا الدور دائمًا -- لا تُعد رقمًا أو نسبة من رد سابق كإجابة نهائية لسؤال جديد دون استدعاء الأداة فعليًا في هذا الدور.",
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
    PRESENTATION_RULES,
    TIME_INTENT_RULES,
    category === "advertising" ? ADVERTISING_ANALYTICS_RULES : "",
    GENERIC_QUERY_RULES,
    CONVERSATION_CONTEXT_RULES,
    scopeNote,
  ]
    .filter(Boolean)
    .join("\n")
}

// Renders a past turn's real tool calls as a compact, machine-readable trailer appended to its
// stored prose -- only for the copy of history sent to the LLM (never persisted; the DB/frontend
// keep the original, unannotated content). Truncated per call (not the full 6000-char
// outputSummary) since this accumulates across up to 20 history messages each turn, and its only
// job is to anchor follow-up parameters/periods, not to re-supply full evidence -- see
// CONVERSATION_CONTEXT_RULES for why the model must still re-call the tool rather than reuse
// a number from here.
function formatToolCallsAnnotation(toolCalls: ToolCallTrace[]): string {
  const lines = toolCalls.map(
    (call) => `- ${call.tool}(${JSON.stringify(call.input)}) -> ${call.outputSummary.slice(0, 300)}`
  )
  return `\n\n[أدوات مستخدمة في هذا الرد (للسياق الداخلي فقط):\n${lines.join("\n")}]`
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

    // Captured from the real, pre-JSON.stringify tool return values -- the formatter builds the
    // structured envelope from these, never from the LLM's own text or from re-parsing the
    // (possibly truncated) outputSummary trace.
    const rawToolResults: RawToolResult[] = []

    const result = await this.llmClient.runChatTurn({
      systemPrompt: buildSystemPrompt(session.applicationCategory),
      tools,
      model: this.model,
      messages: history
        .filter((message) => message.role !== "system_notice")
        .map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content:
            message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0
              ? message.content + formatToolCallsAnnotation(message.toolCalls)
              : message.content,
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
        rawToolResults.push({ tool: toolName, output: toolResult ?? {} })
        return JSON.stringify(toolResult ?? {})
      },
    })

    await this.repository.touchSession(sessionId)

    const timezone = await getOrganizationTimezone(this.db, actor.organizationId)

    return this.repository.appendMessage({
      sessionId,
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : null,
      structured: buildStructuredResponse(rawToolResults, timezone),
      model: this.model,
    })
  }

  // Streaming counterpart of sendMessage -- same guards, same history-building, same tool
  // dispatch and same final persistence shape, so a message sent through either path is
  // indistinguishable once stored. The only real difference is which llmClient method is called
  // and that onEvent/signal are threaded through for progressive rendering and cancellation (see
  // interfaces/rest/server.ts's SSE route, the only caller). Kept as a separate method rather
  // than unifying with sendMessage behind a flag: the two call sites (JSON route, SSE route) are
  // different enough in how they consume the result that a shared branchy method would be harder
  // to follow than the small amount of duplication here.
  async sendMessageStream(
    actor: AuthenticatedActor,
    sessionId: string,
    content: string,
    options: { onEvent: (event: ChatStreamEvent) => void; signal?: AbortSignal }
  ): Promise<ChatMessageDto> {
    assertActorCanUseAiChat(actor)
    const session = await this.loadOwnedSession(actor, sessionId)

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

    const rawToolResults: RawToolResult[] = []

    const result = await this.llmClient.runChatTurnStreaming({
      systemPrompt: buildSystemPrompt(session.applicationCategory),
      tools,
      model: this.model,
      messages: history
        .filter((message) => message.role !== "system_notice")
        .map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content:
            message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0
              ? message.content + formatToolCallsAnnotation(message.toolCalls)
              : message.content,
        })),
      onEvent: options.onEvent,
      signal: options.signal,
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
        rawToolResults.push({ tool: toolName, output: toolResult ?? {} })
        return JSON.stringify(toolResult ?? {})
      },
    })

    // A cancelled turn never appends an assistant reply -- the user's own question (already
    // persisted above) stands alone until/unless they ask again. Returning a half-generated
    // answer here would contradict the cancellation the user explicitly asked for, and could be
    // mistaken for a complete response on the next page load.
    if (result.stopReason === "cancelled") {
      throw new ChatTurnCancelledError()
    }

    await this.repository.touchSession(sessionId)

    const timezone = await getOrganizationTimezone(this.db, actor.organizationId)

    return this.repository.appendMessage({
      sessionId,
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : null,
      structured: buildStructuredResponse(rawToolResults, timezone),
      model: this.model,
    })
  }
}
