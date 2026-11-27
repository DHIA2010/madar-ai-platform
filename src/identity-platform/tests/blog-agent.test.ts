import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { BLOG_POSTS } from "../../features/marketing-site/blog/posts"
import {
  BlogAgent,
  type BlogPlanInput,
  type BlogTopic,
  type BlogWriteInput,
  type BlogWriter,
  formatPrices,
  normalizeBlocks,
} from "../blog/agent"
import { blocksToText, contentWarnings, slugify, textToBlocks } from "../blog/content"
import { nextPublishSlots, riyadhWeekStart } from "../blog/schedule"
import { BlogService } from "../blog/service"
import { STATIC_BLOG_POSTS } from "../blog/static-posts"
import type { BlogBlock } from "../blog/types"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

// Madar's blog agent: it writes the week's drafts on Sunday, nothing goes out before a person
// approves it, and approved articles go out on the next publishing days (Mon/Wed/Sat 10:00
// Riyadh by default). Readers' views and button taps are counted per article, and leads and
// sign-ups are credited to the article whose button they came from.

class FakeWriter implements BlogWriter {
  plans: BlogPlanInput[] = []
  writes: BlogWriteInput[] = []

  async plan(input: BlogPlanInput): Promise<BlogTopic[]> {
    this.plans.push(input)
    return Array.from({ length: input.count }, (_, index) => ({
      kind: index === 0 ? ("news" as const) : ("guide" as const),
      title: `Topic ${index + 1}`,
      targetKeyword: `topic ${index + 1}`,
      category: index === 0 ? ("campaigns" as const) : ("pos" as const),
      ctaApp: index === 0 ? ("campaigns" as const) : ("pos" as const),
      featureKeys: index === 0 ? ["campaign-coach"] : [],
      angle: "",
    }))
  }

  async write(input: BlogWriteInput) {
    this.writes.push(input)
    const price = input.topic.kind === "news" ? "999 ريال" : "99 ريال"
    return {
      title: `مقال ${input.topic.title}`,
      slug: input.topic.targetKeyword.replace(/ /g, "-"),
      excerpt: "وصف قصير للمقال يشرح الفائدة.",
      seoTitle: "عنوان البحث",
      seoDescription: "وصف البحث",
      keywords: ["كاشير"],
      body: [
        { type: "p", text: `مقدمة. السعر يبدأ من ${price} شهرياً.` },
        { type: "h2", id: "section-1", text: "القسم الأول" },
        { type: "p", text: "نص." },
      ] as BlogBlock[],
      faq: [{ question: "سؤال؟", answer: "جواب." }],
    }
  }
}

describe("blog agent and schedule", () => {
  let database: PostgresDatabase
  let clock: Date
  let blog: BlogService
  let writer: FakeWriter
  let notes: string[]
  let agent: BlogAgent

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
    // Sunday 29 Nov 2026, 09:00 Riyadh.
    clock = new Date("2026-11-29T06:00:00.000Z")
    blog = new BlogService(database, () => clock)
    writer = new FakeWriter()
    notes = []
    agent = new BlogAgent(
      database,
      blog,
      writer,
      async () => ({ text: "- pos / Basic: 99 ريال شهرياً", values: [99, 1099] }),
      async (text) => {
        notes.push(text)
      },
      () => clock
    )
  })

  it("writes the week's three drafts once on Sunday morning and tells the team", async () => {
    expect(await agent.tick()).toBe(3)
    // Same week, later tick: nothing more.
    clock = new Date("2026-11-29T09:00:00.000Z")
    expect(await agent.tick()).toBe(0)

    const posts = await blog.list()
    expect(posts).toHaveLength(3)
    expect(posts.every((post) => post.status === "draft" && post.weekStart === "2026-11-29")).toBe(
      true
    )
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain("(3)")
    expect(notes[0]).toContain("madar-admin/blog")

    // The planner saw the articles already on the site and the unannounced features.
    expect(writer.plans[0].existing.length).toBeGreaterThanOrEqual(STATIC_BLOG_POSTS.length)
    expect(writer.plans[0].whatsNew.some((entry) => entry.key === "campaign-coach")).toBe(true)

    // A price that isn't on Madar's list is flagged for the reviewer; a real one isn't.
    const news = posts.find((post) => post.kind === "news")!
    expect(news.warnings.join(" ")).toContain("999")
    expect(news.featureKeys).toEqual(["campaign-coach"])
    const guide = posts.find((post) => post.kind === "guide")!
    expect(guide.warnings).toEqual([])

    // Nothing is public before approval.
    expect(await blog.listPublished()).toEqual([])
  })

  it("doesn't write on other days, before 8:00, or when switched off", async () => {
    clock = new Date("2026-11-30T06:00:00.000Z") // Monday
    expect(await agent.tick()).toBe(0)
    clock = new Date("2026-11-29T04:00:00.000Z") // Sunday 07:00 Riyadh
    expect(await agent.tick()).toBe(0)
    await blog.updateSettings({ agentEnabled: false })
    clock = new Date("2026-11-29T06:00:00.000Z")
    expect(await agent.tick()).toBe(0)
  })

  it("a feature already written about isn't offered again", async () => {
    await agent.tick()
    clock = new Date("2026-12-06T06:00:00.000Z")
    await agent.tick()
    expect(writer.plans[1].whatsNew.some((entry) => entry.key === "campaign-coach")).toBe(false)
  })

  it("approving the week puts each article on the next publishing day at 10:00 Riyadh", async () => {
    await agent.tick()
    const approved = await blog.approveWeek("2026-11-29", "owner")
    expect(approved.map((post) => post.scheduledAt).sort()).toEqual([
      "2026-11-30T07:00:00.000Z", // Monday
      "2026-12-02T07:00:00.000Z", // Wednesday
      "2026-12-05T07:00:00.000Z", // Saturday
    ])
    expect(await blog.listPublished()).toEqual([])

    // Monday 10:05 Riyadh: the first one is out.
    clock = new Date("2026-11-30T07:05:00.000Z")
    const out = await blog.listPublished()
    expect(out).toHaveLength(1)
    expect(out[0].publishedAt).toBe("2026-11-30")

    // A published article keeps its link.
    const first = (await blog.list()).find((post) => post.slug === out[0].slug)!
    await expect(blog.update(first.id, { slug: "new-link" })).rejects.toThrow()
    // A scheduled one can go back to draft; the published one can't.
    const later = approved.find((post) => post.id !== first.id)!
    expect((await blog.unschedule(later.id)).status).toBe("draft")
    await expect(blog.unschedule(first.id)).rejects.toThrow()
  })

  it("a single approval skips days already taken", async () => {
    await agent.tick()
    const [a, b] = (await blog.list()).map((post) => post.id)
    const [first] = await blog.approve([a], "owner")
    const [second] = await blog.approve([b], "owner")
    expect(first.scheduledAt).toBe("2026-11-30T07:00:00.000Z")
    expect(second.scheduledAt).toBe("2026-12-02T07:00:00.000Z")
  })

  it("counts views, reading and taps, and credits leads and sign-ups to the article", async () => {
    await blog.recordEvent({ slug: "pos-guide", event: "view", visitorId: "v1", source: "google" })
    await blog.recordEvent({ slug: "pos-guide", event: "view", visitorId: "v1", source: "google" })
    await blog.recordEvent({ slug: "pos-guide", event: "view", visitorId: "v2", source: "direct" })
    await blog.recordEvent({ slug: "pos-guide", event: "read_50", visitorId: "v1" })
    await blog.recordEvent({ slug: "pos-guide", event: "cta_click", cta: "end", visitorId: "v1" })
    const fromBlog = JSON.stringify({
      first: { source: "google", campaign: null },
      last: { source: "blog", medium: "article", campaign: "pos-guide" },
    })
    await database.query(
      `INSERT INTO sales_leads (id, company_name, phone, attribution, created_at)
       VALUES ('00000000-0000-0000-0000-0000000000a1', 'Shop', '0500000000', $1::jsonb, $2)`,
      [fromBlog, clock.toISOString()]
    )
    const stats = await blog.stats(
      new Date(clock.getTime() - 86_400_000),
      new Date(clock.getTime() + 1000)
    )
    const row = stats.find((entry) => entry.slug === "pos-guide")!
    expect(row).toMatchObject({
      views: 3,
      visitors: 2,
      fromGoogle: 2,
      read50: 1,
      ctaClicks: 1,
      leads: 1,
      ctaBreakdown: { end: 1 },
    })
  })
})

describe("blog helpers", () => {
  it("next publishing slots follow the chosen days and hour", () => {
    const slots = nextPublishSlots({
      after: new Date("2026-11-30T08:00:00.000Z"), // Monday 11:00 Riyadh -- today's slot passed
      days: [1, 3, 6],
      hour: 10,
      takenDays: ["2026-12-02"],
      count: 2,
    })
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      "2026-12-05T07:00:00.000Z",
      "2026-12-07T07:00:00.000Z",
    ])
    expect(riyadhWeekStart(new Date("2026-12-02T12:00:00.000Z"))).toBe("2026-11-29")
  })

  it("flags prices that aren't Madar's and claims it must not make", () => {
    const warnings = contentWarnings({
      title: "الأفضل في السعودية",
      excerpt: "",
      body: [{ type: "p", text: "يبدأ من ٩٩ ريال، أو 1,234 ريال سنوياً، مع كود الخصم." }],
      faq: [],
      allowedPrices: [99],
    })
    expect(warnings.join(" | ")).toContain("1234")
    expect(warnings.join(" | ")).not.toContain("99،")
    expect(warnings.some((warning) => warning.includes("الأفضل"))).toBe(true)
    expect(warnings.some((warning) => warning.includes("خصم"))).toBe(true)
  })

  it("the editor's plain text turns back into the same blocks", () => {
    const blocks: BlogBlock[] = [
      { type: "p", text: "مقدمة" },
      { type: "h2", id: "section-1", text: "عنوان" },
      { type: "ul", items: ["أ", "ب"] },
      { type: "ol", items: ["واحد", "اثنان"] },
      { type: "callout", tone: "tip", title: "نصيحة", text: "نص النصيحة" },
      {
        type: "formula",
        label: "العائد",
        formula: "المبيعات ÷ الإنفاق",
        example: "1000 ÷ 250 = 4",
      },
    ]
    expect(textToBlocks(blocksToText(blocks))).toEqual(blocks)
  })

  it("slugs are latin and URL-safe; model blocks are cleaned", () => {
    expect(slugify("POS System for Small Shops!")).toBe("pos-system-for-small-shops")
    expect(slugify("كاشير")).toMatch(/^post-/)
    const empty = {
      text: "",
      items: [],
      title: "",
      tone: "tip" as const,
      label: "",
      formula: "",
      example: "",
    }
    expect(
      normalizeBlocks([
        { ...empty, type: "p", text: " نص " },
        { ...empty, type: "h2", text: "عنوان" },
        { ...empty, type: "ul", items: ["", "أ"] },
        { ...empty, type: "p" },
      ])
    ).toEqual([
      { type: "p", text: "نص" },
      { type: "h2", id: "section-1", text: "عنوان" },
      { type: "ul", items: ["أ"] },
    ])
  })

  it("the price list lists active packages in riyals", () => {
    const prices = formatPrices([
      {
        application: "pos",
        mode: "packages",
        visible: true,
        packages: [
          { name: "Basic", isActive: true, monthlyPriceHalalas: 9900, yearlyPriceHalalas: 109900 },
          { name: "Old", isActive: false, monthlyPriceHalalas: 5000, yearlyPriceHalalas: null },
        ],
      },
    ])
    expect(prices.values).toEqual([99, 1099])
    expect(prices.text).toContain("pos / Basic")
    expect(prices.text).not.toContain("Old")
  })

  it("the backend's list of code articles matches the website's", () => {
    expect(STATIC_BLOG_POSTS.map((post) => post.slug).sort()).toEqual(
      BLOG_POSTS.map((post) => post.slug).sort()
    )
  })
})
