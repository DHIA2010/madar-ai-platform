import { z } from "zod"

import { PURCHASABLE_APPLICATIONS } from "../../subscriptions/types"

export const createCheckoutIntentSchema = z.object({
  application: z.enum(PURCHASABLE_APPLICATIONS),
  packageId: z.string().uuid(),
  interval: z.enum(["monthly", "yearly"]),
  extraBranches: z.number().int().min(0).max(500).default(0),
  couponCode: z.string().trim().max(40).nullish(),
})

export const createBranchCheckoutSchema = z.object({
  count: z.number().int().min(1).max(100),
})

export const createAddonCheckoutSchema = z.object({
  addonCode: z.string().trim().min(1).max(64),
  interval: z.enum(["monthly", "yearly"]),
})

export const confirmCheckoutSchema = z.object({
  moyasarPaymentId: z.string().min(1),
})

export const couponQuoteSchema = z.object({
  code: z.string().trim().min(1).max(40),
  application: z.enum(PURCHASABLE_APPLICATIONS),
  packageId: z.string().uuid(),
  interval: z.enum(["monthly", "yearly"]),
  extraBranches: z.number().int().min(0).max(500).default(0),
})
