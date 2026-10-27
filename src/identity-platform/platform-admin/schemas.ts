import { z } from "zod"

import { SUBSCRIPTION_APPLICATIONS } from "../subscriptions/types"

const planTier = z.enum(["starter", "growth", "pro", "enterprise"])
const billingInterval = z.enum(["monthly", "yearly"])
const application = z.enum(SUBSCRIPTION_APPLICATIONS)
const subscriptionStatus = z.enum(["active", "trial", "overdue", "expired", "cancelled"])

// Query params arrive as strings; an empty one (an "all" filter) means no filter.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === "all" ? undefined : value), schema.optional())

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const customerListQuerySchema = pageQuerySchema.extend({
  search: optional(z.string().max(200)),
  status: optional(subscriptionStatus.or(z.literal("none"))),
  application: optional(application),
  planTier: optional(planTier),
  platform: optional(z.enum(["salla", "zid", "shopify"])),
})

export const subscriptionListQuerySchema = pageQuerySchema.extend({
  search: optional(z.string().max(200)),
  status: optional(subscriptionStatus),
  application: optional(application),
  planTier: optional(planTier),
})

export const grantSubscriptionSchema = z.object({
  application,
  planTier: planTier.nullable().default(null),
  interval: billingInterval,
  // Halalas; null = complimentary.
  priceHalalas: z.number().int().min(0).nullable().default(null),
})

export const renewSubscriptionSchema = z.object({
  interval: billingInterval,
})
