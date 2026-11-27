import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import type { BlogAgent } from "../../blog/agent"
import type { BlogService } from "../../blog/service"
import { BLOG_CATEGORIES, BLOG_CTA_APPS, BLOG_EVENTS } from "../../blog/types"
import { requirePlatformPermission } from "../../platform-admin/guard"

type Send = (status: number, body: unknown) => boolean

const SLUG = /^[a-z0-9][a-z0-9-]{1,118}$/

const blockSchema = z.union([
  z.object({ type: z.literal("p"), text: z.string().min(1).max(5000) }),
  z.object({ type: z.literal("h2"), id: z.string().max(80), text: z.string().min(1).max(300) }),
  z.object({ type: z.literal("h3"), text: z.string().min(1).max(300) }),
  z.object({ type: z.enum(["ul", "ol"]), items: z.array(z.string().max(1000)).min(1).max(40) }),
  z.object({
    type: z.literal("callout"),
    tone: z.enum(["tip", "note"]),
    title: z.string().max(300),
    text: z.string().max(2000),
  }),
  z.object({
    type: z.literal("formula"),
    label: z.string().max(300),
    formula: z.string().max(500),
    example: z.string().max(1000),
  }),
])

const patchSchema = z
  .object({
    slug: z.string().regex(SLUG),
    title: z.string().trim().min(5).max(200),
    excerpt: z.string().trim().min(10).max(500),
    category: z.enum(BLOG_CATEGORIES),
    body: z.array(blockSchema).min(1).max(200),
    faq: z
      .array(
        z.object({
          question: z.string().trim().min(3).max(300),
          answer: z.string().trim().min(3).max(1500),
        })
      )
      .max(12),
    seoTitle: z.string().trim().max(120).nullable(),
    seoDescription: z.string().trim().max(320).nullable(),
    keywords: z.array(z.string().trim().max(80)).max(15),
    ctaApp: z.enum(BLOG_CTA_APPS).nullable(),
  })
  .partial()

const createSchema = patchSchema.required({
  slug: true,
  title: true,
  excerpt: true,
  category: true,
  body: true,
})

const settingsSchema = z
  .object({
    agentEnabled: z.boolean(),
    postsPerWeek: z.number().int().min(1).max(7),
    publishDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    publishHour: z.number().int().min(0).max(23),
  })
  .partial()

const eventSchema = z.object({
  slug: z.string().regex(SLUG),
  event: z.enum(BLOG_EVENTS),
  cta: z.string().max(48).nullish(),
  visitorId: z.string().max(64).nullish(),
  source: z.string().max(32).nullish(),
  device: z.string().max(16).nullish(),
})

// Public: the articles that are out, and what readers do on them (www.madar.my).
export async function handlePublicBlogRoute(input: {
  method: string
  pathname: string
  blog: BlogService | null
  readJsonBody: () => Promise<unknown>
  send: Send
  limit: (bucket: string, max: number, windowMs: number) => Promise<boolean>
}): Promise<boolean> {
  if (!input.pathname.startsWith("/v1/public/blog/")) return false
  if (!input.blog) return input.send(404, { code: "NOT_FOUND", message: "Not found." })

  if (input.method === "GET" && input.pathname === "/v1/public/blog/posts") {
    return input.send(200, { posts: await input.blog.listPublished() })
  }
  const one = input.pathname.match(/^\/v1\/public\/blog\/posts\/([a-z0-9-]{2,120})$/)
  if (input.method === "GET" && one) {
    const post = await input.blog.getPublished(one[1])
    return post
      ? input.send(200, post)
      : input.send(404, { code: "NOT_FOUND", message: "Article not found." })
  }
  if (input.method === "POST" && input.pathname === "/v1/public/blog/events") {
    if (!(await input.limit("blog_events", 120, 10 * 60_000))) {
      return input.send(429, { code: "RATE_LIMITED", message: "Too many requests." })
    }
    const parsed = eventSchema.safeParse(await input.readJsonBody())
    if (!parsed.success) return input.send(400, { code: "VALIDATION_ERROR", message: "Bad event." })
    await input.blog.recordEvent(parsed.data)
    return input.send(200, { ok: true })
  }
  return false
}

// Madar Admin: /v1/platform-admin/blog/* -- drafts, approval, schedule, results, the agent.
export async function handleAdminBlogRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  blog: BlogService | null
  agent: BlogAgent | null
  readJsonBody: () => Promise<unknown>
  send: Send
}): Promise<boolean> {
  const prefix = "/v1/platform-admin/blog"
  const { method, url } = input
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false
  // The blog is marketing work: the same staff who run the CRM.
  requirePlatformPermission(input.actor, "crm:manage")
  const blog = input.blog
  if (!blog) return input.send(503, { code: "UNAVAILABLE", message: "Blog needs the database." })
  const path = url.pathname.slice(prefix.length) || "/"
  const who = input.actor.userId

  if (method === "GET" && path === "/posts") {
    return input.send(200, { posts: await blog.list() })
  }
  if (method === "POST" && path === "/posts") {
    const body = createSchema.parse(await input.readJsonBody())
    return input.send(201, await blog.createDraft({ ...body, source: "manual" }))
  }
  if (method === "GET" && path === "/settings") {
    return input.send(200, {
      settings: await blog.settings(),
      lastRun: input.agent ? await input.agent.lastRun() : null,
      agentAvailable: input.agent !== null,
    })
  }
  if (method === "PATCH" && path === "/settings") {
    return input.send(
      200,
      await blog.updateSettings(settingsSchema.parse(await input.readJsonBody()))
    )
  }
  if (method === "GET" && path === "/stats") {
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "30") || 30))
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    return input.send(200, { days, stats: await blog.stats(from, to) })
  }
  if (method === "POST" && path === "/approve-week") {
    const { weekStart } = z
      .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(await input.readJsonBody())
    return input.send(200, { posts: await blog.approveWeek(weekStart, who) })
  }
  if (method === "POST" && path === "/agent/run") {
    if (!input.agent) {
      return input.send(503, { code: "UNAVAILABLE", message: "The writing agent isn't set up." })
    }
    // Writing takes a few minutes: answer now, the drafts appear when done.
    void input.agent.runNow().catch(() => undefined)
    return input.send(202, { started: true })
  }

  const match = path.match(
    /^\/posts\/([0-9a-f-]{36})(\/approve|\/publish-now|\/unschedule|\/reject)?$/
  )
  if (!match) return false
  const [, id, action] = match
  if (!action && method === "GET") return input.send(200, await blog.get(id))
  if (!action && method === "PATCH") {
    return input.send(200, await blog.update(id, patchSchema.parse(await input.readJsonBody())))
  }
  if (!action && method === "DELETE") {
    await blog.remove(id)
    return input.send(200, { ok: true })
  }
  if (method === "POST" && action === "/approve") {
    const [post] = await blog.approve([id], who)
    return input.send(200, post)
  }
  if (method === "POST" && action === "/publish-now")
    return input.send(200, await blog.publishNow(id))
  if (method === "POST" && action === "/unschedule")
    return input.send(200, await blog.unschedule(id))
  if (method === "POST" && action === "/reject") return input.send(200, await blog.reject(id))
  return false
}
