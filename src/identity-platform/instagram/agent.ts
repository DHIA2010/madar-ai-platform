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
  INSTAGRAM_SCENES,
  INSTAGRAM_SCREENS,
  INSTAGRAM_TEMPLATES,
  type InstagramDesign,
  type InstagramPostRecord,
  type InstagramTemplate,
} from "./types"

// The Instagram agent. Every Sunday (Riyadh) it writes the week's posts: each one a filled-in
// square design (one of the approved styles, all in Madar's navy/blue/teal identity) plus a
// casual Saudi caption, hashtags and a first-comment question. It rotates the styles so the feed
// stays varied, and writes around Saudi occasions (calendar + a weekly web search). Drafts only:
// a person approves them in Madar Admin.

// The style every post uses for now -- the cinematic scene photo with a headline (approved by the
// owner on 2026-11-28). The other styles stay available for editing by hand in Madar Admin.
export const APPROVED_TEMPLATE: InstagramTemplate = "j"

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
  // Styles of the latest posts, newest first, so the week doesn't repeat them.
  recentTemplates: InstagramTemplate[]
  // Scene photos of the latest posts, newest first, so the photos don't repeat.
  recentScenes: string[]
  // Saudi occasions in the coming weeks, as text for the prompt.
  occasions: string
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
  kicker: 24,
  number: 5,
  option: 26,
  side: 26,
  stepTitle: 22,
  stepText: 46,
  line: 80,
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
  if (template === "d" || template === "e" || template === "g") {
    check("السطر الصغير", design.kicker, LIMITS.kicker)
  }
  if (template === "d") {
    check("الرقم", design.number, LIMITS.number)
    for (const chip of design.chips ?? []) check("الملصق", chip, LIMITS.chip)
  }
  if (template === "e") {
    for (const option of design.options ?? []) check("الخيار", option, LIMITS.option)
  }
  if (template === "f") {
    for (const line of [...(design.wrong ?? []), ...(design.right ?? [])])
      check("سطر المقارنة", line, LIMITS.side)
  }
  if (template === "g") {
    for (const step of design.steps ?? []) {
      check("عنوان النصيحة", step.title, LIMITS.stepTitle)
      check("نص النصيحة", step.text, LIMITS.stepText)
    }
  }
  if (template === "h" || template === "i" || template === "j") {
    check("السطر تحت العنوان", design.sub, template === "h" ? LIMITS.sub : LIMITS.line)
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
    private readonly adminUrl = "https://app.madar.my/madar-admin/instagram",
    // Saudi occasions coming up, as prompt text (calendar + web search); "" without them.
    private readonly occasions: (from: Date) => Promise<string> = async () => ""
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
      const occasions = await this.occasions(now).catch(() => "")
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
          recentTemplates: live.slice(0, 6).map((post) => post.template),
          recentScenes: live
            .map((post) => post.design.scene)
            .filter((scene): scene is NonNullable<typeof scene> => Boolean(scene))
            .slice(0, 8),
          occasions,
        })
      ).slice(0, count)

      const known = new Set(WHATS_NEW.map((entry) => entry.key))
      const titles: string[] = []
      const usedScenes = new Set<string>()
      for (const original of drafts) {
        const draft = asApproved(original, usedScenes)
        const texts = [
          draft.design.titleTop,
          draft.design.titleBottom,
          draft.design.search ?? "",
          draft.design.sub ?? "",
          ...(draft.design.points ?? []),
          ...(draft.design.chips ?? []),
          ...(draft.design.cards ?? []).flatMap((card) => [card.title, card.text]),
          draft.design.kicker ?? "",
          ...(draft.design.options ?? []),
          ...(draft.design.wrong ?? []),
          ...(draft.design.right ?? []),
          ...(draft.design.steps ?? []).flatMap((step) => [step.title, step.text]),
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
      kicker: z.string(),
      number: z.string(),
      options: z.array(z.string()),
      wrong: z.array(z.string()),
      right: z.array(z.string()),
      steps: z.array(z.object({ title: z.string(), text: z.string() })),
      scene: z.enum(INSTAGRAM_SCENES),
      cta: z.string(),
      caption: z.string(),
      hashtags: z.array(z.string()),
      firstComment: z.string(),
      featureKeys: z.array(z.string()),
    })
  ),
})

type RawPost = z.infer<typeof postsSchema>["posts"][number]

// Every post in the approved style: a scene photo (a different one per post this week) and a
// headline with one line under it, taken from whatever the writer filled in.
export function asApproved(draft: InstagramDraft, usedScenes: Set<string>): InstagramDraft {
  const design = draft.design
  let scene = design.scene && !usedScenes.has(design.scene) ? design.scene : undefined
  scene ??= INSTAGRAM_SCENES.find((entry) => !usedScenes.has(entry)) ?? "shop-night"
  usedScenes.add(scene)
  if (draft.template === APPROVED_TEMPLATE && design.scene === scene) return draft
  const sub =
    design.sub ||
    design.points?.[0] ||
    design.steps?.map((step) => step.title).join("، ") ||
    design.right?.join("، ") ||
    ""
  return {
    ...draft,
    template: APPROVED_TEMPLATE,
    design: {
      titleTop: design.titleTop,
      titleBottom: design.titleBottom,
      sub,
      cta: design.cta,
      scene,
    },
  }
}

const clean = (values: string[], max: number) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max)

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
  } else if (raw.template === "c") {
    design.cards = raw.cards
      .filter((card) => card.title.trim())
      .slice(0, 4)
      .map((card) => ({ icon: card.icon, title: card.title.trim(), text: card.text.trim() }))
  } else if (raw.template === "d") {
    design.kicker = raw.kicker.trim()
    design.number = raw.number.trim()
    design.chips = clean(raw.chips, 4)
  } else if (raw.template === "e") {
    design.kicker = raw.kicker.trim()
    design.options = clean(raw.options, 4)
  } else if (raw.template === "f") {
    design.wrong = clean(raw.wrong, 3)
    design.right = clean(raw.right, 3)
  } else if (raw.template === "g") {
    design.kicker = raw.kicker.trim()
    design.steps = raw.steps
      .filter((step) => step.title.trim())
      .slice(0, 3)
      .map((step) => ({ title: step.title.trim(), text: step.text.trim() }))
  } else if (raw.template === "j") {
    design.sub = raw.sub.trim()
    design.scene = raw.scene
  } else {
    design.sub = raw.sub.trim()
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

لكل منشور صورة مربعة بأحد هذه التصاميم المعتمدة (template). كلها بهوية مدار نفسها (كحلي وأزرق وفيروزي)، والاختلاف في الشكل فقط:
- a: صورة شخص في محل + سطر بحث (search، مثل «برنامج كاشير») + عنوان بسطرين + 3-4 نقاط (points) + زر (cta). استخدمه نادراً (مرة كل أسبوعين على الأكثر) لأن الصورة نفسها تتكرر.
- b: شاشة التطبيق الحقيقية على لابتوب وجوال + عنوان + سطر فرعي (sub) + ملصقان (chips) + الشاشة (screen: cashier الكاشير، products المنتجات، close إغلاق الوردية). لإظهار المنتج.
- c: أربع بطاقات (cards) بأيقونة (icon من: pos، store، ads، booking، inventory، invoice، loyalty، accounting، whatsapp، report، ai) وعنوان ونص قصيرين + عنوان. لعرض عدة مزايا.
- d: رقم كبير (number، مثل «4» أو «24/7») + سطر صغير فوقه (kicker) + عنوان بسطرين يشرح الرقم + حتى 4 ملصقات (chips). لحقيقة صحيحة قوية فقط (لا تخترع أرقاماً أو إحصاءات).
- e: «سؤال اليوم»: kicker («سؤال اليوم») + السؤال في سطرين (titleTop/titleBottom) + 4 خيارات قصيرة (options). للتفاعل والتعليقات.
- f: مقارنة «الطريقة القديمة» و«مع مدار»: titleTop = الموضوع (مثل «الجرد في محلك»)، titleBottom فارغ، و3 أسطر قصيرة لكل جهة (wrong للقديم، right لمدار). لإظهار الفرق.
- g: نصائح مرقمة: kicker («نصيحة الأسبوع») + عنوان بسطرين + 3 نصائح (steps: عنوان قصير ونص سطر). لمحتوى يحفظه الناس.
- h: جوال كبير فيه التقرير اليومي الحقيقي على واتساب + عنوان بسطرين + سطر (sub). للتقرير اليومي والأرقام اليومية.
- i: جملة واحدة قوية على خلفية بألوان مدار: titleTop وtitleBottom سطرا الجملة + سطر توضيح (sub). لرسالة قصيرة واضحة.
- j: صورة سينمائية حقيقية الشكل + عنوان كبير بسطرين + سطر (sub). اختر المشهد المناسب للموضوع (scene): shop-night صاحب محل عطور ليلاً، cafe-cashier كاشير مقهى مزدحم، phone-stock صاحب محل يتابع مخزونه بالجوال، salon استقبال صالون، laundry مغسلة ملابس، online-store صاحب متجر إلكتروني يجهز الطلبات، supermarket كاشير سوبرماركت، boutique محل عبايات وملابس، ads مدير تسويق أمام لوحة إعلانات، stocktake جرد بالباركود في المستودع، ramadan شارع محلات بزينة رمضان، payment دفع بالجوال عند الكاشير.

التصميم المعتمد حالياً (مهم جداً): كل المنشورات بالتصميم j فقط (الصورة السينمائية مع العنوان).
- اختر لكل منشور مشهداً (scene) مختلفاً يناسب موضوعه، ولا تكرر مشهداً في الأسبوع نفسه، وتجنب المشاهد المستخدمة مؤخراً (القائمة أدناه).
- العنوان بسطرين قويين مختصرين (السطر الثاني بلون مدار)، وsub جملة واحدة واضحة تشرح الفائدة.
- نوّع زوايا الكتابة بين المنشورات: سؤال يلفت الانتباه، مشكلة وحلها، رقم أو حقيقة صحيحة، نصيحة، أو مناسبة.

حدود المساحة (مهمة جداً، النص الأطول لا يظهر):
- titleTop وtitleBottom: كل سطر 18 حرفاً كحد أقصى (مثل «كل تجارتك» / «في مدار واحد»).
- search حتى 26 حرفاً، sub حتى 60 (و80 في i وj)، كل نقطة حتى 40، كل ملصق حتى 30، عنوان البطاقة حتى 14 ونصها حتى 34، الزر حتى 18.
- kicker حتى 24، number حتى 5، كل خيار حتى 26، كل سطر مقارنة حتى 26، عنوان النصيحة حتى 22 ونصها حتى 46.
- املأ كل الحقول دائماً؛ غير المستخدم في التصميم المختار اتركه "" أو []، وscreen = "cashier" وscene = "shop-night" إن لم يُستخدما.

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
${input.topPosts.length ? input.topPosts.map((post) => `- ${post.topic}: وصول ${post.reach}، إعجاب ${post.likes}`).join("\n") : "- لا توجد بيانات بعد"}

المشاهد المستخدمة في آخر المنشورات (الأحدث أولاً): ${input.recentScenes.length ? input.recentScenes.join("، ") : "لا شيء"}

المناسبات والمواسم:
- إذا وقعت مناسبة في الأيام الثمانية القادمة، خصص لها منشوراً واحداً (تهنئة في يومها، أو فكرة تفيد صاحب المحل قبلها). المواسم الكبيرة (رمضان، العيدين، اليوم الوطني، يوم التأسيس، موسم التخفيضات) يُكتب عنها قبلها بأسبوع إلى أسبوعين بنصائح للتجهيز.
- المناسبات الدينية بأسلوب محترم وهادئ: تهنئة بدون بيع مباشر يوم العيد أو يوم عرفة. والتواريخ الهجرية تقريبية: قل «قرّب رمضان» ولا تجزم بيوم محدد.
- اكتب في topic اسم المناسبة إن كان المنشور عنها. وإن لم توجد مناسبة قريبة فاكتب المنشورات العادية.
${input.occasions || "- لا توجد مناسبات قريبة معروفة"}`

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
