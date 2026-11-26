import { z } from "zod"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { ERRORS } from "../../application/errors/IdentityError"
import type { WhatsAppCampaignsService } from "../../whatsapp/campaigns"

type Send = (status: number, body: unknown) => void

const audienceSchema = z.object({
  kind: z.enum(["all", "recent", "inactive", "never", "spent", "loyalty"]),
  days: z.number().int().min(1).max(3650).optional(),
  minAmount: z.number().min(0).max(100_000_000).optional(),
  minPoints: z.number().int().min(0).max(100_000_000).optional(),
})

const offerSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1024),
  imageUrl: z.string().url().max(1000).nullable().optional(),
  buttonText: z.string().trim().max(25).nullable().optional(),
  buttonUrl: z.string().trim().max(1000).nullable().optional(),
})

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  offerId: z.string().uuid(),
  audience: audienceSchema,
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  consentConfirmed: z.boolean(),
})

const imageSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png"]),
  dataBase64: z.string().min(10).max(7_500_000),
})

// /v1/customers/campaigns/*: WhatsApp marketing campaigns to the business's own customers (see
// whatsapp/campaigns.ts). Customers' view permission to see them, edit to send.
export async function handleWhatsAppCampaignRoute(input: {
  method: string
  url: URL
  actor: AuthenticatedActor
  service: WhatsAppCampaignsService | null
  uploadImage:
    | ((organizationId: string, body: Buffer, contentType: string) => Promise<string>)
    | null
  send: Send
  readJsonBody: () => Promise<unknown>
}): Promise<boolean> {
  const { method, url, actor, service } = input
  if (!url.pathname.startsWith("/v1/customers/campaigns")) return false
  const send = (status: number, body: unknown) => {
    input.send(status, body)
    return true
  }
  if (!service) {
    return send(503, { code: "WHATSAPP_UNAVAILABLE", message: "WhatsApp is unavailable." })
  }
  const requireView = () => {
    if (!actor.modulePermissions.includes("customers:view")) throw ERRORS.forbidden()
  }
  const requireEdit = () => {
    if (!actor.modulePermissions.includes("customers:edit")) throw ERRORS.forbidden()
  }
  const org = actor.organizationId
  const path = url.pathname.slice("/v1/customers/campaigns".length)
  const body = () => input.readJsonBody()

  if (path === "" || path === "/") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listCampaigns(org) })
    }
    if (method === "POST") {
      requireEdit()
      return send(
        201,
        await service.createCampaign(org, campaignSchema.parse(await body()), actor.userId)
      )
    }
  }
  if (path === "/preview" && method === "POST") {
    requireView()
    const { audience } = z.object({ audience: audienceSchema }).parse(await body())
    return send(200, await service.preview(org, audience))
  }
  if (path === "/offers") {
    if (method === "GET") {
      requireView()
      return send(200, { items: await service.listOffers(org) })
    }
    if (method === "POST") {
      requireEdit()
      return send(
        201,
        await service.createOffer(org, offerSchema.parse(await body()), actor.userId)
      )
    }
  }
  const offerMatch = path.match(/^\/offers\/([0-9a-f-]{36})$/)
  if (offerMatch && method === "DELETE") {
    requireEdit()
    return send(200, await service.deleteOffer(org, offerMatch[1]))
  }
  if (path === "/images" && method === "POST") {
    requireEdit()
    if (!input.uploadImage) {
      return send(503, { code: "UPLOAD_UNAVAILABLE", message: "Uploads are unavailable." })
    }
    const payload = imageSchema.parse(await body())
    const buffer = Buffer.from(payload.dataBase64, "base64")
    // Meta takes a header picture of up to 5 MB.
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return send(422, { code: "IMAGE_TOO_LARGE", message: "A picture of up to 5 MB." })
    }
    return send(201, { url: await input.uploadImage(org, buffer, payload.contentType) })
  }
  const campaignMatch = path.match(/^\/([0-9a-f-]{36})(\/cancel)?$/)
  if (campaignMatch) {
    if (!campaignMatch[2] && method === "GET") {
      requireView()
      return send(200, await service.getCampaign(org, campaignMatch[1]))
    }
    if (campaignMatch[2] && method === "POST") {
      requireEdit()
      return send(200, await service.cancelCampaign(org, campaignMatch[1]))
    }
  }
  return false
}
