import { z } from "zod"

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const instant = z.string().datetime({ offset: true }).nullable().optional()

// Paid in full with more than one method (the cashier's split payment).
const paymentSplits = z
  .array(
    z.object({
      paymentMethodCode: z.string().min(1).max(60),
      amount: z.number().min(0).max(1000000),
    })
  )
  .max(10)
  .optional()

export const laundrySettingsSchema = z
  .object({
    pricesIncludeTax: z.boolean(),
    turnaroundHours: z.number().int().min(1).max(720),
    urgentTurnaroundHours: z.number().int().min(1).max(720),
    urgentSurchargePercent: z.number().min(0).max(500),
    deliveryFee: z.number().min(0).max(100000),
    unclaimedDays: z.number().int().min(1).max(365),
    autoReadyMessage: z.boolean(),
  })
  .partial()

export const laundryItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: optionalText(40),
  active: z.boolean().optional(),
})

export const laundryServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().optional(),
})

export const laundryPricesSchema = z.object({
  prices: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        serviceId: z.string().uuid(),
        price: z.number().min(0).max(100000).nullable(),
      })
    )
    .min(1)
    .max(2000),
})

export const laundryOrderSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerName: optionalText(160),
  customerPhone: optionalText(32),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        serviceId: z.string().uuid(),
        quantity: z.number().int().min(1).max(999),
        note: optionalText(300),
      })
    )
    .min(1)
    .max(200),
  urgent: z.boolean().default(false),
  promisedAt: instant,
  fulfilment: z.enum(["pickup", "delivery"]).default("pickup"),
  pickupAddress: optionalText(500),
  deliveryAddress: optionalText(500),
  pickupAt: instant,
  deliveryAt: instant,
  driverUserId: z.string().uuid().nullable().optional(),
  notes: optionalText(1000),
  useSubscription: z.boolean().default(true),
  payment: z.object({
    mode: z.enum(["later", "deposit", "full"]),
    paymentMethodCode: z.string().min(1).max(60).nullable().optional(),
    amount: z.number().min(0).max(1000000).optional(),
    payments: paymentSplits,
  }),
})

export const laundryQuoteSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  customerPhone: optionalText(32),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        serviceId: z.string().uuid(),
        quantity: z.number().int().min(1).max(999),
      })
    )
    .min(1)
    .max(200),
  urgent: z.boolean().default(false),
  fulfilment: z.enum(["pickup", "delivery"]).default("pickup"),
  useSubscription: z.boolean().default(true),
})

export const laundryStatusSchema = z.object({
  status: z.enum(["received", "processing", "ready"]),
})

export const laundryCollectSchema = z.object({
  paymentMethodCode: z.string().min(1).max(60).nullable().optional(),
  payments: paymentSplits,
})

export const laundryOrderPatchSchema = z.object({
  fulfilment: z.enum(["pickup", "delivery"]).optional(),
  pickupAddress: optionalText(500),
  deliveryAddress: optionalText(500),
  pickupAt: instant,
  deliveryAt: instant,
  driverUserId: z.string().uuid().nullable().optional(),
  promisedAt: instant,
  notes: optionalText(1000),
})

export const laundryPhotoSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(10).max(8_000_000),
  note: optionalText(300),
})

export const laundryNotifiedSchema = z.object({ kind: z.enum(["ready", "reminder"]) })

export const laundryPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pieces: z.number().int().min(1).max(10000),
  price: z.number().min(0).max(1000000),
  validDays: z.number().int().min(1).max(366),
  active: z.boolean().optional(),
})

export const laundrySubscriptionSchema = z.object({
  planId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  customerName: optionalText(160),
  customerPhone: optionalText(32),
  paymentMethodCode: z.string().min(1).max(60),
})
