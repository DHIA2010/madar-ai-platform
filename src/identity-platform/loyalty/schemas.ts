import { z } from "zod"

// What the Loyalty app's routes accept (loyalty/service.ts).

const text = (max: number) => z.string().trim().max(max)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional())

export const REWARD_KINDS = ["amount", "percent", "free"] as const

// Apple Wallet shows a card on the lock screen near at most ten places.
export const MAX_LOCATIONS = 10

const location = z.object({
  name: text(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

export const loyaltyProgramSchema = z
  .object({
    isActive: z.boolean(),
    displayName: text(80).nullable(),
    pointsPerSar: z.number().min(0.01).max(1000),
    pointValue: z.number().min(0.0001).max(1000),
    reviewBonusEnabled: z.boolean(),
    reviewBonusPoints: z.number().int().min(0).max(100_000),
    googleReviewUrl: z.string().trim().url().max(500).nullable(),
    onlineBonusEnabled: z.boolean(),
    onlineBonusPoints: z.number().int().min(0).max(100_000),
    cardColor: color,
    textColor: color,
    cardTitle: text(40).nullable(),
    cardNote: text(120).nullable(),
    terms: text(1000).nullable(),
    walletNotifyPoints: z.boolean(),
    nearbyEnabled: z.boolean(),
    nearbyMessage: text(120).nullable(),
    locations: z.array(location).max(MAX_LOCATIONS),
  })
  .partial()

const rewardItem = z.object({
  kind: z.enum(["service", "product"]),
  id: z.string().uuid(),
  name: text(200),
})

export const loyaltyRewardSchema = z
  .object({
    name: text(120).min(1),
    pointsCost: z.number().int().min(1).max(10_000_000),
    kind: z.enum(REWARD_KINDS),
    value: z.number().min(0).max(1_000_000),
    items: z.array(rewardItem).max(50),
    isActive: z.boolean(),
  })
  .superRefine((reward, context) => {
    if (reward.kind === "amount" && reward.value <= 0) {
      context.addIssue({ code: "custom", path: ["value"], message: "An amount is required." })
    }
    if (reward.kind === "percent" && (reward.value <= 0 || reward.value > 100)) {
      context.addIssue({ code: "custom", path: ["value"], message: "A percent of 1 to 100." })
    }
    if (reward.kind === "free" && reward.items.length === 0) {
      context.addIssue({ code: "custom", path: ["items"], message: "Choose what is free." })
    }
  })

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{9,15}$/))

export const loyaltyMemberSchema = z.object({ name: text(120).min(1), phone })

export const loyaltyMemberListSchema = z.object({ search: optional(text(80)) })

export const loyaltyAdjustSchema = z.object({
  points: z
    .number()
    .int()
    .min(-10_000_000)
    .max(10_000_000)
    .refine((value) => value !== 0),
  note: text(200).nullable().optional(),
})

export const loyaltyRedeemSchema = z.object({
  rewardId: z.string().uuid(),
  // True when the staff hand the reward over on the spot.
  handOver: z.boolean().optional(),
})

export const loyaltyMessageSchema = z.object({ message: text(120).min(1) })

export const loyaltyLookupSchema = z.object({ code: text(80).min(1) })

export const publicJoinSchema = z.object({ name: text(120).min(1), phone })

export const publicClaimSchema = z.object({ rewardId: z.string().uuid() })
