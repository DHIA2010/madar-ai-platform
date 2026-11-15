import { z } from "zod"

import { ACCOUNT_SECTIONS, ACCOUNT_TYPES } from "./chart"
import { SOURCE_TYPES } from "./postings"

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
// Query params arrive as strings; an empty one means "not given".
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === "all" ? undefined : value), schema.optional())

export const accountInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z.-]{1,20}$/),
  nameAr: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().min(1).max(160),
  type: z.enum(ACCOUNT_TYPES),
  section: z.enum(ACCOUNT_SECTIONS),
  isActive: z.boolean().default(true),
})

const amount = z.number().min(0).max(10_000_000_000)

export const entryInputSchema = z.object({
  date: day,
  description: z.string().trim().max(500).default(""),
  opening: z.boolean().default(false),
  workspaceId: z.string().uuid().nullable().default(null),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: amount.default(0),
        credit: amount.default(0),
        memo: z.string().trim().max(300).default(""),
      })
    )
    .min(2)
    .max(200),
})

export const entryListQuerySchema = z.object({
  from: optional(day),
  to: optional(day),
  sourceType: optional(z.enum([...SOURCE_TYPES, "manual", "opening"])),
  accountId: optional(z.string().uuid()),
  workspaceId: optional(z.string().uuid()),
  search: optional(z.string().trim().max(120)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const rangeQuerySchema = z.object({
  from: day,
  to: day,
  workspaceId: optional(z.string().uuid()),
})

export const asOfQuerySchema = z.object({
  asOf: day,
  workspaceId: optional(z.string().uuid()),
})

export const ledgerQuerySchema = rangeQuerySchema.extend({ accountId: z.string().uuid() })

export const partyQuerySchema = z.object({
  type: z.enum(["customer", "supplier"]),
  asOf: day,
})

export const lockInputSchema = z.object({ lockedThrough: day.nullable() })

export const syncInputSchema = z.object({ full: z.boolean().default(false) })
