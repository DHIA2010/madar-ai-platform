import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { nextPublishSlots, riyadhDay } from "./schedule"
import { STATIC_BLOG_POSTS } from "./static-posts"
import type {
  BlogBlock,
  BlogCategory,
  BlogCtaApp,
  BlogEvent,
  BlogFaq,
  BlogPostKind,
  BlogPostRecord,
  BlogSettings,
  PublicBlogPost,
} from "./types"

// Madar's blog articles in the database: drafts, approval, the publishing schedule, reader
// events and per-article results. Madar's own (no organization) -- only Madar Admin edits it.

type Row = Record<string, unknown>

const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

const iso = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const dateOnly = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function toRecord(row: Row): BlogPostRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.excerpt),
    category: String(row.category) as BlogCategory,
    body: json<BlogBlock[]>(row.body, []),
    faq: json<BlogFaq[]>(row.faq, []),
    seoTitle: (row.seo_title as string | null) ?? null,
    seoDescription: (row.seo_description as string | null) ?? null,
    keywords: json<string[]>(row.keywords, []),
    ctaApp: (row.cta_app as BlogCtaApp | null) ?? null,
    kind: (String(row.kind) as BlogPostKind) ?? "guide",
    featureKeys: json<string[]>(row.feature_keys, []),
    warnings: json<string[]>(row.warnings, []),
    status: String(row.status) as BlogPostRecord["status"],
    source: String(row.source) === "manual" ? "manual" : "agent",
    weekStart: dateOnly(row.week_start),
    scheduledAt: iso(row.scheduled_at),
    approvedAt: iso(row.approved_at),
    approvedBy: (row.approved_by as string | null) ?? null,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  }
}

export interface BlogDraftInput {
  slug: string
  title: string
  excerpt: string
  category: BlogCategory
  body: BlogBlock[]
  faq?: BlogFaq[]
  seoTitle?: string | null
  seoDescription?: string | null
  keywords?: string[]
  ctaApp?: BlogCtaApp | null
  kind?: BlogPostKind
  featureKeys?: string[]
  warnings?: string[]
  source?: "agent" | "manual"
  weekStart?: string | null
}

export type BlogPostPatch = Partial<
  Pick<
    BlogPostRecord,
    | "slug"
    | "title"
    | "excerpt"
    | "category"
    | "body"
    | "faq"
    | "seoTitle"
    | "seoDescription"
    | "keywords"
    | "ctaApp"
  >
>

export interface BlogPostStats {
  slug: string
  title: string
  views: number
  visitors: number
  fromGoogle: number
  read50: number
  read100: number
  ctaClicks: number
  leads: number
  signups: number
  customers: number
  ctaBreakdown: Record<string, number>
  daily: Array<{ day: string; views: number }>
}

export class BlogService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ---------- settings ----------

  async settings(): Promise<BlogSettings> {
    const result = await this.db.query<Row>(`SELECT * FROM blog_settings WHERE id = 1`)
    const row = result.rows[0]
    return {
      agentEnabled: row ? Boolean(row.agent_enabled) : true,
      postsPerWeek: row ? Number(row.posts_per_week) : 3,
      publishDays: row ? json<number[]>(row.publish_days, [1, 3, 6]) : [1, 3, 6],
      publishHour: row ? Number(row.publish_hour) : 10,
    }
  }

  async updateSettings(patch: Partial<BlogSettings>): Promise<BlogSettings> {
    const current = await this.settings()
    const next: BlogSettings = {
      agentEnabled: patch.agentEnabled ?? current.agentEnabled,
      postsPerWeek: Math.min(7, Math.max(1, patch.postsPerWeek ?? current.postsPerWeek)),
      publishDays: [
        ...new Set((patch.publishDays ?? current.publishDays).filter((d) => d >= 0 && d <= 6)),
      ].sort(),
      publishHour: Math.min(23, Math.max(0, patch.publishHour ?? current.publishHour)),
    }
    if (next.publishDays.length === 0)
      throw ERRORS.validation({ publishDays: "Pick at least one publishing day." })
    await this.db.query(
      `INSERT INTO blog_settings (id, agent_enabled, posts_per_week, publish_days, publish_hour, updated_at)
       VALUES (1, $1, $2, $3::jsonb, $4, now())
       ON CONFLICT (id) DO UPDATE SET agent_enabled = EXCLUDED.agent_enabled,
         posts_per_week = EXCLUDED.posts_per_week, publish_days = EXCLUDED.publish_days,
         publish_hour = EXCLUDED.publish_hour, updated_at = now()`,
      [next.agentEnabled, next.postsPerWeek, JSON.stringify(next.publishDays), next.publishHour]
    )
    return next
  }

  // ---------- the website ----------

  async listPublished(): Promise<PublicBlogPost[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM blog_posts
        WHERE status = 'approved' AND scheduled_at IS NOT NULL AND scheduled_at <= $1
        ORDER BY scheduled_at DESC`,
      [this.now().toISOString()]
    )
    return result.rows.map((row) => toPublic(toRecord(row)))
  }

  async getPublished(slug: string): Promise<PublicBlogPost | null> {
    const posts = await this.listPublished()
    return posts.find((post) => post.slug === slug) ?? null
  }

  // ---------- Madar Admin ----------

  async list(): Promise<BlogPostRecord[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM blog_posts ORDER BY COALESCE(scheduled_at, created_at) DESC`
    )
    return result.rows.map(toRecord)
  }

  async get(id: string): Promise<BlogPostRecord> {
    const result = await this.db.query<Row>(`SELECT * FROM blog_posts WHERE id = $1`, [id])
    if (!result.rows[0]) throw ERRORS.notFound("Blog article")
    return toRecord(result.rows[0])
  }

  async slugTaken(slug: string, exceptId: string | null = null): Promise<boolean> {
    const result = await this.db.query<Row>(`SELECT id FROM blog_posts WHERE slug = $1`, [slug])
    return result.rows.some((row) => String(row.id) !== exceptId)
  }

  async createDraft(input: BlogDraftInput): Promise<BlogPostRecord> {
    const id = randomUUID()
    let slug = input.slug
    for (let attempt = 2; await this.slugTaken(slug); attempt += 1)
      slug = `${input.slug}-${attempt}`
    await this.db.query(
      `INSERT INTO blog_posts (id, slug, title, excerpt, category, body, faq, seo_title,
         seo_description, keywords, cta_app, kind, feature_keys, warnings, status, source, week_start)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13::jsonb,
         $14::jsonb, 'draft', $15, $16)`,
      [
        id,
        slug,
        input.title,
        input.excerpt,
        input.category,
        JSON.stringify(input.body),
        JSON.stringify(input.faq ?? []),
        input.seoTitle ?? null,
        input.seoDescription ?? null,
        JSON.stringify(input.keywords ?? []),
        input.ctaApp ?? null,
        input.kind ?? "guide",
        JSON.stringify(input.featureKeys ?? []),
        JSON.stringify(input.warnings ?? []),
        input.source ?? "agent",
        input.weekStart ?? null,
      ]
    )
    return this.get(id)
  }

  async update(id: string, patch: BlogPostPatch): Promise<BlogPostRecord> {
    const current = await this.get(id)
    const published = this.isPublished(current)
    // A live article keeps its address: Google and shared links point to it.
    if (patch.slug !== undefined && patch.slug !== current.slug) {
      if (published) throw ERRORS.validation({ slug: "A published article's link can't change." })
      if (await this.slugTaken(patch.slug, id))
        throw ERRORS.conflict("BLOG_SLUG_TAKEN", "That link is already used.")
    }
    const next = { ...current, ...patch }
    await this.db.query(
      `UPDATE blog_posts SET slug = $2, title = $3, excerpt = $4, category = $5, body = $6::jsonb,
         faq = $7::jsonb, seo_title = $8, seo_description = $9, keywords = $10::jsonb, cta_app = $11,
         updated_at = now()
       WHERE id = $1`,
      [
        id,
        next.slug,
        next.title,
        next.excerpt,
        next.category,
        JSON.stringify(next.body),
        JSON.stringify(next.faq),
        next.seoTitle,
        next.seoDescription,
        JSON.stringify(next.keywords),
        next.ctaApp,
      ]
    )
    return this.get(id)
  }

  isPublished(post: BlogPostRecord): boolean {
    return (
      post.status === "approved" &&
      post.scheduledAt !== null &&
      Date.parse(post.scheduledAt) <= this.now().getTime()
    )
  }

  // Approves drafts in the given order, each on the next free publishing day.
  async approve(ids: string[], approvedBy: string): Promise<BlogPostRecord[]> {
    const settings = await this.settings()
    const posts = await Promise.all(ids.map((id) => this.get(id)))
    const drafts = posts.filter((post) => post.status === "draft")
    const taken = await this.takenDays()
    const slots = nextPublishSlots({
      after: this.now(),
      days: settings.publishDays,
      hour: settings.publishHour,
      takenDays: taken,
      count: drafts.length,
    })
    for (const [index, post] of drafts.entries()) {
      await this.db.query(
        `UPDATE blog_posts SET status = 'approved', scheduled_at = $2, approved_at = now(),
           approved_by = $3, updated_at = now()
         WHERE id = $1 AND status = 'draft'`,
        [post.id, slots[index].toISOString(), approvedBy]
      )
    }
    return Promise.all(ids.map((id) => this.get(id)))
  }

  // Every draft of a week, oldest first.
  async approveWeek(weekStart: string, approvedBy: string): Promise<BlogPostRecord[]> {
    const result = await this.db.query<Row>(
      `SELECT id FROM blog_posts WHERE status = 'draft' AND week_start = $1 ORDER BY created_at`,
      [weekStart]
    )
    return this.approve(
      result.rows.map((row) => String(row.id)),
      approvedBy
    )
  }

  async publishNow(id: string): Promise<BlogPostRecord> {
    const post = await this.get(id)
    if (post.status === "rejected")
      throw ERRORS.validation({ status: "A rejected article can't be published." })
    await this.db.query(
      `UPDATE blog_posts SET status = 'approved', scheduled_at = $2,
         approved_at = COALESCE(approved_at, now()), updated_at = now()
       WHERE id = $1`,
      [id, this.now().toISOString()]
    )
    return this.get(id)
  }

  // Back to draft: only while it hasn't gone out.
  async unschedule(id: string): Promise<BlogPostRecord> {
    const post = await this.get(id)
    if (this.isPublished(post))
      throw ERRORS.validation({ status: "This article is already published." })
    await this.db.query(
      `UPDATE blog_posts SET status = 'draft', scheduled_at = NULL, approved_at = NULL,
         approved_by = NULL, updated_at = now()
       WHERE id = $1`,
      [id]
    )
    return this.get(id)
  }

  async reject(id: string): Promise<BlogPostRecord> {
    await this.get(id)
    await this.db.query(
      `UPDATE blog_posts SET status = 'rejected', scheduled_at = NULL, updated_at = now() WHERE id = $1`,
      [id]
    )
    return this.get(id)
  }

  async remove(id: string): Promise<void> {
    await this.get(id)
    await this.db.query(`DELETE FROM blog_posts WHERE id = $1`, [id])
  }

  private async takenDays(): Promise<string[]> {
    const result = await this.db.query<Row>(
      `SELECT scheduled_at FROM blog_posts WHERE status = 'approved' AND scheduled_at > $1`,
      [this.now().toISOString()]
    )
    return result.rows
      .map((row) => iso(row.scheduled_at))
      .filter((value): value is string => value !== null)
      .map((value) => riyadhDay(new Date(value)))
  }

  // ---------- reader events and results ----------

  async recordEvent(input: {
    slug: string
    event: BlogEvent
    cta?: string | null
    visitorId?: string | null
    source?: string | null
    device?: string | null
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO blog_post_events (slug, event, cta, visitor_id, source, device, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.slug.slice(0, 120),
        input.event,
        input.cta?.slice(0, 48) ?? null,
        input.visitorId?.slice(0, 64) ?? null,
        input.source?.slice(0, 32) ?? null,
        input.device?.slice(0, 16) ?? null,
        this.now().toISOString(),
      ]
    )
  }

  // Each article's numbers between two instants. Leads and sign-ups are the ones whose
  // attribution says they came from that article (utm_source=blog, utm_campaign=<slug>).
  async stats(from: Date, to: Date): Promise<BlogPostStats[]> {
    const events = await this.db.query<Row>(
      `SELECT slug, event, cta, visitor_id, source, created_at FROM blog_post_events
        WHERE created_at >= $1 AND created_at < $2`,
      [from.toISOString(), to.toISOString()]
    )
    const bySlug = new Map<string, BlogPostStats & { visitorSet: Set<string> }>()
    const entry = (slug: string) => {
      let stats = bySlug.get(slug)
      if (!stats) {
        stats = {
          slug,
          title: slug,
          views: 0,
          visitors: 0,
          fromGoogle: 0,
          read50: 0,
          read100: 0,
          ctaClicks: 0,
          leads: 0,
          signups: 0,
          customers: 0,
          ctaBreakdown: {},
          daily: [],
          visitorSet: new Set(),
        }
        bySlug.set(slug, stats)
      }
      return stats
    }
    const dailyViews = new Map<string, Map<string, number>>()
    for (const row of events.rows) {
      const stats = entry(String(row.slug))
      switch (String(row.event)) {
        case "view": {
          stats.views += 1
          if (row.visitor_id) stats.visitorSet.add(String(row.visitor_id))
          if (row.source === "google") stats.fromGoogle += 1
          const day = riyadhDay(new Date(iso(row.created_at) ?? 0))
          const days = dailyViews.get(stats.slug) ?? new Map<string, number>()
          days.set(day, (days.get(day) ?? 0) + 1)
          dailyViews.set(stats.slug, days)
          break
        }
        case "read_50":
          stats.read50 += 1
          break
        case "read_100":
          stats.read100 += 1
          break
        case "cta_click": {
          stats.ctaClicks += 1
          const cta = String(row.cta ?? "other")
          stats.ctaBreakdown[cta] = (stats.ctaBreakdown[cta] ?? 0) + 1
          break
        }
      }
    }

    const fromBlog = (attribution: unknown): string | null => {
      const value = json<{ first?: Row | null; last?: Row | null } | null>(attribution, null)
      for (const touch of [value?.last, value?.first]) {
        if (touch && touch.source === "blog" && typeof touch.campaign === "string") {
          return touch.campaign
        }
      }
      return null
    }
    const leads = await this.db.query<Row>(
      `SELECT attribution FROM sales_leads WHERE created_at >= $1 AND created_at < $2
          AND attribution IS NOT NULL`,
      [from.toISOString(), to.toISOString()]
    )
    for (const row of leads.rows) {
      const slug = fromBlog(row.attribution)
      if (slug) entry(slug).leads += 1
    }
    const signups = await this.db.query<Row>(
      `SELECT attribution, stage FROM crm_leads WHERE created_at >= $1 AND created_at < $2
          AND organization_id IS NOT NULL AND attribution IS NOT NULL`,
      [from.toISOString(), to.toISOString()]
    )
    for (const row of signups.rows) {
      const slug = fromBlog(row.attribution)
      if (!slug) continue
      entry(slug).signups += 1
      if (row.stage === "won") entry(slug).customers += 1
    }

    const titles = new Map<string, string>(
      STATIC_BLOG_POSTS.map((post) => [post.slug, post.title] as [string, string])
    )
    const own = await this.db.query<Row>(`SELECT slug, title FROM blog_posts`)
    for (const row of own.rows) titles.set(String(row.slug), String(row.title))

    return [...bySlug.values()]
      .map(({ visitorSet, ...stats }) => ({
        ...stats,
        title: titles.get(stats.slug) ?? stats.slug,
        visitors: visitorSet.size,
        daily: [...(dailyViews.get(stats.slug) ?? new Map<string, number>()).entries()]
          .map(([day, views]) => ({ day, views }))
          .sort((left, right) => left.day.localeCompare(right.day)),
      }))
      .sort(
        (left, right) =>
          right.signups + right.leads - (left.signups + left.leads) || right.views - left.views
      )
  }
}

function toPublic(post: BlogPostRecord): PublicBlogPost {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    publishedAt: (post.scheduledAt ?? post.createdAt).slice(0, 10),
    body: post.body,
    faq: post.faq,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    keywords: post.keywords,
    ctaApp: post.ctaApp,
  }
}
