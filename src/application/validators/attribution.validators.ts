import { z } from "zod"

export const attributionModelSchema = z.enum([
  "first_touch",
  "last_touch",
  "linear",
  "time_decay",
  "position_based",
  "data_driven",
  "custom",
])

export const calculateAttributionSchema = z.object({
  journeyId: z.string().min(1),
  conversionId: z.string().min(1),
  model: attributionModelSchema,
  customWeights: z.record(z.string(), z.number().nonnegative()).optional(),
})

export const recalculateJourneySchema = z.object({
  journeyId: z.string().min(1),
  conversionId: z.string().min(1),
  models: z.array(attributionModelSchema).min(1),
  customWeights: z.record(z.string(), z.number().nonnegative()).optional(),
})

export const previewAttributionSchema = z.object({
  journeyId: z.string().min(1),
  conversionRevenue: z.number().nonnegative(),
  model: attributionModelSchema,
  customWeights: z.record(z.string(), z.number().nonnegative()).optional(),
})

export const attributionIdentitySchema = z.object({
  journeyId: z.string().min(1),
  conversionId: z.string().min(1),
})

export const attributionCampaignIdSchema = z.object({
  campaignId: z.string().min(1),
})
