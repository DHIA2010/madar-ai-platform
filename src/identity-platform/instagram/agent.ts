import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"

import type { BlogPrices } from "../blog/agent"
import { contentWarnings } from "../blog/content"
import { MADAR_PRODUCT_BRIEF } from "../blog/product-brief"
import { riyadhHour, riyadhWeekday, riyadhWeekStart } from "../blog/schedule"
import type { BlogService } from "../blog/service"
import { WHATS_NEW, type WhatsNewEntry } from "../blog/whats-new"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { InstagramService } from "./service"
import {
  INSTAGRAM_ICONS,
  INSTAGRAM_SCREENS,
  INSTAGRAM_TEMPLATES,
  type InstagramDesign,
  type InstagramPostRecord,
  type InstagramTemplate,
} from "./types"

// The Instagram agent. Every Sunday (Riyadh) it writes the week's posts: each one a filled-in
// square design (one of the three approved styles) plus a casual Saudi caption, hashtags and a
// first-comment question. Drafts only: a person approves them in Madar Admin.

export interface InstagramDraft {
  template: InstagramTemplate
  kind: InstagramPostRecord["kind"]
  topic: string
  design: InstagramDesign
  caption: string
  hashtags: string[]
  firstComment: string
  featureKeys: string[]
}

export interface InstagramWriteInput {
  count: number
  today: string
  prices: string
  whatsNew: WhatsNewEntry[]
  recentTopics: string[]
  blogTitles: string[]
  topPosts: Array<{ topic: string; reach: number; likes: number }>
}

export interface InstagramWriter {
  write(input: InstagramWriteInput): Promise<InstagramDraft[]>
}

// Words that must fit their place on the square image.
const LIMITS = {
  title: 18,
  search: 26,
  sub: 60,
  point: 40,
  chip: 30,
  cardTitle: 14,
  cardText: 34,
  cta: 18,
}

// Too-long words get flagged rather than cut: the reviewer shortens them.
export function designWarnings(template: InstagramTemplate, design: InstagramDesign): string[] {
  const warnings: string[] = []
  const check = (label: string, value: string | undefined, max: number) => {
    if (value && value.length > max)
      warnings.push(`${label} أطول من المساحة (${value.length}/${max} حرفاً)`)
  }
  check("العنوان الأول", design.titleTop, LIMITS.title)
  check("العنوان الثاني", design.titleBottom, LIMITS.title)
  check("الزر", design.cta, LIMITS.cta)
  if (template === "a") {
    check("سطر البحث", design.search, LIMITS.search)
    for (const point of design.points ?? []) check("نقطة", point, LIMITS.point)
  }
  if (template === "b") {
    check("السطر الفرعي", design.sub, LIMITS.sub)
    for (const chip of design.chips ?? []) check("الملصق", chip, LIMITS.chip)
  }
  if (template === "c") {
    for (const card of design.cards ?? []) {
      check("عنوان البطاقة", card.title, LIMITS.cardTitle)
      check("نص البطاقة", card.text, LIMITS.cardText)
    }
  }
  return warnings
}

export class InstagramAgent {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly instagram: InstagramService,
    private readonly blog: BlogService | null,
    private readonly writer: InstagramWriter,
    private readonly prices: () => Promise<BlogPrices>,
    private readonly notify: (text: string) => Promise<void>,
    private readonly now: () => Date = () => new Date(),
    private readonly adminUrl = "https://app.madar.my/madar-admin/instagram"
  ) {}

  // Called every hour. Writes once per week, on Sunday from 9:00 Riyadh.
  async tick(): Promise<number> {
    const settings = await this.instagram.settings()
    if (!settings.agentEnabled) return 0
    const now = this.now()
    if (riyadhWeekday(now) !== 0 || riyadhHour(now) < 9) return 0
    const weekStart = riyadhWeekStart(now)
    if (!(await this.claim(weekStart))) return 0
    return this.run(weekStart, settings.postsPerWeek)
  }

  async runNow(): Promise<number> {
    const settings = await this.instagram.settings()
    const weekStart = riyadhWeekStart(this.now())
    await this.db.query(
      `INSERT INTO instagram_agent_runs (week_start, status) VALUES ($1, 'running')
       ON CONFLICT (week_start) DO UPDATE SET status = 'running', started_at = now(), error = NULL`,
      [weekStart]
    )
    return this.run(weekStart, settings.postsPerWeek)
  }

  async lastRun() {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM instagram_agent_runs ORDER BY week_start DESC LIMIT 1`
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
    }
  }

  private async claim(weekStart: string): Promise<boolean> {
    const existing = await this.db.query<Record<string, unknown>>(
      `SELECT status, attempts, started_at FROM instagram_agent_runs WHERE week_start = $1`,
      [weekStart]
    )
    const row = existing.rows[0]
    if (!row) {
      try {
        await this.db.query(
          `INSERT INTO instagram_agent_runs (week_start, status, started_at) VALUES ($1, 'running', $2)`,
          [weekStart, this.now().toISOString()]
        )
        return true
      } catch {
        return false
      }
    }
    const startedAt = new Date(String(row.started_at)).getTime()
    if (
      row.status !== "failed" ||
      Number(row.attempts) >= 3 ||
      this.now().getTime() - startedAt < 50 * 60_000
    ) {
      return false
    }
    await this.db.query(
      `UPDATE instagram_agent_runs SET status = 'running', attempts = attempts + 1, started_at = $2,
         error = NULL WHERE week_start = $1`,
      [weekStart, this.now().toISOString()]
    )
    return true
  }

  private async run(weekStart: string, count: number): Promise<number> {
    try {
      const posts = await this.instagram.list()
      const live = posts.filter((post) => post.status !== "rejected")
      const covered = new Set(live.flatMap((post) => post.featureKeys))
      const now = this.now()
      const cutoff = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
      const blogTitles = this.blog
        ? (await this.blog.listPublished()).slice(0, 12).map((post) => post.title)
        : []
      const prices = await this.prices()
      const drafts = (
        await this.writer.write({
          count,
          today: now.toISOString().slice(0, 10),
          prices: prices.text,
          whatsNew: WHATS_NEW.filter((entry) => !covered.has(entry.key) && entry.date >= cutoff),
          recentTopics: live.slice(0, 30).map((post) => post.topic ?? post.design.titleTop),
          blogTitles,
          topPosts: live
            .filter((post) => post.insights)
            .sort((left, right) => (right.insights?.reach ?? 0) - (left.insights?.reach ?? 0))
            .slice(0, 5)
            .map((post) => ({
              topic: post.topic ?? post.design.titleTop,
              reach: post.insights?.reach ?? 0,
              likes: post.insights?.likes ?? 0,
            })),
        })
      ).slice(0, count)

      const known = new Set(WHATS_NEW.map((entry) => entry.key))
      const titles: string[] = []
      for (const draft of drafts) {
        const texts = [
          draft.design.titleTop,
          draft.design.titleBottom,
          draft.design.search ?? "",
          draft.design.sub ?? "",
          ...(draft.design.points ?? []),
          ...(draft.design.chips ?? []),
          ...(draft.design.cards ?? []).flatMap((card) => [card.title, card.text]),
        ]
        const warnings = [
          ...designWarnings(draft.template, draft.design),
          ...contentWarnings({
            title: draft.caption,
            excerpt: draft.firstComment,
            body: texts.map((text) => ({ type: "p" as const, text })),
            faq: [],
            allowedPrices: prices.values,
          }),
        ]
        const saved = await this.instagram.createDraft({
          template: draft.template,
          design: draft.design,
          caption: draft.caption,
          hashtags: draft.hashtags,
          firstComment: draft.firstComment,
          topic: draft.topic,
          kind: draft.kind,
          featureKeys: draft.featureKeys.filter((key) => known.has(key)),
          warnings,
          source: "agent",
          weekStart,
        })
        titles.push(saved.topic ?? saved.design.titleTop)
      }
      await this.db.query(
        `UPDATE instagram_agent_runs SET status = 'done', posts_written = $2, finished_at = now()
         WHERE week_start = $1`,
        [weekStart, titles.length]
      )
      if (titles.length > 0) {
        await this.notify(
          [
            `📸 *منشورات إنستقرام لهذا الأسبوع جاهزة (${titles.length})*`,
            ...titles.map((title, index) => `${index + 1}. ${title}`),
            "",
            `راجعها واعتمدها لتُنشر في أيامها: ${this.adminUrl}`,
          ].join("\n")
        )
      }
      return titles.length
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("instagram_agent.failed", { weekStart, message })
      await this.db.query(
        `UPDATE instagram_agent_runs SET status = 'failed', error = $2, finished_at = now()
         WHERE week_start = $1`,
        [weekStart, message.slice(0, 500)]
      )
      throw error
    }
  }
}

let registered: InstagramAgent | null = null
export const registerInstagramAgent = (agent: InstagramAgent | null) => {
  registered = agent
}
export const registeredInstagramAgent = () => registered

// ---------------------------------------------------------------------------------------------
// The Claude-backed writer.

const postsSchema = z.object({
  posts: z.array(
    z.object({
      template: z.enum(INSTAGRAM_TEMPLATES),
      kind: z.enum(["news", "tip", "feature", "question"]),
      topic: z.string(),
      titleTop: z.string(),
      titleBottom: z.string(),
      search: z.string(),
      sub: z.string(),
      points: z.array(z.string()),
      chips: z.array(z.string()),
      screen: z.enum(INSTAGRAM_SCREENS),
      cards: z.array(
        z.object({ icon: z.enum(INSTAGRAM_ICONS), title: z.string(), text: z.string() })
      ),
      cta: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()),
      firstComment: z.string(),
      featureKeys: z.array(z.string()),
    })
  ),
})

type RawPost = z.infer<typeof postsSchema>["posts"][number]

// The model's flat answer as a design: only the fields its template uses.
export function toDraft(raw: RawPost): InstagramDraft {
  const design: InstagramDesign = {
    titleTop: raw.titleTop.trim(),
    titleBottom: raw.titleBottom.trim(),
    cta: raw.cta.trim() || "جرّب مدار مجاناً",
  }
  if (raw.template === "a") {
    design.search = raw.search.trim()
    design.points = raw.points
      .map((point) => point.trim())
      .filter(Boolean)
      .slice(0, 4)
  } else if (raw.template === "b") {
    design.sub = raw.sub.trim()
    design.chips = raw.chips
      .map((chip) => chip.trim())
      .filter(Boolean)
      .slice(0, 2)
    design.screen = raw.screen
  } else {
    design.cards = raw.cards
      .filter((card) => card.title.trim())
      .slice(0, 4)
      .map((card) => ({ icon: card.icon, title: card.title.trim(), text: card.text.trim() }))
  }
  return {
    template: raw.template,
    kind: raw.kind,
    topic: raw.topic.trim(),
    design,
    caption: raw.caption.trim(),
    hashtags: raw.hashtags
      .map((tag) => tag.trim().replace(/\s+/g, "_"))
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .slice(0, 12),
    firstComment: raw.firstComment.trim(),
    featureKeys: raw.featureKeys,
  }
}

export class ClaudeInstagramWriter implements InstagramWriter {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async write(input: InstagramWriteInput): Promise<InstagramDraft[]> {
    const prompt = `${MADAR_PRODUCT_BRIEF}

---
أنت مسؤول حساب مدار على إنستقرام. الجمهور: أصحاب المحلات والمطاعم والصالونات والمتاجر الإلكترونية في السعودية. الهدف: متابعون مهتمون وتسجيلات من رابط البايو.
اليوم ${input.today}. اكتب ${input.count} منشورات لهذا الأسبوع، مختلفة عن بعضها في الموضوع والتصميم.

لكل منشور صورة مربعة بأحد ثلاثة تصاميم معتمدة (template):
- a: صورة شخص في محل + سطر بحث أعلى الصورة (search، مثل «برنامج كاشير») + عنوان بسطرين + 3 أو 4 نقاط بعلامة صح (points) + زر (cta). مناسب لميزة أو نوع نشاط.
- b: شاشة التطبيق الحقيقية على لابتوب وجوال + عنوان بسطرين + سطر فرعي (sub) + ملصقان قصيران (chips) + اختيار الشاشة (screen: cashier = شاشة الكاشير، products = المنتجات، close = إغلاق الوردية) + زر. مناسب لإظهار المنتج.
- c: أربع بطاقات (cards) لكل بطاقة أيقونة (icon من: pos كاشير، store متجر، ads إعلانات، booking حجوزات، inventory مخزون، invoice فاتورة، loyalty ولاء، accounting محاسبة، whatsapp واتساب، report تقارير، ai ذكاء اصطناعي) وعنوان قصير ونص قصير + عنوان بسطرين + زر. مناسب لنصائح أو مقارنة.

حدود المساحة (مهمة جداً، النص الأطول لا يظهر):
- titleTop وtitleBottom: كل سطر 18 حرفاً كحد أقصى (مثل «كل تجارتك» / «في مدار واحد»).
- search حتى 26 حرفاً، sub حتى 60، كل نقطة حتى 40، كل ملصق حتى 30، عنوان البطاقة حتى 14 ونصها حتى 34، الزر حتى 18.
- املأ كل الحقول دائماً؛ غير المستخدم في التصميم المختار اتركه "" أو []، وscreen = "cashier" إن لم يكن b، وcards فارغة إن لم يكن c.

الكابشن (caption):
- لهجة سعودية خفيفة وودية (مثل: «وش رايك»، «الحين»، «جاب لك»)، يبدأ بجملة تشد الانتباه في أول سطر.
- 3 إلى 7 أسطر قصيرة، يمكن نقاط ✅، وإيموجي باعتدال.
- ينتهي بدعوة: «جرّب مدار مجاناً 👆 الرابط في البايو».
- لا تضع الهاشتاقات داخل الكابشن؛ ضعها في hashtags (8 إلى 12، عربية وبعضها إنجليزي، بدون مسافات).
- firstComment: سؤال قصير يشجع أصحاب المحلات على التعليق (مثل «وش أكثر شي يتعبك في إدارة محلك؟ 👇»).

الأنواع (kind): news = جديد في مدار (عن ميزة من قائمة «الجديد»، وضع مفاتيحها في featureKeys)، feature = ميزة موجودة، tip = نصيحة لصاحب المحل، question = سؤال تفاعلي. اجعل منشوراً واحداً على الأكثر news إن وُجد جديد، ونوّع الباقي.
topic: وصف الموضوع بكلمات قليلة (للمراجعة فقط).

قائمة الأسعار (لا تذكر أي سعر غيرها، والأفضل ألا تذكر أسعاراً إلا لسبب):
${input.prices}

الجديد في مدار (لم يُنشر عنه بعد):
${input.whatsNew.length ? input.whatsNew.map((entry) => `- ${entry.key}: ${entry.title} — ${entry.summary}`).join("\n") : "- لا شيء"}

مقالات المدونة الأخيرة (يمكن تحويل فكرة منها لمنشور):
${input.blogTitles.length ? input.blogTitles.map((title) => `- ${title}`).join("\n") : "- لا شيء"}

مواضيع نُشرت مؤخراً (لا تكررها):
${input.recentTopics.length ? input.recentTopics.map((topic) => `- ${topic}`).join("\n") : "- لا شيء"}

المنشورات الأعلى وصولاً:
${input.topPosts.length ? input.topPosts.map((post) => `- ${post.topic}: وصول ${post.reach}، إعجاب ${post.likes}`).join("\n") : "- لا توجد بيانات بعد"}`

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 12000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(postsSchema) },
      messages: [{ role: "user", content: prompt }],
    })
    if (!response.parsed_output) {
      throw new Error(`Instagram posts failed (stop_reason: ${response.stop_reason}).`)
    }
    return response.parsed_output.posts.map(toDraft)
  }
}
