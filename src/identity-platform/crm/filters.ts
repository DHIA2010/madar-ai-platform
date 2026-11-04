import { z } from "zod"

// The CRM pages' filter builder: every condition must hold ("AND"), plus an optional date range.
// Fields are a lead's own (stage, source, owner, interests, tags, values, dates, contact details)
// or one of the sales team's custom fields ("custom:<id>").

export const CONDITION_OPERATORS = [
  "is",
  "is_not",
  "contains",
  "includes",
  "excludes",
  "gt",
  "lt",
  "on_or_after",
  "on_or_before",
  "is_set",
  "is_empty",
] as const
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export const conditionSchema = z.object({
  field: z.string().min(1).max(64),
  op: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string().max(300), z.number(), z.boolean(), z.null()]).optional(),
})
export type FilterCondition = z.infer<typeof conditionSchema>

// ?conditions=<JSON array>, as the pages send it.
export const conditionsParamSchema = z
  .string()
  .max(8000)
  .optional()
  .transform((raw, context) => {
    if (!raw) return [] as FilterCondition[]
    try {
      return z.array(conditionSchema).max(30).parse(JSON.parse(raw))
    } catch {
      context.addIssue({ code: "custom", message: "Invalid conditions." })
      return z.NEVER
    }
  })

export const dateRangeParams = {
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}

// Is this ISO timestamp within [from, to] (whole days, inclusive)?
export function withinDays(value: string | Date | null | undefined, from?: string, to?: string) {
  if (!from && !to) return true
  if (!value) return false
  const day = new Date(value).toISOString().slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

export type FieldValue = string | number | boolean | string[] | null | undefined

function asText(value: FieldValue) {
  if (value === null || value === undefined) return ""
  return Array.isArray(value) ? value.join(" ") : String(value)
}

function isEmpty(value: FieldValue) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

// Does one value satisfy one condition? Dates compare as yyyy-mm-dd, numbers numerically, lists by
// membership ("includes"), everything else as case-insensitive text.
export function matchesCondition(value: FieldValue, condition: FilterCondition): boolean {
  const target = condition.value
  switch (condition.op) {
    case "is_set":
      return !isEmpty(value)
    case "is_empty":
      return isEmpty(value)
    case "is":
      if (Array.isArray(value)) return value.includes(String(target))
      if (typeof target === "boolean") return Boolean(value) === target
      return asText(value).toLowerCase() === String(target ?? "").toLowerCase()
    case "is_not":
      if (Array.isArray(value)) return !value.includes(String(target))
      if (typeof target === "boolean") return Boolean(value) !== target
      return asText(value).toLowerCase() !== String(target ?? "").toLowerCase()
    case "contains":
      return asText(value)
        .toLowerCase()
        .includes(String(target ?? "").toLowerCase())
    case "includes":
      return Array.isArray(value) && value.includes(String(target))
    case "excludes":
      return !Array.isArray(value) || !value.includes(String(target))
    case "gt":
      return value !== null && value !== undefined && Number(value) > Number(target)
    case "lt":
      return value !== null && value !== undefined && Number(value) < Number(target)
    case "on_or_after":
      return !isEmpty(value) && asText(value).slice(0, 10) >= String(target ?? "")
    case "on_or_before":
      return !isEmpty(value) && asText(value).slice(0, 10) <= String(target ?? "")
  }
}

export function matchesAll(
  read: (field: string) => FieldValue,
  conditions: FilterCondition[]
): boolean {
  return conditions.every((condition) => matchesCondition(read(condition.field), condition))
}
