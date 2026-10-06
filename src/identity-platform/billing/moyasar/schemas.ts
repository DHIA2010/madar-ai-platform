import { z } from "zod"

export const createCheckoutIntentSchema = z.object({
  application: z.enum(["advertising", "ecommerce", "pos", "madarApps"]),
  planTier: z.enum(["starter", "growth", "pro"]),
})

export const confirmCheckoutSchema = z.object({
  moyasarPaymentId: z.string().min(1),
})
