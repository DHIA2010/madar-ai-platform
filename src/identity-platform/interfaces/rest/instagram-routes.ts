import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import type { InstagramAgent } from "../../instagram/agent"
import type { InstagramConnector, InstagramPublisher } from "../../instagram/publisher"
import type { InstagramService } from "../../instagram/service"
import {
  INSTAGRAM_ICONS,
  INSTAGRAM_SCENES,
  INSTAGRAM_SCREENS,
  INSTAGRAM_TEMPLATES,
} from "../../instagram/types"
import { requirePlatformPermission } from "../../platform-admin/guard"

type Send = (status: number, body: unknown) => boolean

const designSchema = z.object({
  titleTop: z.string().trim().max(60),
  titleBottom: z.string().trim().max(60),
  search: z.string().trim().max(80).optional(),
  sub: z.string().trim().max(160).optional(),
  points: z.array(z.string().trim().max(120)).max(5).optional(),
  chips: z.array(z.string().trim().max(80)).max(4).optional(),
  screen: z.enum(INSTAGRAM_SCREENS).optional(),
  cards: z
    .array(
      z.object({
        icon: z.enum(INSTAGRAM_ICONS),
        title: z.string().trim().max(40),
        text: z.string().trim().max(100),
      })
    )
    .max(4)
    .optional(),
  kicker: z.string().trim().max(60).optional(),
  number: z.string().trim().max(12).optional(),
  options: z.array(z.string().trim().max(60)).max(4).optional(),
  wrong: z.array(z.string().trim().max(60)).max(3).optional(),
  right: z.array(z.string().trim().max(60)).max(3).optional(),
  steps: z
    .array(z.object({ title: z.string().trim().max(60), text: z.string().trim().max(120) }))
    .max(3)
    .optional(),
  scene: z.enum(INSTAGRAM_SCENES).optional(),
  cta: z.string().trim().max(40),
})

const patchSchema = z
  .object({
    template: z.enum(INSTAGRAM_TEMPLATES),
    design: designSchema,
    caption: z.string().trim().min(1).max(2200),
    hashtags: z.array(z.string().trim().max(60)).max(30),
    firstComment: z.string().trim().max(500).nullable(),
  })
  .partial()

const settingsSchema = z
  .object({
    agentEnabled: z.boolean(),
    postsPerWeek: z.number().int().min(1).max(7),
    publishDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    publishHour: z.number().int().min(0).max(23),
  })
  .partial()

const imageSchema = z.object({
  contentType: z.literal("image/jpeg"),
  // A 1080×1080 JPEG; base64 of a few hundred KB.
  dataBase64: z.string().min(100).max(12_000_000),
})

// Madar Admin: /v1/platform-admin/instagram/* -- the account, the posts, approval, results.
export async function handleAdminInstagramRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: InstagramService | null
  connector: InstagramConnector | null
  publisher: InstagramPublisher | null
  agent: InstagramAgent | null
  uploadImage: ((body: Buffer, key: string) => Promise<string>) | null
  readJsonBody: () => Promise<unknown>
  send: Send
}): Promise<boolean> {
  const prefix = "/v1/platform-admin/instagram"
  const { method, url } = input
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false
  // Marketing work: the same staff who run the CRM and the blog.
  requirePlatformPermission(input.actor, "crm:manage")
  const service = input.service
  if (!service) return input.send(503, { code: "UNAVAILABLE", message: "Needs the database." })
  const path = url.pathname.slice(prefix.length) || "/"
  const who = input.actor.userId

  if (method === "GET" && path === "/status") {
    return input.send(200, {
      connection: await service.connection(),
      settings: await service.settings(),
      lastRun: input.agent ? await input.agent.lastRun() : null,
      agentAvailable: input.agent !== null,
    })
  }
  if (method === "PATCH" && path === "/settings") {
    return input.send(
      200,
      await service.updateSettings(settingsSchema.parse(await input.readJsonBody()))
    )
  }
  if (method === "POST" && path === "/connect") {
    if (!input.connector) {
      return input.send(503, { code: "UNAVAILABLE", message: "Meta sign-in isn't set up here." })
    }
    return input.send(200, { url: await input.connector.start(who) })
  }
  if (method === "POST" && path === "/disconnect") {
    await service.disconnect()
    return input.send(200, { ok: true })
  }
  if (method === "GET" && path === "/posts") {
    return input.send(200, { posts: await service.list() })
  }
  if (method === "GET" && path === "/stats") {
    if (input.publisher) await input.publisher.refreshInsights().catch(() => undefined)
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 86_400_000)
    return input.send(200, {
      posts: (await service.list()).filter((post) => post.status === "published"),
      fromInstagram: await service.instagramSignups(from, to),
    })
  }
  if (method === "POST" && path === "/approve-week") {
    const { weekStart } = z
      .object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(await input.readJsonBody())
    return input.send(200, { posts: await service.approveWeek(weekStart, who) })
  }
  if (method === "POST" && path === "/agent/run") {
    if (!input.agent) {
      return input.send(503, { code: "UNAVAILABLE", message: "The writing agent isn't set up." })
    }
    void input.agent.runNow().catch(() => undefined)
    return input.send(202, { started: true })
  }

  const match = path.match(
    /^\/posts\/([0-9a-f-]{36})(\/image|\/approve|\/publish-now|\/unschedule|\/reject)?$/
  )
  if (!match) return false
  const [, id, action] = match
  if (!action && method === "PATCH") {
    return input.send(200, await service.update(id, patchSchema.parse(await input.readJsonBody())))
  }
  if (!action && method === "DELETE") {
    await service.remove(id)
    return input.send(200, { ok: true })
  }
  if (method === "POST" && action === "/image") {
    if (!input.uploadImage) {
      return input.send(503, { code: "UNAVAILABLE", message: "Image storage isn't set up here." })
    }
    const body = imageSchema.parse(await input.readJsonBody())
    const bytes = Buffer.from(body.dataBase64, "base64")
    // A new name each time: Instagram and browsers must never get an old cached image.
    const imageUrl = await input.uploadImage(bytes, `${id}-${Date.now().toString(36)}.jpg`)
    return input.send(200, await service.setImage(id, imageUrl))
  }
  if (method === "POST" && action === "/approve") {
    const [post] = await service.approve([id], who)
    return input.send(200, post)
  }
  if (method === "POST" && action === "/publish-now") {
    const post = await service.publishNow(id)
    // Don't wait for the timer.
    if (input.publisher) void input.publisher.tick().catch(() => undefined)
    return input.send(200, post)
  }
  if (method === "POST" && action === "/unschedule")
    return input.send(200, await service.unschedule(id))
  if (method === "POST" && action === "/reject") return input.send(200, await service.reject(id))
  return false
}
