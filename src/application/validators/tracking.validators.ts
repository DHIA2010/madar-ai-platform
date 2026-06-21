import { z } from "zod"

export const trackingConsentStatusSchema = z.enum(["accepted", "rejected", "partial", "unknown"])

export const trackingEventNameSchema = z.enum([
  "page_viewed",
  "product_viewed",
  "category_viewed",
  "search_performed",
  "add_to_cart",
  "remove_from_cart",
  "checkout_started",
  "checkout_completed",
  "purchase_completed",
  "banner_clicked",
  "promotion_clicked",
  "collection_viewed",
  "login",
  "signup",
])

export const trackingDeviceSchema = z.object({
  deviceId: z.string().min(1),
  type: z.enum(["desktop", "mobile", "tablet", "unknown"]),
  browser: z.string().min(1),
  operatingSystem: z.string().min(1),
  screenSize: z.string().min(1),
})

export const trackingLocationSchema = z.object({
  country: z.string().optional(),
  city: z.string().optional(),
})

export const trackingContextSchema = z.object({
  timestamp: z.string().min(1),
  timezone: z.string().min(1),
  language: z.string().min(1),
  currency: z.string().optional(),
  location: trackingLocationSchema,
  device: trackingDeviceSchema,
  referrer: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  landingPage: z.string().optional(),
  exitPage: z.string().optional(),
})

export const trackingConsentSchema = z.object({
  status: trackingConsentStatusSchema,
  categories: z.object({
    analytics: z.boolean().optional(),
    marketing: z.boolean().optional(),
    personalization: z.boolean().optional(),
  }),
  updatedAt: z.string().min(1),
})

export const trackingEventSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  visitorId: z.string().min(1),
  customerId: z.string().optional(),
  name: trackingEventNameSchema,
  context: trackingContextSchema,
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})
