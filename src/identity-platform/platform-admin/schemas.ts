import { z } from "zod"

import { PURCHASABLE_APPLICATIONS } from "../subscriptions/types"
import { PLATFORM_ROLES } from "./staff-roles"

const planTier = z.enum(["starter", "growth", "pro", "enterprise"])
const billingInterval = z.enum(["monthly", "yearly"])
const application = z.enum(PURCHASABLE_APPLICATIONS)
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
  packageId: z.string().uuid().nullable().default(null),
  interval: billingInterval,
  // Halalas; null = complimentary.
  priceHalalas: z.number().int().min(0).nullable().default(null),
})

export { application as purchasableApplicationSchema }

const halalas = z.number().int().min(0).max(100_000_000).nullable()

export const packageInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  features: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  monthlyPriceHalalas: halalas,
  yearlyPriceHalalas: halalas,
  isRecommended: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const applicationVisibilitySchema = z.object({ visible: z.boolean() })

export const pricingModeSchema = z
  .object({
    mode: z.enum(["packages", "fixed", "contact", "free"]),
    // Free mode: days a free activation lasts -- at most a year. Ignored for other modes.
    freeDays: z.number().int().min(1).max(365).nullable().default(null),
  })
  .refine((input) => input.mode !== "free" || input.freeDays !== null, {
    path: ["freeDays"],
    message: "A free application needs a duration of 1 to 365 days.",
  })

export const reorderPackagesSchema = z.object({
  packageIds: z.array(z.string().uuid()).min(1).max(50),
})

export const platformSettingsPatchSchema = z
  .object({
    platformName: z.string().trim().min(1).max(80),
    supportEmail: z.string().trim().email(),
    announcementBanner: z.string().trim().max(300),
    maintenanceMode: z.boolean(),
    newSignupsEnabled: z.boolean(),
    trialDays: z.number().int().min(1).max(90),
    renewalReminderDays: z.number().int().min(1).max(30),
    gracePeriodDays: z.number().int().min(0).max(60),
  })
  .partial()

export const renewSubscriptionSchema = z.object({
  interval: billingInterval,
})

export const couponInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, - and _ only"),
  discountType: z.enum(["percentage", "fixed"]),
  // Whole percent, or halalas for a fixed discount.
  discountValue: z.number().int().min(1).max(100_000_000),
  applications: z.array(application).max(20).default([]),
  packageIds: z.array(z.string().uuid()).max(100).default([]),
  billingIntervals: z.array(billingInterval).min(1).max(2),
  usageLimit: z.number().int().min(1).nullable().default(null),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  isActive: z.boolean().default(true),
})

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const paymentListQuerySchema = pageQuerySchema.extend({
  search: optional(z.string().max(200)),
  status: optional(z.enum(["initiated", "paid", "failed"])),
  method: optional(z.enum(["card", "bank_transfer"])),
  application: optional(application),
  from: optional(day),
  to: optional(day),
})

export const receiptListQuerySchema = pageQuerySchema.extend({
  search: optional(z.string().max(200)),
  organizationId: optional(z.string().uuid()),
})

export const storeListQuerySchema = pageQuerySchema.extend({
  search: optional(z.string().max(200)),
  platform: optional(z.enum(["salla", "zid", "shopify"])),
  status: optional(z.enum(["pending", "connected", "paused", "disconnected", "error"])),
})

export const addStaffSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(PLATFORM_ROLES),
})

export const updateStaffSchema = z
  .object({
    role: z.enum(PLATFORM_ROLES),
    status: z.enum(["active", "disabled"]),
  })
  .partial()

export const flagInputSchema = z.object({
  description: z.string().trim().max(300).nullable().default(null),
  enabled: z.boolean(),
  rolloutPercentage: z.number().int().min(0).max(100).nullable().default(null),
})

export const createFlagSchema = flagInputSchema.extend({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_.-]{1,80}$/, "lowercase letters, digits, . _ -"),
})

export const flagOverrideSchema = z.object({
  organizationId: z.string().uuid(),
  // null removes the override.
  enabled: z.boolean().nullable(),
})
