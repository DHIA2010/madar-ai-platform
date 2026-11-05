import { z } from "zod"

import { conditionsParamSchema, dateRangeParams } from "./filters"
import { STAGE_COLORS } from "./stages"
import { CRM_FIELD_TYPES, CRM_LOGGABLE_ACTIVITIES, CRM_SOURCES } from "./types"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : value === undefined ? undefined : null))

export const crmLeadListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  stage: z.string().max(40).optional(),
  source: z.enum(CRM_SOURCES).optional(),
  owner: z.string().max(64).optional(),
  conditions: conditionsParamSchema,
  ...dateRangeParams,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const crmPipelineQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  owner: z.string().max(64).optional(),
  source: z.enum(CRM_SOURCES).optional(),
  conditions: conditionsParamSchema,
  ...dateRangeParams,
})

const labelList = z.array(z.string().trim().min(1).max(60)).max(40)

export const crmLeadInputSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  contactName: optionalText(160),
  phone: optionalText(32),
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email().max(254)])
    .nullable()
    .optional()
    .transform((value) => (value ? value : value === undefined ? undefined : null)),
  expectedValue: z.number().min(0).max(100_000_000).nullable().optional(),
  ownerUserId: z.guid().nullable().optional(),
  interests: labelList.optional(),
  tags: labelList.optional(),
  customFields: z
    .record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()]))
    .optional(),
})

export const crmLeadPatchSchema = crmLeadInputSchema.partial()

export const crmStageInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  color: z.enum(STAGE_COLORS),
  // The open stage it comes after.
  after: z.string().max(40).optional(),
})

export const crmStageOrderSchema = z.object({
  order: z.array(z.string().min(1).max(40)).min(1).max(100),
})

export const crmStageDeleteQuerySchema = z.object({ moveTo: z.string().min(1).max(40) })

export const crmCustomFieldInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(CRM_FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
})

const CRM_VIEW_PAGES = ["leads", "quotes", "invoices", "tasks"] as const

export const crmViewListQuerySchema = z.object({ page: z.enum(CRM_VIEW_PAGES) })

export const crmViewInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  page: z.enum(CRM_VIEW_PAGES),
  definition: z.record(z.string(), z.unknown()),
})

export const crmActivateAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  contactName: z.string().trim().max(160).nullable().optional(),
})

export const crmActivationListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
})

export const crmStageSchema = z.object({
  stage: z.string().min(1).max(40),
  lostReason: z.string().trim().max(500).nullable().optional(),
})

export const crmActivitySchema = z.object({
  kind: z.enum(CRM_LOGGABLE_ACTIVITIES),
  body: z.string().trim().min(1).max(4000),
})

export const crmTaskInputSchema = z.object({
  title: z.string().trim().min(2).max(300),
  dueAt: z.string().datetime({ offset: true }),
  assigneeUserId: z.guid().nullable().optional(),
})

export const crmTaskDoneSchema = z.object({ done: z.boolean() })

export const crmTaskListQuerySchema = z.object({
  scope: z.enum(["mine", "all"]).default("mine"),
  status: z.enum(["open", "overdue", "done"]).default("open"),
  ...dateRangeParams,
})

export const crmDashboardQuerySchema = z.object({
  rangeDays: z.coerce
    .number()
    .int()
    .refine((value) => [7, 30, 90].includes(value))
    .default(30),
})

// ---- Quotes and invoices ----

const salesItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("package"),
    packageId: z.guid(),
    interval: z.enum(["monthly", "yearly"]),
    description: z.string().trim().max(300).optional(),
  }),
  z.object({
    kind: z.literal("custom"),
    description: z.string().trim().min(1).max(300),
    quantity: z.number().int().min(1).max(10_000),
    unitPrice: z.number().min(0).max(10_000_000),
  }),
])

export const crmQuoteInputSchema = z.object({
  items: z.array(salesItemSchema).min(1).max(50),
  discount: z.number().min(0).max(10_000_000).optional(),
  validUntil: z.string().date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const crmQuoteStatusSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected"]),
})

export const crmQuoteListQuerySchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected", "converted"]).optional(),
  leadId: z.guid().optional(),
  search: z.string().trim().max(160).optional(),
  ...dateRangeParams,
})

export const crmConvertQuoteSchema = z.object({
  dueDate: z.string().date().nullable().optional(),
})

export const crmInvoiceListQuerySchema = z.object({
  status: z.enum(["unpaid", "paid", "void"]).optional(),
  leadId: z.guid().optional(),
  method: z.enum(["bank_transfer", "cash", "card", "other"]).optional(),
  search: z.string().trim().max(160).optional(),
  dateField: z.enum(["created", "paid"]).optional(),
  activation: z.enum(["activated", "pending"]).optional(),
  ...dateRangeParams,
})

export const crmMarkPaidSchema = z.object({
  method: z.enum(["bank_transfer", "cash", "card", "other"]).optional(),
  paidAt: z.string().date().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
})

// null on both: work the period out from the invoice's packages again.
export const crmInvoicePeriodSchema = z.object({
  start: z.string().date().nullable(),
  end: z.string().date().nullable(),
})

export const crmTermsSchema = z.object({ terms: z.string().max(5000).nullable() })

export const publicInvoiceCouponSchema = z.object({ code: z.string().trim().min(1).max(40) })

export const publicInvoiceConfirmSchema = z.object({
  moyasarPaymentId: z.string().trim().min(1).max(100),
})

export const crmInvoiceInputSchema = z.object({
  items: z.array(salesItemSchema).min(1).max(50),
  discount: z.number().min(0).max(10_000_000).optional(),
  dueDate: z.string().date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})
