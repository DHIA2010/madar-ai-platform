import { z } from "zod"

// What the Booking app's routes accept (booking/service.ts).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const uuid = z.string().uuid()
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === "all" ? undefined : value), schema.optional())
const text = (max: number) => z.string().trim().max(max)
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullish()

// A picture already uploaded, or a link the business typed: only ever a web address.
const imageUrl = z
  .string()
  .trim()
  .url()
  .max(600)
  .regex(/^https?:\/\//)
const link = z
  .string()
  .trim()
  .url()
  .max(400)
  .regex(/^https?:\/\//)

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const
export const TIME_OFF_KINDS = ["vacation", "sick", "break", "holiday", "other"] as const

export const bookingSettingsSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/)
      .nullable(),
    onlineEnabled: z.boolean(),
    coverUrl: imageUrl.nullable(),
    logoUrl: imageUrl.nullable(),
    tagline: text(140).nullable(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable(),
    instagramUrl: link.nullable(),
    mapUrl: link.nullable(),
    gallery: z.array(imageUrl).max(8),
    displayName: text(120).nullable(),
    description: text(600).nullable(),
    phone: text(30).nullable(),
    address: text(300).nullable(),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    leadTimeMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 14),
    advanceDays: z.number().int().min(1).max(365),
    autoConfirm: z.boolean(),
    cancellationAllowed: z.boolean(),
    cancellationDeadlineMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    reviewsEnabled: z.boolean(),
    whatsappConfirmation: z.boolean(),
    whatsappReminder: z.boolean(),
    reminderHoursBefore: z.number().int().min(1).max(168),
    invoiceOnCompletion: z.boolean(),
    paymentMode: z.enum(["off", "deposit", "full"]),
    depositPercent: z.number().int().min(1).max(99),
    moyasarPublishableKey: z
      .string()
      .trim()
      .regex(/^pk_(test|live)_[A-Za-z0-9]+$/)
      .nullable(),
  })
  .partial()

const serviceOption = z.object({
  id: z.string().max(60).nullish(),
  name: text(80).min(1),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(60 * 12),
  price: z.number().min(0).max(1_000_000),
})
const serviceAddon = z.object({
  id: z.string().max(60).nullish(),
  name: text(80).min(1),
  price: z.number().min(0).max(1_000_000),
  extraMinutes: z.number().int().min(0).max(240).default(0),
})

export const bookingServiceSchema = z.object({
  name: text(120).min(1),
  description: text(600).nullish(),
  category: text(60).nullish(),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(60 * 12),
  price: z.number().min(0).max(1_000_000),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  capacity: z.number().int().min(1).max(500).default(1),
  color,
  imageUrl: imageUrl.nullish(),
  visibility: z.enum(["published", "internal"]).default("published"),
  isActive: z.boolean().default(true),
  options: z.array(serviceOption).max(20).default([]),
  addons: z.array(serviceAddon).max(30).default([]),
  bundleServiceIds: z.array(uuid).max(20).default([]),
  resourceIds: z.array(uuid).max(50).default([]),
})

export const bookingResourceSchema = z.object({
  name: text(120).min(1),
  kind: z.enum(["room", "equipment"]).default("room"),
  quantity: z.number().int().min(1).max(1000).default(1),
  isActive: z.boolean().default(true),
})

export const bookingWaitlistSchema = z.object({
  serviceId: uuid,
  providerId: uuid.nullish(),
  customerName: text(120).min(1),
  customerPhone: text(30).nullish(),
  preferredDate: day,
  note: text(300).nullish(),
})
export const publicWaitlistSchema = z.object({
  serviceId: uuid,
  providerId: uuid.nullish(),
  customerName: text(120).min(2),
  customerPhone: text(30).min(8),
  preferredDate: day,
  // The account this browser already has on the page, if any.
  accountToken: z.string().max(80).nullish(),
  website: z.string().max(200).optional(),
})
export const bookingWaitlistCloseSchema = z.object({ status: z.enum(["booked", "removed"]) })

const period = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 - 5),
    endMinute: z
      .number()
      .int()
      .min(5)
      .max(24 * 60),
  })
  .refine((value) => value.endMinute > value.startMinute, { message: "end before start" })

export const bookingProviderSchema = z.object({
  name: text(120).min(1),
  title: text(120).nullish(),
  phone: text(30).nullish(),
  color,
  userId: uuid.nullish(),
  isActive: z.boolean().default(true),
  commissionRate: z.number().min(0).max(100).default(0),
  serviceIds: z.array(uuid).max(500).default([]),
  hours: z.array(period).max(60).default([]),
})

export const bookingTimeOffSchema = z
  .object({
    providerId: uuid.nullish(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    kind: z.enum(TIME_OFF_KINDS).default("other"),
    note: text(200).nullish(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "end before start",
  })

export const availabilityQuerySchema = z.object({
  serviceId: uuid,
  date: day,
  providerId: optional(uuid),
  partySize: optional(z.coerce.number().int().min(1).max(500)),
  // A booking being moved does not block its own time.
  ignoreBookingId: optional(uuid),
  optionId: optional(z.string().max(60)),
  // Add-on ids, separated by commas.
  addonIds: z.preprocess(
    (value) => (typeof value === "string" && value ? value.split(",").filter(Boolean) : undefined),
    z.array(z.string().max(60)).max(30).optional()
  ),
})

// What a booking's price depends on beyond the service: its option and add-ons, and what lowers
// or pays it.
const pricing = {
  optionId: z.string().max(60).nullish(),
  addonIds: z.array(z.string().max(60)).max(30).default([]),
  couponCode: text(40).nullish(),
  giftCode: text(40).nullish(),
}
const staffPricing = {
  ...pricing,
  customerPlanId: uuid.nullish(),
  redeemPoints: z.number().int().min(0).max(10_000_000).nullish(),
}

export const bookingQuoteSchema = z.object({
  serviceId: uuid,
  partySize: z.number().int().min(1).max(500).default(1),
  customerId: uuid.nullish(),
  customerPhone: text(30).nullish(),
  date: day.nullish(),
  ...staffPricing,
})
export const publicQuoteSchema = z.object({
  serviceId: uuid,
  partySize: z.number().int().min(1).max(500).default(1),
  customerPhone: text(30).nullish(),
  date: day.nullish(),
  ...pricing,
})

export const bookingCreateSchema = z.object({
  serviceId: uuid,
  providerId: uuid.nullish(),
  startsAt: z.string().datetime({ offset: true }),
  customerId: uuid.nullish(),
  customerName: text(120).min(1),
  customerPhone: text(30).nullish(),
  partySize: z.number().int().min(1).max(500).default(1),
  notes: text(1000).nullish(),
  // Staff only: book even where the time is taken or outside working hours.
  force: z.boolean().default(false),
  ...staffPricing,
  // A booking that repeats: every so many weeks, this many visits in all (the first included).
  repeat: z
    .object({
      everyWeeks: z.number().int().min(1).max(12),
      count: z.number().int().min(2).max(26),
    })
    .nullish(),
})

export const bookingRescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  providerId: uuid.nullish(),
  force: z.boolean().default(false),
})

export const bookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  reason: text(300).nullish(),
})

export const bookingPaymentSchema = z.object({
  paid: z.boolean(),
  method: text(40).nullish(),
})

export const bookingNotesSchema = z.object({ notes: text(1000).nullable() })

export const bookingListQuerySchema = z.object({
  from: optional(day),
  to: optional(day),
  status: optional(z.enum(BOOKING_STATUSES)),
  providerId: optional(uuid),
  search: optional(text(80)),
})

export const bookingRangeQuerySchema = z.object({ from: day, to: day })

// The public page: what a customer sends to book. `website` is a trap field a person never
// fills in.
export const publicBookingSchema = z.object({
  serviceId: uuid,
  providerId: uuid.nullish(),
  startsAt: z.string().datetime({ offset: true }),
  customerName: text(120).min(2),
  customerPhone: text(30).min(8),
  partySize: z.number().int().min(1).max(500).default(1),
  notes: text(500).nullish(),
  // The account this browser already has on the page, if any.
  accountToken: z.string().max(80).nullish(),
  website: z.string().max(200).optional(),
  ...pricing,
})

export const bookingCouponSchema = z.object({
  code: text(40).min(2),
  kind: z.enum(["percent", "fixed"]),
  value: z.number().positive().max(1_000_000),
  maxDiscount: z.number().positive().max(1_000_000).nullable().default(null),
  minAmount: z.number().min(0).max(1_000_000).default(0),
  startsOn: day.nullable().default(null),
  endsOn: day.nullable().default(null),
  usageLimit: z.number().int().positive().max(1_000_000).nullable().default(null),
  perCustomerLimit: z.number().int().positive().max(1000).nullable().default(null),
  serviceIds: z.array(uuid).max(500).default([]),
  isActive: z.boolean().default(true),
})

export const bookingGiftCardSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  code: text(40).nullish(),
  purchaserName: text(120).nullish(),
  recipientName: text(120).nullish(),
  recipientPhone: text(30).nullish(),
  message: text(300).nullish(),
  expiresOn: day.nullish(),
})

export const bookingActiveSchema = z.object({ isActive: z.boolean() })

export const bookingPlanSchema = z.object({
  kind: z.enum(["package", "membership"]),
  name: text(120).min(1),
  description: text(600).nullable().default(null),
  price: z.number().min(0).max(1_000_000),
  // Empty means as many visits as wanted (a membership).
  uses: z.number().int().positive().max(10_000).nullable().default(null),
  validityDays: z.number().int().min(1).max(3650),
  serviceIds: z.array(uuid).max(500).default([]),
  isActive: z.boolean().default(true),
})

export const bookingSellPlanSchema = z.object({
  planId: uuid,
  customerId: uuid.nullish(),
  customerName: text(120).min(1),
  customerPhone: text(30).nullish(),
  startsOn: day.nullish(),
  pricePaid: z.number().min(0).max(1_000_000).nullish(),
})

export const bookingReviewPublishSchema = z.object({ isPublished: z.boolean() })
export const publicReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: text(600).nullish(),
})
export const bookingLookupQuerySchema = z.object({ phone: text(30).min(3) })

// The business's Moyasar secret key (empty removes it), and a payment a customer came back with.
export const bookingPaymentKeySchema = z.object({
  secretKey: z.string().trim().max(200).nullable(),
})
export const publicPaymentSchema = z.object({ paymentId: z.string().trim().min(8).max(100) })

export const bookingImageSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  dataBase64: z.string().min(1),
})
