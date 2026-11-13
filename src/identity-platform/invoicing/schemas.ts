import { z } from "zod"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))

export const SECTORS = ["general", "services", "contracting"] as const
export const BUYER_ID_SCHEMES = [
  "CRN",
  "MOM",
  "MLS",
  "700",
  "SAG",
  "NAT",
  "GCC",
  "IQA",
  "PAS",
  "TIN",
  "OTH",
] as const

export const partySchema = z.object({
  name: z.string().trim().max(200).default(""),
  vatNumber: text(20),
  idScheme: z
    .enum(BUYER_ID_SCHEMES)
    .nullish()
    .transform((value) => value ?? null),
  idValue: text(40),
  contactName: text(120),
  email: text(160),
  phone: text(40),
  address: z
    .object({
      street: text(160),
      buildingNumber: text(12),
      secondaryNumber: text(12),
      district: text(120),
      city: text(120),
      postalCode: text(12),
      countryCode: z.string().trim().length(2).default("SA"),
    })
    .prefault({}),
})
export type PartyInput = z.infer<typeof partySchema>

export const lineSchema = z.object({
  lineType: z.enum(["item", "section", "note"]).default("item"),
  productId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  quotationLineId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  description: z.string().trim().max(500).default(""),
  details: text(2000),
  unit: text(24),
  quantity: z.number().min(0).max(1_000_000_000).default(0),
  unitPrice: z.number().min(0).max(10_000_000_000).default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  taxCategory: z.enum(["S", "Z", "E", "O"]).default("S"),
  taxRate: z.number().min(0).max(100).default(15),
  exemptionCode: text(32),
  exemptionReason: text(300),
  progressPrevious: z
    .number()
    .min(0)
    .max(100)
    .nullish()
    .transform((value) => value ?? null),
  progressCurrent: z
    .number()
    .min(0)
    .max(100)
    .nullish()
    .transform((value) => value ?? null),
})
export type LineInputPayload = z.infer<typeof lineSchema>

const documentBase = {
  sector: z.enum(SECTORS).default("general"),
  customerId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  customer: partySchema,
  title: text(200),
  reference: text(120),
  issueDate: isoDate,
  discountType: z.enum(["amount", "percent"]).default("amount"),
  discountValue: z.number().min(0).max(10_000_000_000).default(0),
  retentionPercent: z.number().min(0).max(100).default(0),
  paymentTerms: text(500),
  terms: text(8000),
  notes: text(4000),
  lines: z.array(lineSchema).min(1).max(500),
}

export const quotationInputSchema = z.object({
  ...documentBase,
  validUntil: isoDate.nullish().transform((value) => value ?? null),
  advancePercent: z.number().min(0).max(100).default(0),
})
export type QuotationInput = z.infer<typeof quotationInputSchema>

export const quotationStatusSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "declined"]),
  declineReason: text(500),
})

export const quotationListQuerySchema = z.object({
  status: z.string().nullish(),
  search: z.string().max(120).nullish(),
  customerId: z.string().uuid().nullish(),
})

export const invoiceInputSchema = z.object({
  ...documentBase,
  taxType: z.enum(["standard", "simplified"]).default("standard"),
  invoiceKind: z.enum(["regular", "advance", "progress"]).default("regular"),
  quotationId: z
    .string()
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  supplyDate: isoDate.nullish().transform((value) => value ?? null),
  supplyEndDate: isoDate.nullish().transform((value) => value ?? null),
  dueDate: isoDate.nullish().transform((value) => value ?? null),
  paymentMeans: z.enum(["10", "30", "42", "48", "1"]).default("30"),
  claimNumber: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .nullish()
    .transform((value) => value ?? null),
  // Advance payment invoices deducted here: how much of each (before VAT).
  prepayments: z
    .array(z.object({ advanceInvoiceId: z.string().uuid(), netAmount: z.number().positive() }))
    .max(20)
    .default([]),
})
export type InvoiceInput = z.infer<typeof invoiceInputSchema>

// ZATCA KSA-10: why a credit or debit note was issued (VAT Implementing Regulations, art. 40(1)).
export const ADJUSTMENT_REASONS = [
  "cancellation",
  "essential_change",
  "price_amendment",
  "refund",
  "party_change",
] as const

export const noteInputSchema = z.object({
  documentType: z.enum(["credit_note", "debit_note"]),
  reasonCode: z.enum(ADJUSTMENT_REASONS),
  reason: text(300),
  notes: text(4000),
  lines: z.array(lineSchema).min(1).max(500),
})
export type NoteInput = z.infer<typeof noteInputSchema>

export const invoiceListQuerySchema = z.object({
  documentType: z.enum(["invoice", "credit_note", "debit_note", "all"]).nullish(),
  status: z.string().nullish(),
  search: z.string().max(120).nullish(),
  customerId: z.string().uuid().nullish(),
  quotationId: z.string().uuid().nullish(),
})

export const paymentInputSchema = z.object({
  amount: z.number().positive().max(10_000_000_000),
  paidOn: isoDate,
  method: z.enum(["cash", "bank_transfer", "card", "cheque", "other"]).default("bank_transfer"),
  reference: text(120),
  notes: text(500),
})
export type PaymentInput = z.infer<typeof paymentInputSchema>

export const publicResponseSchema = z.object({
  action: z.enum(["accept", "decline"]),
  name: z.string().trim().min(2).max(120),
  reason: text(500),
})
