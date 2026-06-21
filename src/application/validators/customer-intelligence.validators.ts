import { z } from "zod"

export const trackingEventNameSchema = z.enum([
  "page_view",
  "product_view",
  "category_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "begin_checkout",
  "purchase",
  "login",
  "signup",
  "logout",
  "wishlist_add",
  "wishlist_remove",
  "coupon_apply",
  "campaign_click",
  "campaign_impression",
])

const trackingBaseSchema = {
  visitorId: z.string().min(1),
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),
  page: z.string().min(1),
  source: z.string().min(1),
  medium: z.string().min(1),
  campaign: z.string().min(1),
  device: z.string().min(1),
  browser: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
}

export const startSessionSchema = z.object({
  visitorId: z.string().min(1),
  startedAt: z.string().datetime(),
  entryPage: z.string().min(1),
  source: z.string().min(1),
  medium: z.string().min(1),
  campaign: z.string().min(1),
  device: z.string().min(1),
  browser: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
})

export const endSessionSchema = z.object({
  sessionId: z.string().min(1),
  endedAt: z.string().datetime(),
  exitPage: z.string().min(1).optional(),
})

export const trackEventSchema = z.object({
  eventId: z.string().min(1),
  ...trackingBaseSchema,
  eventName: trackingEventNameSchema,
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

export const attachIdentitySchema = z
  .object({
    visitorId: z.string().min(1),
    attachedAt: z.string().datetime(),
    email: z.string().email().optional(),
    phone: z.string().min(3).optional(),
    externalId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone || value.externalId), {
    message: "At least one identity field is required.",
    path: ["email"],
  })

export const getJourneySchema = z
  .object({
    visitorId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.visitorId || value.customerId), {
    message: "Either visitorId or customerId must be provided.",
    path: ["visitorId"],
  })

export const visitorIdSchema = z.object({
  visitorId: z.string().min(1),
})

export const customerIdSchema = z.object({
  customerId: z.string().min(1),
})
