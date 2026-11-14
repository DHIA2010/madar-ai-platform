import { z } from "zod"

import { PURCHASABLE_APPLICATIONS } from "../subscriptions/types"
import { MAX_LEAD_ALERT_PHONES } from "../whatsapp/platform-config"
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
  // Branches beyond the one included; omitted keeps what the subscription has.
  extraBranches: z.number().int().min(0).max(500).optional(),
})

// A paid add-on's price (subscriptions/addons.ts), in halalas.
export const addonPriceSchema = z.object({
  monthlyPriceHalalas: z.number().int().min(0).max(100_000_000),
  yearlyPriceHalalas: z.number().int().min(0).max(100_000_000),
  isActive: z.boolean(),
})

// Giving an organization a period of an add-on without payment.
export const grantAddonSchema = z.object({ interval: z.enum(["monthly", "yearly"]) })

export const setExtraBranchesSchema = z.object({
  extraBranches: z.number().int().min(0).max(500),
})

export { application as purchasableApplicationSchema }

const halalas = z.number().int().min(0).max(100_000_000).nullable()

export const packageInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  features: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  monthlyPriceHalalas: halalas,
  yearlyPriceHalalas: halalas,
  // Branches the package includes, and each further one (null = the package doesn't sell them).
  includedBranches: z.number().int().min(1).max(500).default(1),
  // What the package unlocks beyond its app (subscriptions/entitlements.ts).
  entitlements: z
    .object({
      invoiceReader: z.boolean().optional(),
      shiftCash: z.boolean().optional(),
      customRoles: z.boolean().optional(),
      procurement: z.boolean().optional(),
      customReports: z.boolean().optional(),
      invoicing: z.boolean().optional(),
      // Absent = no limit.
      maxAdPlatforms: z.number().int().min(0).max(100).optional(),
      maxStores: z.number().int().min(0).max(1000).optional(),
    })
    .default({}),
  extraBranchMonthlyHalalas: halalas.default(null),
  extraBranchYearlyHalalas: halalas.default(null),
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
    legalName: z.string().trim().max(160),
    vatNumber: z.string().trim().max(32),
    commercialRegistration: z.string().trim().max(32),
    address: z.string().trim().max(300),
    calcomWebhookSecret: z.string().trim().max(200),
    quoteTerms: z.string().trim().max(5000),
    invoiceTerms: z.string().trim().max(5000),
  })
  .partial()

// Madar Admin -> settings -> WhatsApp. Secrets are write-only: omitted keeps, "" clears.
export const whatsAppPlatformConfigPatchSchema = z
  .object({
    appId: z.string().trim().max(40).regex(/^\d*$/, "Digits only"),
    embeddedSignupConfigId: z.string().trim().max(40).regex(/^\d*$/, "Digits only"),
    madarWabaId: z.string().trim().max(40).regex(/^\d*$/, "Digits only"),
    madarPhoneNumberId: z.string().trim().max(40).regex(/^\d*$/, "Digits only"),
    appSecret: z.string().trim().max(200),
    systemUserToken: z.string().trim().max(1000),
    leadAlertPhones: z.array(z.string().trim().min(1).max(30)).max(MAX_LEAD_ALERT_PHONES),
  })
  .partial()

export const whatsAppTemplateSubmitSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,512}$/),
})

export const whatsAppWebhookActivationSchema = z.object({
  callbackUrl: z.string().trim().url().startsWith("https://"),
})

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
