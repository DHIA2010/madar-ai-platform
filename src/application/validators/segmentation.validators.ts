import { z } from "zod"

export const segmentRuleOperatorSchema = z.enum([
  "equals",
  "not equals",
  "contains",
  "starts with",
  "ends with",
  "greater than",
  "less than",
  "between",
  "exists",
  "not exists",
  "in",
  "not in",
])

export const segmentGroupOperatorSchema = z.enum(["AND", "OR"])

export const segmentRuleFieldSchema = z.enum([
  "visitor_attribute",
  "customer_attribute",
  "session_attribute",
  "journey_attribute",
  "traffic_source",
  "campaign_source",
  "device",
  "browser",
  "country",
  "city",
  "purchase_count",
  "revenue",
  "aov",
  "last_visit",
  "first_visit",
  "days_since_purchase",
  "days_since_visit",
  "product_viewed",
  "category_viewed",
  "product_purchased",
  "cart_abandoned",
  "checkout_started",
  "returning_visitor",
  "known_customer",
  "anonymous_visitor",
])

export const segmentRuleSchema = z.object({
  ruleId: z.string().min(1),
  field: segmentRuleFieldSchema,
  operator: segmentRuleOperatorSchema,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.tuple([z.number(), z.number()]),
      z.tuple([z.string(), z.string()]),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .optional(),
  attributeKey: z.string().min(1).optional(),
  not: z.boolean().optional(),
})

export type SegmentRuleInput = z.infer<typeof segmentRuleSchema>

export interface SegmentGroupInput {
  groupId: string
  operator: "AND" | "OR"
  rules: SegmentRuleInput[]
  groups: SegmentGroupInput[]
  not?: boolean
}

export const segmentGroupSchema: z.ZodType<SegmentGroupInput> = z.lazy(() =>
  z.object({
    groupId: z.string().min(1),
    operator: segmentGroupOperatorSchema,
    rules: z.array(segmentRuleSchema),
    groups: z.array(segmentGroupSchema),
    not: z.boolean().optional(),
  })
)

export const segmentAudienceTypeSchema = z.enum(["dynamic", "static"])
export const segmentStatusSchema = z.enum(["draft", "active", "archived"])
export const segmentEvaluationModeSchema = z.enum(["lazy", "snapshot", "incremental", "full"])

export const createSegmentSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  audienceType: segmentAudienceTypeSchema,
  rootGroup: segmentGroupSchema,
  staticVisitorIds: z.array(z.string().min(1)).optional(),
})

export const updateSegmentSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().min(2).optional(),
  audienceType: segmentAudienceTypeSchema.optional(),
  status: segmentStatusSchema.optional(),
  rootGroup: segmentGroupSchema.optional(),
  staticVisitorIds: z.array(z.string().min(1)).optional(),
})

export const segmentIdSchema = z.object({
  segmentId: z.string().min(1),
})

export const evaluateSegmentSchema = z.object({
  segmentId: z.string().min(1),
  mode: segmentEvaluationModeSchema.optional(),
  candidateVisitorIds: z.array(z.string().min(1)).optional(),
})

export const refreshSegmentSnapshotSchema = z.object({
  segmentId: z.string().min(1),
  mode: segmentEvaluationModeSchema.optional(),
  candidateVisitorIds: z.array(z.string().min(1)).optional(),
})

export const previewSegmentSchema = z.object({
  rootGroup: segmentGroupSchema,
  candidateVisitorIds: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})
