import { randomBytes, randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { ZatcaTaxCategory } from "../zatca/zatca-ubl-standard"
import { computeDocument, type LineInput } from "./calculations"
import type { LineInputPayload, PartyInput } from "./schemas"

export type Sector = "general" | "services" | "contracting"

export interface Address {
  street: string | null
  buildingNumber: string | null
  secondaryNumber: string | null
  district: string | null
  city: string | null
  postalCode: string | null
  countryCode: string
}

// The buyer as it was on the document.
export interface PartySnapshot {
  name: string
  vatNumber: string | null
  idScheme: string | null
  idValue: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  address: Address
}

// The seller as it was when the document was saved/issued (Settings -> الإعدادات العامة).
export interface SellerSnapshot {
  name: string
  vatNumber: string | null
  commercialRegistration: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  address: Address
}

export interface DocumentLineView {
  id: string
  position: number
  lineType: "item" | "section" | "note"
  productId: string | null
  quotationLineId: string | null
  description: string
  details: string | null
  unit: string | null
  quantity: number
  unitPrice: number
  discountPercent: number
  taxCategory: ZatcaTaxCategory
  taxRate: number
  exemptionCode: string | null
  exemptionReason: string | null
  netAmount: number
  taxAmount: number
  progressPrevious: number | null
  progressCurrent: number | null
}

export const INVOICING_ERRORS = {
  notFound: (what: "quotation" | "invoice") =>
    new IdentityError(
      what === "quotation" ? "QUOTATION_NOT_FOUND" : "SALES_INVOICE_NOT_FOUND",
      404,
      "business",
      what === "quotation" ? "Quotation not found." : "Invoice not found."
    ),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 409, "business", message, details),
  invalid: (code: string, message: string, details?: Record<string, unknown>) =>
    new IdentityError(code, 422, "business", message, details),
}

export const toNumber = (value: unknown) =>
  value === null || value === undefined ? 0 : Number(value)
export const toIso = (value: Date | string | null | undefined) =>
  value === null || value === undefined
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString()

// node-pg turns a date column into local midnight; this reads it back as the calendar date.
export function toDateString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value.slice(0, 10)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Today in Saudi Arabia, as YYYY-MM-DD.
export function riyadhToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })
}

export const newPublicToken = () => randomBytes(24).toString("base64url")

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

const EMPTY_ADDRESS: Address = {
  street: null,
  buildingNumber: null,
  secondaryNumber: null,
  district: null,
  city: null,
  postalCode: null,
  countryCode: "SA",
}

export function readParty(value: unknown): PartySnapshot {
  const raw = parseJson<Partial<PartySnapshot>>(value, {})
  return {
    name: raw.name ?? "",
    vatNumber: raw.vatNumber ?? null,
    idScheme: raw.idScheme ?? null,
    idValue: raw.idValue ?? null,
    contactName: raw.contactName ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    address: { ...EMPTY_ADDRESS, ...(raw.address ?? {}) },
  }
}

export function partyFromInput(input: PartyInput): PartySnapshot {
  return {
    name: input.name,
    vatNumber: input.vatNumber,
    idScheme: input.idScheme,
    idValue: input.idValue,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
    address: { ...EMPTY_ADDRESS, ...input.address },
  }
}

export function readSeller(value: unknown): SellerSnapshot {
  const raw = parseJson<Partial<SellerSnapshot>>(value, {})
  return {
    name: raw.name ?? "",
    vatNumber: raw.vatNumber ?? null,
    commercialRegistration: raw.commercialRegistration ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    website: raw.website ?? null,
    logoUrl: raw.logoUrl ?? null,
    address: { ...EMPTY_ADDRESS, ...(raw.address ?? {}) },
  }
}

// The organization's identity today, from its settings.
export async function loadSeller(
  database: PostgresDatabase,
  organizationId: string
): Promise<SellerSnapshot> {
  const result = await database.query<{
    name: string
    logo_url: string | null
    settings: Record<string, unknown> | string | null
  }>("SELECT name, logo_url, settings FROM organizations WHERE id = $1", [organizationId])
  const row = result.rows[0]
  const settings = parseJson<Record<string, unknown>>(row?.settings, {})
  const field = (key: string) =>
    typeof settings[key] === "string" && (settings[key] as string).trim()
      ? (settings[key] as string).trim()
      : null
  return {
    name: field("storeName") ?? row?.name ?? "",
    vatNumber: field("taxNumber"),
    commercialRegistration: field("commercialRegistration"),
    phone: field("phone"),
    email: field("email"),
    website: field("website"),
    logoUrl: row?.logo_url ?? null,
    address: {
      street: field("street"),
      buildingNumber: field("buildingNumber"),
      secondaryNumber: field("secondaryNumber"),
      district: field("district"),
      city: field("city"),
      postalCode: field("postalCode"),
      countryCode: "SA",
    },
  }
}

// The next number of a kind for the organization -- inside the caller's transaction, so a
// rolled-back issue never burns one.
export async function nextDocumentNumber(
  database: PostgresDatabase,
  organizationId: string,
  kind: "quotation" | "invoice" | "credit_note" | "debit_note"
): Promise<string> {
  const prefix = { quotation: "QT", invoice: "SI", credit_note: "CN", debit_note: "DN" }[kind]
  const result = await database.query<{ last_value: string | number }>(
    `INSERT INTO sales_document_counters (organization_id, kind, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (organization_id, kind)
     DO UPDATE SET last_value = sales_document_counters.last_value + 1
     RETURNING last_value`,
    [organizationId, kind]
  )
  return `${prefix}-${String(result.rows[0].last_value).padStart(6, "0")}`
}

export function toLineInput(line: LineInputPayload): LineInput {
  return {
    lineType: line.lineType,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxCategory: line.taxCategory,
    taxRate: line.taxCategory === "S" ? line.taxRate : 0,
    exemptionCode: line.taxCategory === "S" ? null : line.exemptionCode,
    exemptionReason: line.taxCategory === "S" ? null : line.exemptionReason,
  }
}

export function computePayload(
  lines: LineInputPayload[],
  discount: { discountType: "amount" | "percent"; discountValue: number }
) {
  const computed = computeDocument(lines.map(toLineInput), {
    type: discount.discountType,
    value: discount.discountValue,
  })
  if (!lines.some((line) => line.lineType === "item")) {
    throw INVOICING_ERRORS.invalid("INVOICING_NO_ITEMS", "Add at least one item line.")
  }
  return computed
}

// A non-standard VAT category must say why (its VATEX code), as ZATCA requires.
export function assertExemptionReasons(lines: LineInputPayload[]): void {
  const missing = lines.findIndex(
    (line) => line.lineType === "item" && line.taxCategory !== "S" && !line.exemptionCode
  )
  if (missing >= 0) {
    throw INVOICING_ERRORS.invalid(
      "INVOICING_EXEMPTION_REASON_REQUIRED",
      "A zero-rated, exempt or out-of-scope line needs its exemption reason.",
      { line: missing + 1 }
    )
  }
}

// Replaces a document's lines (quotation or invoice), with the amounts computed for them.
export async function writeLines(
  database: PostgresDatabase,
  table: "sales_quotation_lines" | "sales_invoice_lines",
  parentColumn: "quotation_id" | "invoice_id",
  parentId: string,
  lines: LineInputPayload[],
  computed: Array<{ netAmount: number; taxAmount: number }>
): Promise<void> {
  await database.query(`DELETE FROM ${table} WHERE ${parentColumn} = $1`, [parentId])
  const isInvoice = table === "sales_invoice_lines"
  for (const [index, line] of lines.entries()) {
    const input = toLineInput(line)
    const columns = [
      "id",
      parentColumn,
      "position",
      "line_type",
      "product_id",
      "description",
      "details",
      "unit",
      "quantity",
      "unit_price",
      "discount_percent",
      "tax_category",
      "tax_rate",
      "exemption_code",
      "exemption_reason",
      "net_amount",
      "tax_amount",
    ]
    const values: unknown[] = [
      randomUUID(),
      parentId,
      index + 1,
      line.lineType,
      line.productId,
      line.description,
      line.details,
      line.unit,
      line.lineType === "item" ? line.quantity : 0,
      line.lineType === "item" ? line.unitPrice : 0,
      line.lineType === "item" ? line.discountPercent : 0,
      input.taxCategory,
      input.taxRate,
      input.exemptionCode,
      input.exemptionReason,
      computed[index].netAmount,
      computed[index].taxAmount,
    ]
    if (isInvoice) {
      columns.push("quotation_line_id", "progress_previous", "progress_current")
      values.push(line.quotationLineId, line.progressPrevious, line.progressCurrent)
    }
    await database.query(
      `INSERT INTO ${table} (${columns.join(", ")})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
      values
    )
  }
}

export function mapLine(row: Record<string, unknown>): DocumentLineView {
  return {
    id: String(row.id),
    position: Number(row.position),
    lineType: row.line_type as DocumentLineView["lineType"],
    productId: (row.product_id as string | null) ?? null,
    quotationLineId: (row.quotation_line_id as string | null | undefined) ?? null,
    description: String(row.description ?? ""),
    details: (row.details as string | null) ?? null,
    unit: (row.unit as string | null) ?? null,
    quantity: toNumber(row.quantity),
    unitPrice: toNumber(row.unit_price),
    discountPercent: toNumber(row.discount_percent),
    taxCategory: row.tax_category as ZatcaTaxCategory,
    taxRate: toNumber(row.tax_rate),
    exemptionCode: (row.exemption_code as string | null) ?? null,
    exemptionReason: (row.exemption_reason as string | null) ?? null,
    netAmount: toNumber(row.net_amount),
    taxAmount: toNumber(row.tax_amount),
    progressPrevious:
      row.progress_previous === null || row.progress_previous === undefined
        ? null
        : Number(row.progress_previous),
    progressCurrent:
      row.progress_current === null || row.progress_current === undefined
        ? null
        : Number(row.progress_current),
  }
}

export async function readLines(
  database: PostgresDatabase,
  table: "sales_quotation_lines" | "sales_invoice_lines",
  parentColumn: "quotation_id" | "invoice_id",
  parentId: string
): Promise<DocumentLineView[]> {
  const result = await database.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE ${parentColumn} = $1 ORDER BY position`,
    [parentId]
  )
  return result.rows.map(mapLine)
}
