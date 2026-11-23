import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import type { CrmOutreach } from "../../crm/outreach"

type Send = (status: number, body: unknown) => boolean

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(1500),
  linkUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((value) => /^https:\/\//i.test(value), "The link must start with https://"),
  linkTitle: optional(120),
  linkDescription: optional(200),
  imageUrl: optional(600),
  dailyLimit: z.number().int().min(1).max(200),
})
const leadsQuerySchema = z.object({
  tag: z.string().trim().max(60).optional(),
  source: z.string().trim().max(20).optional(),
  status: z.enum(["pending", "sent", "all"]).optional(),
})
const imageSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1).max(8_000_000),
})
const repliedSchema = z.object({ replied: z.boolean() })
const UUID = "[0-9a-f-]{36}"

// Madar Admin -> CRM -> WhatsApp messages (/v1/platform-admin/crm/outreach/*). The permission
// (crm:manage) is checked by the service on every call.
export async function handleCrmOutreachRoute(input: {
  method: string
  // The path after "/crm".
  route: string
  query: Record<string, string>
  actor: AuthenticatedActor
  outreach: CrmOutreach
  // Saves the message's picture and answers with its address; absent where files cannot be kept.
  uploadImage: ((body: Buffer, contentType: string) => Promise<string>) | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, route, actor, outreach, send, readJsonBody } = input

  if (route === "/outreach") {
    if (method === "GET") return send(200, { items: await outreach.list(actor) })
    if (method === "POST") {
      return send(201, await outreach.create(actor, campaignSchema.parse(await readJsonBody())))
    }
  }
  if (method === "POST" && route === "/outreach/images") {
    // Read first, so someone without the permission is refused before anything is stored.
    await outreach.list(actor)
    if (!input.uploadImage) {
      return send(503, { code: "CRM_OUTREACH_UPLOAD_UNAVAILABLE", message: "Uploads are off." })
    }
    const payload = imageSchema.parse(await readJsonBody())
    const body = Buffer.from(payload.dataBase64, "base64")
    if (body.length === 0 || body.length > 5 * 1024 * 1024) {
      return send(422, { code: "CRM_OUTREACH_IMAGE_TOO_LARGE", message: "An image up to 5 MB." })
    }
    return send(201, { url: await input.uploadImage(body, payload.contentType) })
  }

  const campaign = route.match(new RegExp(`^/outreach/(${UUID})$`))
  if (campaign) {
    if (method === "PUT") {
      return send(
        200,
        await outreach.update(actor, campaign[1], campaignSchema.parse(await readJsonBody()))
      )
    }
    if (method === "DELETE") {
      await outreach.archive(actor, campaign[1])
      return send(200, { ok: true })
    }
  }
  const leads = route.match(new RegExp(`^/outreach/(${UUID})/leads$`))
  if (leads && method === "GET") {
    return send(200, await outreach.leads(actor, leads[1], leadsQuerySchema.parse(input.query)))
  }
  const lead = route.match(new RegExp(`^/outreach/(${UUID})/leads/(${UUID})/(send|undo|replied)$`))
  if (lead && method === "POST") {
    const [, campaignId, leadId, action] = lead
    if (action === "send") return send(200, await outreach.send(actor, campaignId, leadId))
    if (action === "undo") {
      await outreach.undo(actor, campaignId, leadId)
      return send(200, { ok: true })
    }
    const { replied } = repliedSchema.parse(await readJsonBody())
    await outreach.setReplied(actor, campaignId, leadId, replied)
    return send(200, { ok: true })
  }
  return send(404, { code: "NOT_FOUND", message: "Route not found." })
}

// The link in a message (/v1/public/outreach/<code>): what its card shows and where it leads,
// and the count of a tap. No login; `limit` answers whether this caller may go on.
export async function handlePublicOutreachRoute(input: {
  method: string
  pathname: string
  outreach: CrmOutreach | null
  send: Send
  limit: (bucket: string, max: number, windowMs: number) => Promise<boolean>
}): Promise<boolean> {
  const match = input.pathname.match(/^\/v1\/public\/outreach\/([A-Za-z0-9_-]{6,16})(\/click)?$/)
  if (!match) return false
  const missing = () => input.send(404, { code: "NOT_FOUND", message: "Link not found." })
  if (!input.outreach) return missing()
  if (!(await input.limit("crm_outreach_link", 60, 60_000))) {
    return input.send(429, { code: "RATE_LIMITED", message: "Too many requests." })
  }
  if (input.method === "GET" && !match[2]) {
    const link = await input.outreach.publicLink(match[1])
    return link ? input.send(200, link) : missing()
  }
  if (input.method === "POST" && match[2]) {
    return (await input.outreach.recordClick(match[1])) ? input.send(200, { ok: true }) : missing()
  }
  return missing()
}
