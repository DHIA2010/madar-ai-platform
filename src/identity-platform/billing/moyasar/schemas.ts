import { z } from "zod"

import { PURCHASABLE_APPLICATIONS } from "../../subscriptions/types"

export const createCheckoutIntentSchema = z.object({
  application: z.enum(PURCHASABLE_APPLICATIONS),
  packageId: z.string().uuid(),
  interval: z.enum(["monthly", "yearly"]),
  couponCode: z.string().trim().max(40).nullish(),
})

export const confirmCheckoutSchema = z.object({
  moyasarPaymentId: z.string().min(1),
})

export const couponQuoteSchema = z.object({
  code: z.string().trim().min(1).max(40),
  application: z.enum(PURCHASABLE_APPLICATIONS),
  packageId: z.string().uuid(),
  interval: z.enum(["monthly", "yearly"]),
})
