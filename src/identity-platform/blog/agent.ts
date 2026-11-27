import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { contentWarnings, slugify } from "./content"
import { MADAR_PRODUCT_BRIEF } from "./product-brief"
import { riyadhHour, riyadhWeekday, riyadhWeekStart } from "./schedule"
import type { BlogService } from "./service"
import { STATIC_BLOG_POSTS } from "./static-posts"
import {
  BLOG_CATEGORIES,
  BLOG_CTA_APPS,
  type BlogBlock,
  type BlogCategory,
  type BlogCtaApp,
  type BlogPostKind,
} from "./types"
import { WHATS_NEW, type WhatsNewEntry } from "./whats-new"

// The blog agent. Every Sunday (Riyadh) it plans the week's articles, writes each one as a
// draft and tells the team on WhatsApp. Nothing goes out until a person approves it in Madar
// Admin; approval puts each article on the next publishing day.
//
// Its goal is organic leads: it leans towards topics Saudi business owners search for, writes
// for Google (title, description, headings, FAQ), points every article at the right Madar app,
// and looks at which earlier articles brought sign-ups.

export interface BlogTopic {
  kind: BlogPostKind
  title: string
  targetKeyword: string
  category: BlogCategory
  ctaApp: BlogCtaApp
  featureKeys: string[]
  angle: string
}

export interface WrittenArticle {
  title: string
  slug: string
  excerpt: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  body: BlogBlock[]
  faq: Array<{ question: string; answer: string }>
}

export interface BlogPlanInput {
  count: number
  today: string
  existing: Array<{ title: string; category: string }>
  whatsNew: WhatsNewEntry[]
  topPerformers: Array<{ title: string; views: number; leads: number; signups: number }>
}

export interface BlogWriteInput {
  topic: BlogTopic
  today: string
  prices: string
  features: WhatsNewEntry[]
  existingTitles: string[]
}

// The model behind the agent, kept behind an interface so tests can stand in for it.
export interface BlogWriter {
  plan(input: BlogPlanInput): Promise<BlogTopic[]>
  write(input: BlogWriteInput): Promise<WrittenArticle>
}

export interface BlogPrices {
  // The price list as the agent reads it.
  text: string
  // Every amount it may mention, in riyals.
  values: number[]
}

const NEWS_WINDOW_DAYS = 60

export class BlogAgent {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly blog: BlogService,
    private readonly writer: BlogWriter,
    private readonly prices: () => Promise<BlogPrices>,
    private readonly notify: (text: string) => Promise<void>,
    private readonly now: () => Date = () => new Date(),
    private readonly adminUrl = "https://app.madar.my/madar-admin/blog"
  ) {}

  // Called every hour (server.ts). Writes once per week: on Sunday from 8:00 Riyadh, the first
  // server to claim the week does it. A failed week is retried on the next ticks, up to 3 times.
  async tick(): Promise<number> {
    const settings = await this.blog.settings()
    if (!settings.agentEnabled) return 0
    const now = this.now()
    if (riyadhWeekday(now) !== 0 || riyadhHour(now) < 8) return 0
    const weekStart = riyadhWeekStart(now)
    if (!(await this.claim(weekStart))) return 0
    return this.runClaimed(weekStart, settings.postsPerWeek)
  }

  // Madar Admin's "write drafts now". Counts towards the current week.
  async runNow(count?: number): Promise<number> {
    const settings = await this.blog.settings()
    const weekStart = riyadhWeekStart(this.now())
    await this.db.query(
      `INSERT INTO blog_agent_runs (week_start, status) VALUES ($1, 'running')
       ON CONFLICT (week_start) DO UPDATE SET status = 'running', started_at = now(), error = NULL`,
      [weekStart]
    )
    return this.runClaimed(weekStart, count ?? settings.postsPerWeek)
  }

  async lastRun(): Promise<{
    weekStart: string
    status: string
    postsWritten: number
    error: string | null
    finishedAt: string | null
  } | null> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM blog_agent_runs ORDER BY week_start DESC LIMIT 1`
    )
    const row = result.rows[0]
    if (!row) return null
    const day =
      row.week_start instanceof Date ? row.week_start.toISOString() : String(row.week_start)
    return {
      weekStart: day.slice(0, 10),
      status: String(row.status),
      postsWritten: Number(row.posts_written) || 0,
      error: (row.error as string | null) ?? null,
      finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    }
  }

  private async claim(weekStart: string): Promise<boolean> {
    const existing = await this.db.query<Record<string, unknown>>(
      `SELECT status, attempts, started_at FROM blog_agent_runs WHERE week_start = $1`,
      [weekStart]
    )
    const row = existing.rows[0]
    if (!row) {
      try {
        // The week is the primary key: of two servers inserting at once, one gets an error.
        await this.db.query(
          `INSERT INTO blog_agent_runs (week_start, status, started_at) VALUES ($1, 'running', $2)`,
          [weekStart, this.now().toISOString()]
        )
        return true
      } catch {
        return false
      }
    }
    // A failed week gets two more tries, at least 50 minutes apart.
    const startedAt = new Date(String(row.started_at)).getTime()
    if (
      row.status !== "failed" ||
      Number(row.attempts) >= 3 ||
      this.now().getTime() - startedAt < 50 * 60_000
    ) {
      return false
    }
    const retried = await this.db.query<Record<string, unknown>>(
      `UPDATE blog_agent_runs SET status = 'running', attempts = attempts + 1, started_at = $2,
         error = NULL
       WHERE week_start = $1 AND status = 'failed'
       RETURNING week_start`,
      [weekStart, this.now().toISOString()]
    )
    return retried.rows.length > 0
  }

  private async runClaimed(weekStart: string, count: number): Promise<number> {
    try {
      const written = await this.write(weekStart, count)
      await this.db.query(
        `UPDATE blog_agent_runs SET status = 'done', posts_written = $2, finished_at = now()
         WHERE week_start = $1`,
        [weekStart, written.length]
      )
      if (written.length > 0) {
        await this.notify(
          [
            `📝 *مسودات مدونة مدار لهذا الأسبوع جاهزة (${written.length})*`,
            ...written.map((title, index) => `${index + 1}. ${title}`),
            "",
            `راجعها واعتمدها لتُنشر في أيامها: ${this.adminUrl}`,
          ].join("\n")
        )
      }
      return written.length
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("blog_agent.failed", { weekStart, message })
      await this.db.query(
        `UPDATE blog_agent_runs SET status = 'failed', error = $2, finished_at = now()
         WHERE week_start = $1`,
        [weekStart, message.slice(0, 500)]
      )
      throw error
    }
  }

  // Plans `count` topics, writes each one and saves it as a draft. Returns the titles written.
  private async write(weekStart: string, count: number): Promise<string[]> {
    const now = this.now()
    const today = now.toISOString().slice(0, 10)
    const posts = await this.blog.list()
    const live = posts.filter((post) => post.status !== "rejected")
    const covered = new Set(live.flatMap((post) => post.featureKeys))
    const cutoff = new Date(now.getTime() - NEWS_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const whatsNew = WHATS_NEW.filter((entry) => !covered.has(entry.key) && entry.date >= cutoff)

    const stats = await this.blog.stats(new Date(now.getTime() - 30 * 86_400_000), now)
    const titleOf = new Map<string, string>([
      ...STATIC_BLOG_POSTS.map((post) => [post.slug, post.title] as [string, string]),
      ...posts.map((post) => [post.slug, post.title] as [string, string]),
    ])
    const topPerformers = stats.slice(0, 5).map((entry) => ({
      title: titleOf.get(entry.slug) ?? entry.slug,
      views: entry.views,
      leads: entry.leads,
      signups: entry.signups,
    }))

    const existing = [
      ...STATIC_BLOG_POSTS.map((post) => ({ title: post.title, category: post.category })),
      ...live.map((post) => ({ title: post.title, category: post.category })),
    ]
    const topics = (
      await this.writer.plan({ count, today, existing, whatsNew, topPerformers })
    ).slice(0, count)

    const prices = await this.prices()
    const titles: string[] = []
    for (const topic of topics) {
      const features = WHATS_NEW.filter((entry) => topic.featureKeys.includes(entry.key))
      const article = await this.writer.write({
        topic,
        today,
        prices: prices.text,
        features,
        existingTitles: existing.map((post) => post.title),
      })
      const body = article.body.filter((block) => block !== null)
      const warnings = contentWarnings({
        title: article.title,
        excerpt: article.excerpt,
        body,
        faq: article.faq,
        allowedPrices: prices.values,
      })
      const draft = await this.blog.createDraft({
        slug: slugify(article.slug || topic.targetKeyword),
        title: article.title,
        excerpt: article.excerpt,
        category: topic.category,
        body,
        faq: article.faq,
        seoTitle: article.seoTitle || null,
        seoDescription: article.seoDescription || null,
        keywords: article.keywords,
        ctaApp: topic.ctaApp,
        kind: topic.kind,
        featureKeys: features.map((entry) => entry.key),
        warnings,
        source: "agent",
        weekStart,
      })
      existing.push({ title: draft.title, category: draft.category })
      titles.push(draft.title)
    }
    return titles
  }
}

// The instance the API server built, for the weekly timer in server.ts.
let registered: BlogAgent | null = null
export const registerBlogAgent = (agent: BlogAgent | null) => {
  registered = agent
}
export const registeredBlogAgent = () => registered

// ---------------------------------------------------------------------------------------------
// The Claude-backed writer.

const planSchema = z.object({
  topics: z.array(
    z.object({
      kind: z.enum(["news", "guide"]),
      title: z.string(),
      targetKeyword: z.string(),
      category: z.enum(BLOG_CATEGORIES),
      ctaApp: z.enum(BLOG_CTA_APPS),
      featureKeys: z.array(z.string()),
      angle: z.string(),
    })
  ),
})

// Every field is always present (unused ones empty) -- simpler for structured output.
const articleSchema = z.object({
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  keywords: z.array(z.string()),
  body: z.array(
    z.object({
      type: z.enum(["p", "h2", "h3", "ul", "ol", "callout", "formula"]),
      text: z.string(),
      items: z.array(z.string()),
      title: z.string(),
      tone: z.enum(["tip", "note"]),
      label: z.string(),
      formula: z.string(),
      example: z.string(),
    })
  ),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
})

type RawBlock = z.infer<typeof articleSchema>["body"][number]

// The model's flat blocks as the site's blocks; empty ones dropped, headings numbered.
export function normalizeBlocks(raw: RawBlock[]): BlogBlock[] {
  const blocks: BlogBlock[] = []
  let headings = 0
  for (const block of raw) {
    const text = block.text.trim()
    switch (block.type) {
      case "p":
        if (text) blocks.push({ type: "p", text })
        break
      case "h2":
        if (text) {
          headings += 1
          blocks.push({ type: "h2", id: `section-${headings}`, text })
        }
        break
      case "h3":
        if (text) blocks.push({ type: "h3", text })
        break
      case "ul":
      case "ol": {
        const items = block.items.map((item) => item.trim()).filter(Boolean)
        if (items.length > 0) blocks.push({ type: block.type, items })
        break
      }
      case "callout":
        if (text)
          blocks.push({ type: "callout", tone: block.tone, title: block.title.trim(), text })
        break
      case "formula":
        if (block.formula.trim()) {
          blocks.push({
            type: "formula",
            label: block.label.trim(),
            formula: block.formula.trim(),
            example: block.example.trim(),
          })
        }
        break
    }
  }
  return blocks
}

const CATEGORY_HELP = `الأقسام (category): campaigns = الحملات الإعلانية، invoicing = الفوترة والضريبة، ecommerce = التجارة الإلكترونية، inventory = المخزون والفروع، pos = الكاشير والمبيعات، booking = الحجوزات والعملاء.
التطبيق الذي توجّه له أزرار المقال (ctaApp): pos, ecommerce, campaigns, invoicing, inventory, booking, loyalty, accounting, complete (مدار الكامل).`

export class ClaudeBlogWriter implements BlogWriter {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async plan(input: BlogPlanInput): Promise<BlogTopic[]> {
    const prompt = `${MADAR_PRODUCT_BRIEF}

---
أنت مسؤول مدونة مدار (madar.my/blog). هدفك الأول: عملاء محتملون من بحث جوجل (تسجيل في التجربة المجانية أو طلب تواصل)، وليس الزيارات فقط.
اليوم ${input.today}. خطّط ${input.count} مقالات لهذا الأسبوع.

القواعد:
- إذا وُجدت ميزة جديدة في قائمة «الجديد» لم نكتب عنها، اجعل مقالاً واحداً على الأكثر من نوع news عنها (featureKeys = مفاتيحها). والباقي من نوع guide.
- guide: موضوع يبحث عنه صاحب منشأة في السعودية فعلاً في جوجل (مثل: برنامج كاشير، فاتورة إلكترونية، نظام حجوزات صالون، جرد المخزون، تكلفة الإعلان في سناب)، يحل مشكلة حقيقية، ويقود طبيعياً لتطبيق في مدار.
- targetKeyword: عبارة البحث الرئيسية بالعربي كما يكتبها الناس.
- لا تكرر موضوعاً موجوداً (القائمة أدناه)، ونوّع الأقسام خلال الأسبوع.
- استفد من المقالات الأعلى نتائج: اكتب في مواضيع قريبة منها إن كانت تجلب تسجيلات.
${CATEGORY_HELP}

المقالات الموجودة:
${input.existing.map((post) => `- [${post.category}] ${post.title}`).join("\n")}

الجديد في مدار (لم يُكتب عنه بعد):
${input.whatsNew.length ? input.whatsNew.map((entry) => `- ${entry.key} (${entry.date}، ${entry.app}): ${entry.title} — ${entry.summary}`).join("\n") : "- لا شيء"}

المقالات الأعلى نتائج آخر 30 يوماً:
${input.topPerformers.length ? input.topPerformers.map((entry) => `- ${entry.title}: ${entry.views} مشاهدة، ${entry.leads} طلب تواصل، ${entry.signups} تسجيل`).join("\n") : "- لا توجد بيانات بعد"}`

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(planSchema) },
      messages: [{ role: "user", content: prompt }],
    })
    if (!response.parsed_output) {
      throw new Error(`Blog plan failed (stop_reason: ${response.stop_reason}).`)
    }
    const known = new Set(WHATS_NEW.map((entry) => entry.key))
    return response.parsed_output.topics.map((topic) => ({
      ...topic,
      featureKeys: topic.featureKeys.filter((key) => known.has(key)),
    }))
  }

  async write(input: BlogWriteInput): Promise<WrittenArticle> {
    const { topic } = input
    const prompt = `${MADAR_PRODUCT_BRIEF}

---
اكتب مقالاً لمدونة مدار.
- النوع: ${topic.kind === "news" ? "خبر عن ميزة جديدة (جديد في مدار)" : "دليل عملي يجيب عن سؤال يبحث عنه الناس"}
- العنوان المقترح: ${topic.title}
- عبارة البحث الرئيسية: ${topic.targetKeyword}
- الزاوية: ${topic.angle}
- التطبيق الذي يقود له المقال: ${topic.ctaApp}
اليوم ${input.today}.

${input.features.length ? `الميزات التي يتحدث عنها المقال (لا تضف عليها):\n${input.features.map((entry) => `- ${entry.title}: ${entry.summary}`).join("\n")}\n` : ""}
قائمة أسعار مدار الحالية (لا تذكر أي سعر غيرها، ولا تذكر أسعاراً إن لم يحتجها المقال):
${input.prices}

اكتب للتاجر السعودي بعربية واضحة وودية (فصحى مبسطة، ويمكن كلمة سعودية خفيفة)، بطول 900 إلى 1400 كلمة.
تحسين محركات البحث:
- title: عنوان جذاب فيه عبارة البحث، حتى 70 حرفاً تقريباً.
- seoTitle: حتى 60 حرفاً، يبدأ بعبارة البحث.
- seoDescription: بين 120 و155 حرفاً، فيه عبارة البحث ودعوة للقراءة.
- slug: بالإنجليزية بحروف صغيرة وشرطات، 3 إلى 6 كلمات (مثل pos-system-for-small-shops).
- excerpt: جملتان تشرحان ما سيستفيده القارئ.
- keywords: 4 إلى 8 عبارات بحث قريبة.
- body: ابدأ بفقرة تدخل في المشكلة مباشرة، ثم 4 إلى 6 عناوين h2 واضحة (بعضها أسئلة كما يبحث الناس)، مع قوائم ونصيحة callout واحدة على الأقل. استخدم formula فقط لمعادلة حسابية حقيقية. اذكر كيف يحل مدار المشكلة بشكل طبيعي في قسم واحد قرب النهاية دون مبالغة.
- لا تضع روابط ولا أزرار في النص؛ الصفحة تضيف أزرار التسجيل تلقائياً.
- faq: 3 إلى 5 أسئلة يبحث عنها الناس مع إجابات قصيرة (جملتان أو ثلاث).
- كل حقل في الكتل موجود دائماً: اترك غير المستخدم فارغاً ("" أو [])، وtone = "tip" إذا لم تكن الكتلة callout.

لا تكرر هذه المقالات الموجودة:
${input.existingTitles
  .slice(-40)
  .map((title) => `- ${title}`)
  .join("\n")}`

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(articleSchema) },
      messages: [{ role: "user", content: prompt }],
    })
    const parsed = response.parsed_output
    if (!parsed) throw new Error(`Blog article failed (stop_reason: ${response.stop_reason}).`)
    return {
      ...parsed,
      keywords: parsed.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      faq: parsed.faq.filter((item) => item.question.trim() && item.answer.trim()),
      body: normalizeBlocks(parsed.body),
    }
  }
}

// ---------------------------------------------------------------------------------------------

// The price list in plain Arabic, from Madar's pricing catalog.
export function formatPrices(
  catalog: Array<{
    application: string
    mode: string
    visible: boolean
    packages: Array<{
      name: string
      isActive: boolean
      monthlyPriceHalalas: number | null
      yearlyPriceHalalas: number | null
    }>
  }>
): BlogPrices {
  const lines: string[] = []
  const values: number[] = []
  for (const app of catalog) {
    if (!app.visible) continue
    if (app.mode === "free") {
      lines.push(`- ${app.application}: مجاني`)
      continue
    }
    if (app.mode === "contact") continue
    for (const pkg of app.packages.filter((entry) => entry.isActive)) {
      const parts: string[] = []
      if (pkg.monthlyPriceHalalas !== null) {
        const value = pkg.monthlyPriceHalalas / 100
        values.push(value)
        parts.push(`${value.toLocaleString("en-US")} ريال شهرياً`)
      }
      if (pkg.yearlyPriceHalalas !== null) {
        const value = pkg.yearlyPriceHalalas / 100
        values.push(value)
        parts.push(`${value.toLocaleString("en-US")} ريال سنوياً`)
      }
      if (parts.length > 0) lines.push(`- ${app.application} / ${pkg.name}: ${parts.join("، ")}`)
    }
  }
  return { text: lines.join("\n") || "- (القائمة غير متاحة الآن: لا تذكر أسعاراً)", values }
}
