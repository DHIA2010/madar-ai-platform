import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import { nextPublishSlots, riyadhDay } from "../blog/schedule"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type {
  InstagramConnection,
  InstagramDesign,
  InstagramInsights,
  InstagramPostRecord,
  InstagramSettings,
  InstagramTemplate,
} from "./types"

// Madar's Instagram posts in the database: drafts, approval, the publishing schedule and the
// connected account. Madar's own (no organization) -- only Madar Admin uses it.

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

function toRecord(row: Row): InstagramPostRecord {
  return {
    id: String(row.id),
    template: String(row.template) as InstagramTemplate,
    design: json<InstagramDesign>(row.design, { titleTop: "", titleBottom: "", cta: "" }),
    caption: String(row.caption ?? ""),
    hashtags: json<string[]>(row.hashtags, []),
    firstComment: (row.first_comment as string | null) ?? null,
    topic: (row.topic as string | null) ?? null,
    kind: (String(row.kind ?? "tip") as InstagramPostRecord["kind"]) ?? "tip",
    featureKeys: json<string[]>(row.feature_keys, []),
    warnings: json<string[]>(row.warnings, []),
    imageUrl: (row.image_url as string | null) ?? null,
    status: String(row.status) as InstagramPostRecord["status"],
    source: String(row.source) === "manual" ? "manual" : "agent",
    weekStart: dateOnly(row.week_start),
    scheduledAt: iso(row.scheduled_at),
    approvedAt: iso(row.approved_at),
    publishedAt: iso(row.published_at),
    igMediaId: (row.ig_media_id as string | null) ?? null,
    permalink: (row.permalink as string | null) ?? null,
    publishAttempts: Number(row.publish_attempts) || 0,
    lastError: (row.last_error as string | null) ?? null,
    insights: json<InstagramInsights | null>(row.insights, null),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  }
}

export interface InstagramDraftInput {
  template: InstagramTemplate
  design: InstagramDesign
  caption: string
  hashtags?: string[]
  firstComment?: string | null
  topic?: string | null
  kind?: InstagramPostRecord["kind"]
  featureKeys?: string[]
  warnings?: string[]
  source?: "agent" | "manual"
  weekStart?: string | null
}

export type InstagramPostPatch = Partial<
  Pick<InstagramPostRecord, "template" | "design" | "caption" | "hashtags" | "firstComment">
>

export class InstagramService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ---------- settings and the connected account ----------

  private async settingsRow(): Promise<Row | undefined> {
    const result = await this.db.query<Row>(`SELECT * FROM instagram_settings WHERE id = 1`)
    return result.rows[0]
  }

  async settings(): Promise<InstagramSettings> {
    const row = await this.settingsRow()
    return {
      agentEnabled: row ? Boolean(row.agent_enabled) : true,
      postsPerWeek: row ? Number(row.posts_per_week) : 3,
      publishDays: row ? json<number[]>(row.publish_days, [0, 2, 4]) : [0, 2, 4],
      publishHour: row ? Number(row.publish_hour) : 20,
    }
  }

  async updateSettings(patch: Partial<InstagramSettings>): Promise<InstagramSettings> {
    const current = await this.settings()
    const next: InstagramSettings = {
      agentEnabled: patch.agentEnabled ?? current.agentEnabled,
      postsPerWeek: Math.min(7, Math.max(1, patch.postsPerWeek ?? current.postsPerWeek)),
      publishDays: [
        ...new Set((patch.publishDays ?? current.publishDays).filter((d) => d >= 0 && d <= 6)),
      ].sort(),
      publishHour: Math.min(23, Math.max(0, patch.publishHour ?? current.publishHour)),
    }
    if (next.publishDays.length === 0) {
      throw ERRORS.validation({ publishDays: "Pick at least one publishing day." })
    }
    await this.db.query(
      `UPDATE instagram_settings SET agent_enabled = $1, posts_per_week = $2,
         publish_days = $3::jsonb, publish_hour = $4, updated_at = now()
       WHERE id = 1`,
      [next.agentEnabled, next.postsPerWeek, JSON.stringify(next.publishDays), next.publishHour]
    )
    return next
  }

  async connection(): Promise<InstagramConnection> {
    const row = await this.settingsRow()
    return {
      connected: Boolean(row?.ig_user_id && row?.sealed_page_token),
      pageName: (row?.page_name as string | null) ?? null,
      igUsername: (row?.ig_username as string | null) ?? null,
      igPictureUrl: (row?.ig_picture_url as string | null) ?? null,
      connectedAt: iso(row?.connected_at),
    }
  }

  // What publishing needs: the Instagram user id and the sealed page token.
  async credentials(): Promise<{ igUserId: string; sealedPageToken: string } | null> {
    const row = await this.settingsRow()
    if (!row?.ig_user_id || !row?.sealed_page_token) return null
    return { igUserId: String(row.ig_user_id), sealedPageToken: String(row.sealed_page_token) }
  }

  async saveConnection(input: {
    pageId: string
    pageName: string
    igUserId: string
    igUsername: string
    igPictureUrl: string | null
    sealedPageToken: string
    connectedBy: string
  }): Promise<void> {
    await this.db.query(
      `UPDATE instagram_settings SET page_id = $1, page_name = $2, ig_user_id = $3,
         ig_username = $4, ig_picture_url = $5, sealed_page_token = $6, connected_at = $7,
         connected_by = $8, updated_at = now()
       WHERE id = 1`,
      [
        input.pageId,
        input.pageName,
        input.igUserId,
        input.igUsername,
        input.igPictureUrl,
        input.sealedPageToken,
        this.now().toISOString(),
        input.connectedBy,
      ]
    )
  }

  async disconnect(): Promise<void> {
    await this.db.query(
      `UPDATE instagram_settings SET page_id = NULL, page_name = NULL, ig_user_id = NULL,
         ig_username = NULL, ig_picture_url = NULL, sealed_page_token = NULL,
         connected_at = NULL, updated_at = now()
       WHERE id = 1`
    )
  }

  async saveState(state: string, userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO instagram_oauth_states (state, user_id, expires_at) VALUES ($1, $2, $3)`,
      [state, userId, new Date(this.now().getTime() + 10 * 60_000).toISOString()]
    )
  }

  // The user who started the sign-in, once; null when unknown or expired.
  async consumeState(state: string): Promise<string | null> {
    const result = await this.db.query<Row>(
      `SELECT user_id, expires_at FROM instagram_oauth_states WHERE state = $1`,
      [state]
    )
    await this.db.query(`DELETE FROM instagram_oauth_states WHERE state = $1`, [state])
    const row = result.rows[0]
    if (!row) return null
    if (Date.parse(iso(row.expires_at) ?? "") < this.now().getTime()) return null
    return String(row.user_id)
  }

  // ---------- posts ----------

  async list(): Promise<InstagramPostRecord[]> {
    const result = await this.db.query<Row>(
      `SELECT * FROM instagram_posts ORDER BY COALESCE(scheduled_at, created_at) DESC`
    )
    return result.rows.map(toRecord)
  }

  async get(id: string): Promise<InstagramPostRecord> {
    const result = await this.db.query<Row>(`SELECT * FROM instagram_posts WHERE id = $1`, [id])
    if (!result.rows[0]) throw ERRORS.notFound("Instagram post")
    return toRecord(result.rows[0])
  }

  async createDraft(input: InstagramDraftInput): Promise<InstagramPostRecord> {
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO instagram_posts (id, template, design, caption, hashtags, first_comment, topic,
         kind, feature_keys, warnings, status, source, week_start, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, 'draft', $11,
         $12, $13, $13)`,
      [
        id,
        input.template,
        JSON.stringify(input.design),
        input.caption,
        JSON.stringify(input.hashtags ?? []),
        input.firstComment ?? null,
        input.topic ?? null,
        input.kind ?? "tip",
        JSON.stringify(input.featureKeys ?? []),
        JSON.stringify(input.warnings ?? []),
        input.source ?? "agent",
        input.weekStart ?? null,
        this.now().toISOString(),
      ]
    )
    return this.get(id)
  }

  // Editing a post drops its image: the page makes a new one from the new words.
  async update(id: string, patch: InstagramPostPatch): Promise<InstagramPostRecord> {
    const current = await this.get(id)
    if (current.status === "published" || current.status === "publishing") {
      throw ERRORS.validation({ status: "A published post can't be edited." })
    }
    const next = { ...current, ...patch }
    await this.db.query(
      `UPDATE instagram_posts SET template = $2, design = $3::jsonb, caption = $4,
         hashtags = $5::jsonb, first_comment = $6, image_url = NULL, updated_at = now()
       WHERE id = $1`,
      [
        id,
        next.template,
        JSON.stringify(next.design),
        next.caption,
        JSON.stringify(next.hashtags),
        next.firstComment,
      ]
    )
    return this.get(id)
  }

  async setImage(id: string, imageUrl: string): Promise<InstagramPostRecord> {
    await this.get(id)
    await this.db.query(
      `UPDATE instagram_posts SET image_url = $2, updated_at = now() WHERE id = $1`,
      [id, imageUrl]
    )
    return this.get(id)
  }

  // Approves drafts in order, each on the next free publishing day. Every post needs its image
  // first (the Madar Admin page makes and uploads it just before approving).
  async approve(ids: string[], approvedBy: string): Promise<InstagramPostRecord[]> {
    const settings = await this.settings()
    const posts = await Promise.all(ids.map((id) => this.get(id)))
    const drafts = posts.filter((post) => post.status === "draft" || post.status === "failed")
    if (drafts.some((post) => !post.imageUrl)) {
      throw ERRORS.validation({ image: "Every post needs its image before approval." })
    }
    const slots = nextPublishSlots({
      after: this.now(),
      days: settings.publishDays,
      hour: settings.publishHour,
      takenDays: await this.takenDays(),
      count: drafts.length,
    })
    for (const [index, post] of drafts.entries()) {
      await this.db.query(
        `UPDATE instagram_posts SET status = 'approved', scheduled_at = $2, approved_at = $4,
           approved_by = $3, publish_attempts = 0, last_error = NULL, updated_at = now()
         WHERE id = $1`,
        [post.id, slots[index].toISOString(), approvedBy, this.now().toISOString()]
      )
    }
    return Promise.all(ids.map((id) => this.get(id)))
  }

  async approveWeek(weekStart: string, approvedBy: string): Promise<InstagramPostRecord[]> {
    const result = await this.db.query<Row>(
      `SELECT id FROM instagram_posts WHERE status = 'draft' AND week_start = $1 ORDER BY created_at`,
      [weekStart]
    )
    return this.approve(
      result.rows.map((row) => String(row.id)),
      approvedBy
    )
  }

  // Goes out on the next publishing pass (within a few minutes).
  async publishNow(id: string): Promise<InstagramPostRecord> {
    const post = await this.get(id)
    if (!post.imageUrl) throw ERRORS.validation({ image: "The post has no image yet." })
    if (!["draft", "approved", "failed"].includes(post.status)) {
      throw ERRORS.validation({ status: "This post can't be published now." })
    }
    await this.db.query(
      `UPDATE instagram_posts SET status = 'approved', scheduled_at = $2,
         approved_at = COALESCE(approved_at, $2), publish_attempts = 0, last_error = NULL,
         updated_at = now()
       WHERE id = $1`,
      [id, this.now().toISOString()]
    )
    return this.get(id)
  }

  async unschedule(id: string): Promise<InstagramPostRecord> {
    const post = await this.get(id)
    if (post.status !== "approved" && post.status !== "failed") {
      throw ERRORS.validation({ status: "Only a scheduled post can go back to review." })
    }
    await this.db.query(
      `UPDATE instagram_posts SET status = 'draft', scheduled_at = NULL, approved_at = NULL,
         approved_by = NULL, updated_at = now()
       WHERE id = $1`,
      [id]
    )
    return this.get(id)
  }

  async reject(id: string): Promise<InstagramPostRecord> {
    const post = await this.get(id)
    if (post.status === "published" || post.status === "publishing") {
      throw ERRORS.validation({ status: "A published post can't be rejected." })
    }
    await this.db.query(
      `UPDATE instagram_posts SET status = 'rejected', scheduled_at = NULL, updated_at = now()
       WHERE id = $1`,
      [id]
    )
    return this.get(id)
  }

  async remove(id: string): Promise<void> {
    const post = await this.get(id)
    if (post.status === "published" || post.status === "publishing") {
      throw ERRORS.validation({ status: "A published post stays on Instagram; delete it there." })
    }
    await this.db.query(`DELETE FROM instagram_posts WHERE id = $1`, [id])
  }

  private async takenDays(): Promise<string[]> {
    const result = await this.db.query<Row>(
      `SELECT scheduled_at FROM instagram_posts WHERE status = 'approved' AND scheduled_at > $1`,
      [this.now().toISOString()]
    )
    return result.rows
      .map((row) => iso(row.scheduled_at))
      .filter((value): value is string => value !== null)
      .map((value) => riyadhDay(new Date(value)))
  }

  // ---------- publishing ----------

  // Approved posts whose time has come, claimed one by one so two servers never post twice.
  async claimDue(limit = 3): Promise<InstagramPostRecord[]> {
    const due = await this.db.query<Row>(
      `SELECT id FROM instagram_posts
        WHERE status = 'approved' AND scheduled_at IS NOT NULL AND scheduled_at <= $1
        ORDER BY scheduled_at LIMIT $2`,
      [this.now().toISOString(), limit]
    )
    const claimed: InstagramPostRecord[] = []
    for (const row of due.rows) {
      const result = await this.db.query<Row>(
        `UPDATE instagram_posts SET status = 'publishing', publish_attempts = publish_attempts + 1,
           updated_at = now()
         WHERE id = $1 AND status = 'approved'
         RETURNING id`,
        [row.id]
      )
      if (result.rows.length > 0) claimed.push(await this.get(String(row.id)))
    }
    return claimed
  }

  async markPublished(id: string, mediaId: string, permalink: string | null): Promise<void> {
    await this.db.query(
      `UPDATE instagram_posts SET status = 'published', ig_media_id = $2, permalink = $3,
         published_at = $4, last_error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, mediaId, permalink, this.now().toISOString()]
    )
  }

  // A failed try goes back to the queue (a few minutes later) up to 3 times, then stops.
  async markFailed(id: string, error: string): Promise<"retry" | "failed"> {
    const post = await this.get(id)
    const final = post.publishAttempts >= 3
    await this.db.query(
      `UPDATE instagram_posts SET status = $2, last_error = $3,
         scheduled_at = CASE WHEN $4 THEN scheduled_at ELSE $5 END, updated_at = now()
       WHERE id = $1`,
      [
        id,
        final ? "failed" : "approved",
        error.slice(0, 500),
        final,
        new Date(this.now().getTime() + 10 * 60_000).toISOString(),
      ]
    )
    return final ? "failed" : "retry"
  }

  async saveInsights(id: string, insights: InstagramInsights): Promise<void> {
    await this.db.query(
      `UPDATE instagram_posts SET insights = $2::jsonb, insights_at = $3 WHERE id = $1`,
      [id, JSON.stringify(insights), this.now().toISOString()]
    )
  }

  // Sign-ups and leads that came from Instagram (the bio link's utm_source=instagram).
  async instagramSignups(from: Date, to: Date): Promise<{ signups: number; leads: number }> {
    const fromInstagram = (attribution: unknown) => {
      const value = json<{ first?: Row | null; last?: Row | null } | null>(attribution, null)
      return [value?.first, value?.last].some(
        (touch) =>
          typeof touch?.source === "string" && touch.source.toLowerCase().includes("instagram")
      )
    }
    const signups = await this.db.query<Row>(
      `SELECT attribution FROM crm_leads WHERE created_at >= $1 AND created_at < $2
          AND organization_id IS NOT NULL AND attribution IS NOT NULL`,
      [from.toISOString(), to.toISOString()]
    )
    const leads = await this.db.query<Row>(
      `SELECT attribution FROM sales_leads WHERE created_at >= $1 AND created_at < $2
          AND attribution IS NOT NULL`,
      [from.toISOString(), to.toISOString()]
    )
    return {
      signups: signups.rows.filter((row) => fromInstagram(row.attribution)).length,
      leads: leads.rows.filter((row) => fromInstagram(row.attribution)).length,
    }
  }
}
