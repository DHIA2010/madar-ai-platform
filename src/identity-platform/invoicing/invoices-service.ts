import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  submitZatcaClearance,
  submitZatcaReporting,
  ZatcaApiError,
  zatcaErrorMessage,
} from "../zatca/zatca-api-client"
import type { ZatcaDevicesService } from "../zatca/zatca-devices-service"
import {
  buildZatcaDocumentXml,
  type ZatcaBuyer,
  type ZatcaBuyerIdScheme,
  type ZatcaPrepayment,
  zatcaDocumentTotals,
} from "../zatca/zatca-ubl-standard"
import { computeDocument, retentionAmount, round2, zatcaLines } from "./calculations"
import type { InvoiceInput, LineInputPayload, NoteInput, PaymentInput } from "./schemas"
import {
  assertExemptionReasons,
  computePayload,
  type DocumentLineView,
  INVOICING_ERRORS,
  loadSeller,
  newPublicToken,
  nextDocumentNumber,
  partyFromInput,
  type PartySnapshot,
  readLines,
  readParty,
  readSeller,
  riyadhToday,
  type Sector,
  type SellerSnapshot,
  toDateString,
  toIso,
  toLineInput,
  toNumber,
  writeLines,
} from "./shared"

export type DocumentType = "invoice" | "credit_note" | "debit_note"
export type TaxType = "standard" | "simplified"
export type InvoiceKind = "regular" | "advance" | "progress"
// draft -> (pending_clearance ->) issued. A standard invoice ZATCA refuses goes back to draft.
export type InvoiceStatus = "draft" | "pending_clearance" | "issued" | "void"
// null: not sent to ZATCA (no device). pending: waiting for ZATCA's answer.
export type ZatcaState = "pending" | "cleared" | "reported" | "rejected" | null

export interface InvoiceView {
  id: string
  number: string | null
  documentType: DocumentType
  taxType: TaxType
  invoiceKind: InvoiceKind
  status: InvoiceStatus
  sector: Sector
  quotationId: string | null
  quotationNumber: string | null
  originalInvoiceId: string | null
  originalInvoiceNumber: string | null
  adjustmentReasonCode: string | null
  adjustmentReason: string | null
  claimNumber: number | null
  customerId: string | null
  customer: PartySnapshot
  seller: SellerSnapshot
  title: string | null
  reference: string | null
  issueDate: string
  supplyDate: string | null
  supplyEndDate: string | null
  dueDate: string | null
  paymentTerms: string | null
  paymentMeans: string
  currency: string
  discountType: "amount" | "percent"
  discountValue: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  prepaidAmount: number
  retentionPercent: number
  retentionAmount: number
  amountDue: number
  paidAmount: number
  creditedAmount: number
  debitedAmount: number
  // What the buyer still owes: amount due, plus debit notes, less credit notes and payments.
  balance: number
  paymentStatus: "unpaid" | "partial" | "paid" | "not_applicable"
  overdue: boolean
  terms: string | null
  notes: string | null
  publicToken: string
  issuedAt: string | null
  zatca: {
    status: ZatcaState
    signed: boolean
    uuid: string | null
    icv: number | null
    invoiceHash: string | null
    qrCode: string | null
    submittedAt: string | null
    warnings: string[]
    lastError: string | null
    lastErrorAr: string | null
    attempts: number
  }
  createdAt: string
  updatedAt: string
}

export interface InvoicePaymentView {
  id: string
  amount: number
  paidOn: string
  method: string
  reference: string | null
  notes: string | null
  createdAt: string
}

export interface InvoiceDetailView extends InvoiceView {
  lines: DocumentLineView[]
  payments: InvoicePaymentView[]
  prepayments: Array<{
    id: string
    advanceInvoiceId: string
    advanceInvoiceNumber: string | null
    netAmount: number
    taxAmount: number
    taxRate: number
  }>
  adjustments: Array<{
    id: string
    number: string | null
    documentType: DocumentType
    status: InvoiceStatus
    issueDate: string
    totalAmount: number
    zatcaStatus: ZatcaState
  }>
  // Advance payment invoices: how much (before VAT) later invoices haven't deducted yet.
  advanceRemaining: number | null
}

export interface AdvanceInvoiceOption {
  id: string
  number: string
  issueDate: string
  quotationId: string | null
  netAmount: number
  taxRate: number
  remainingNet: number
}

export interface InvoiceSummary {
  outstanding: number
  overdue: number
  overdueCount: number
  paidThisMonth: number
  draftCount: number
  issuedThisMonth: number
  zatcaAttention: number
}

const REASON_TEXT: Record<string, string> = {
  cancellation: "إلغاء أو وقف التوريد كليًا أو جزئيًا",
  essential_change: "تغيير جوهري في التوريد أدى إلى تغيير الضريبة المستحقة",
  price_amendment: "تعديل قيمة التوريد المتفق عليها مسبقًا",
  refund: "إرجاع السلع أو الخدمات",
  party_change: "تغيير بيانات البائع أو المشتري",
}

// Two tasks (or the timer and a click) must not send the same document at once.
const CLAIM_MS = 60_000

type Row = Record<string, unknown>

function zatcaWarnings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

// The QR in ZATCA's stamped copy of a cleared invoice (pretty-printed XML).
export function qrFromClearedXml(xml: string): string | null {
  return (
    xml.match(
      /<cbc:ID>QR<\/cbc:ID>\s*<cac:Attachment>\s*<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</
    )?.[1] ?? null
  )
}

const DIGITS = (value: string | null, length: number) =>
  !!value && new RegExp(`^\\d{${length}}$`).test(value)

// What ZATCA needs of a business buyer on a standard invoice: its name, its VAT number (or
// another identification such as its CR), and its national address.
export function missingBuyerFields(party: PartySnapshot): string[] {
  const missing: string[] = []
  if (!party.name.trim()) missing.push("name")
  if (party.vatNumber) {
    if (!/^3\d{13}3$/.test(party.vatNumber)) missing.push("vatNumber")
  } else if (!party.idScheme || !party.idValue) {
    missing.push("vatNumberOrId")
  }
  const saudi = (party.address.countryCode || "SA") === "SA"
  if (!party.address.street) missing.push("street")
  if (!party.address.city) missing.push("city")
  if (saudi) {
    if (!DIGITS(party.address.buildingNumber, 4)) missing.push("buildingNumber")
    if (!party.address.district) missing.push("district")
    if (!DIGITS(party.address.postalCode, 5)) missing.push("postalCode")
  }
  return missing
}

function missingSellerFields(seller: SellerSnapshot): string[] {
  const missing: string[] = []
  if (!seller.address.street) missing.push("street")
  if (!DIGITS(seller.address.buildingNumber, 4)) missing.push("buildingNumber")
  if (!seller.address.district) missing.push("district")
  if (!seller.address.city) missing.push("city")
  if (!DIGITS(seller.address.postalCode, 5)) missing.push("postalCode")
  return missing
}

function zatcaBuyer(party: PartySnapshot, taxType: TaxType): ZatcaBuyer | null {
  if (taxType === "simplified" && !party.vatNumber && !party.idValue) return null
  if (!party.name.trim()) return null
  const hasAddress = !!(party.address.street || party.address.city)
  return {
    name: party.name.trim(),
    vatNumber: party.vatNumber,
    otherId:
      !party.vatNumber && party.idScheme && party.idValue
        ? { scheme: party.idScheme as ZatcaBuyerIdScheme, value: party.idValue }
        : null,
    address: hasAddress
      ? {
          streetName: party.address.street,
          buildingNumber: party.address.buildingNumber,
          plotIdentification: party.address.secondaryNumber,
          citySubdivisionName: party.address.district,
          cityName: party.address.city,
          postalZone: party.address.postalCode,
          countryCode: party.address.countryCode || "SA",
        }
      : null,
  }
}

export class SalesInvoicesService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly devices: ZatcaDevicesService | null
  ) {}

  // ---- reading ---------------------------------------------------------------------------

  private async aggregates(organizationId: string) {
    const payments = await this.database.query<{ invoice_id: string; amount: string | number }>(
      `SELECT invoice_id, SUM(amount) AS amount FROM sales_invoice_payments
        WHERE organization_id = $1 GROUP BY invoice_id`,
      [organizationId]
    )
    const notes = await this.database.query<{
      original_invoice_id: string
      document_type: string
      amount: string | number
    }>(
      `SELECT original_invoice_id, document_type, SUM(total_amount) AS amount FROM sales_invoices
        WHERE organization_id = $1 AND original_invoice_id IS NOT NULL AND status = 'issued'
          AND deleted_at IS NULL
        GROUP BY original_invoice_id, document_type`,
      [organizationId]
    )
    const paid = new Map(payments.rows.map((row) => [row.invoice_id, toNumber(row.amount)]))
    const credited = new Map<string, number>()
    const debited = new Map<string, number>()
    for (const row of notes.rows) {
      const target = row.document_type === "credit_note" ? credited : debited
      target.set(row.original_invoice_id, toNumber(row.amount))
    }
    return { paid, credited, debited }
  }

  private map(
    row: Row,
    aggregates: Awaited<ReturnType<SalesInvoicesService["aggregates"]>>,
    numbers: Map<string, string | null>
  ): InvoiceView {
    const id = String(row.id)
    const documentType = row.document_type as DocumentType
    const status = row.status as InvoiceStatus
    const amountDue = toNumber(row.amount_due)
    const paidAmount = aggregates.paid.get(id) ?? 0
    const creditedAmount = aggregates.credited.get(id) ?? 0
    const debitedAmount = aggregates.debited.get(id) ?? 0
    const payable = documentType !== "credit_note" && status === "issued"
    const balance = payable ? round2(amountDue + debitedAmount - creditedAmount - paidAmount) : 0
    const dueDate = toDateString(row.due_date as Date | string | null)
    return {
      id,
      number: (row.number as string | null) ?? null,
      documentType,
      taxType: row.tax_type as TaxType,
      invoiceKind: row.invoice_kind as InvoiceKind,
      status,
      sector: row.sector as Sector,
      quotationId: (row.quotation_id as string | null) ?? null,
      quotationNumber: row.quotation_id ? (numbers.get(`q:${row.quotation_id}`) ?? null) : null,
      originalInvoiceId: (row.original_invoice_id as string | null) ?? null,
      originalInvoiceNumber: row.original_invoice_id
        ? (numbers.get(`i:${row.original_invoice_id}`) ?? null)
        : null,
      adjustmentReasonCode: (row.adjustment_reason_code as string | null) ?? null,
      adjustmentReason: (row.adjustment_reason as string | null) ?? null,
      claimNumber: row.claim_number === null ? null : Number(row.claim_number),
      customerId: (row.customer_id as string | null) ?? null,
      customer: readParty(row.customer),
      seller: readSeller(row.seller),
      title: (row.title as string | null) ?? null,
      reference: (row.reference as string | null) ?? null,
      issueDate: toDateString(row.issue_date as Date | string)!,
      supplyDate: toDateString(row.supply_date as Date | string | null),
      supplyEndDate: toDateString(row.supply_end_date as Date | string | null),
      dueDate,
      paymentTerms: (row.payment_terms as string | null) ?? null,
      paymentMeans: String(row.payment_means),
      currency: String(row.currency),
      discountType: row.discount_type as "amount" | "percent",
      discountValue: toNumber(row.discount_value),
      subtotal: toNumber(row.subtotal),
      discountAmount: toNumber(row.discount_amount),
      taxableAmount: toNumber(row.taxable_amount),
      taxAmount: toNumber(row.tax_amount),
      totalAmount: toNumber(row.total_amount),
      prepaidAmount: toNumber(row.prepaid_amount),
      retentionPercent: toNumber(row.retention_percent),
      retentionAmount: toNumber(row.retention_amount),
      amountDue,
      paidAmount,
      creditedAmount,
      debitedAmount,
      balance,
      paymentStatus: !payable
        ? "not_applicable"
        : balance <= 0.004
          ? "paid"
          : paidAmount > 0
            ? "partial"
            : "unpaid",
      overdue: payable && balance > 0.004 && !!dueDate && dueDate < riyadhToday(),
      terms: (row.terms as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      publicToken: String(row.public_token),
      issuedAt: toIso(row.issued_at as Date | null),
      zatca: {
        status: (row.zatca_status as ZatcaState) ?? null,
        signed: !!row.zatca_signed_xml,
        uuid: (row.zatca_uuid as string | null) ?? null,
        icv: row.icv === null || row.icv === undefined ? null : Number(row.icv),
        invoiceHash: (row.invoice_hash as string | null) ?? null,
        qrCode: (row.qr_code as string | null) ?? null,
        submittedAt: toIso(row.zatca_submitted_at as Date | null),
        warnings: zatcaWarnings(row.zatca_warnings),
        lastError: (row.zatca_last_error as string | null) ?? null,
        lastErrorAr: (row.zatca_last_error_ar as string | null) ?? null,
        attempts: Number(row.zatca_attempts ?? 0),
      },
      createdAt: toIso(row.created_at as Date)!,
      updatedAt: toIso(row.updated_at as Date)!,
    }
  }

  // Quotation and original-invoice numbers, for the views.
  private async numbers(organizationId: string): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>()
    const quotations = await this.database.query<{ id: string; number: string; revision: number }>(
      "SELECT id, number, revision FROM sales_quotations WHERE organization_id = $1",
      [organizationId]
    )
    for (const row of quotations.rows) {
      map.set(
        `q:${row.id}`,
        Number(row.revision) > 1 ? `${row.number}-R${row.revision}` : row.number
      )
    }
    const invoices = await this.database.query<{ id: string; number: string | null }>(
      "SELECT id, number FROM sales_invoices WHERE organization_id = $1",
      [organizationId]
    )
    for (const row of invoices.rows) map.set(`i:${row.id}`, row.number)
    return map
  }

  private async getRow(organizationId: string, id: string): Promise<Row> {
    const result = await this.database.query<Row>(
      `SELECT * FROM sales_invoices WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    )
    const row = result.rows[0]
    if (!row) throw INVOICING_ERRORS.notFound("invoice")
    return row
  }

  async list(
    organizationId: string,
    filters: {
      documentType?: string | null
      status?: string | null
      search?: string | null
      customerId?: string | null
      quotationId?: string | null
    }
  ): Promise<InvoiceView[]> {
    const params: unknown[] = [organizationId]
    const where = ["organization_id = $1", "deleted_at IS NULL"]
    if (filters.documentType && filters.documentType !== "all") {
      params.push(filters.documentType)
      where.push(`document_type = $${params.length}`)
    }
    if (filters.customerId) {
      params.push(filters.customerId)
      where.push(`customer_id = $${params.length}`)
    }
    if (filters.quotationId) {
      params.push(filters.quotationId)
      where.push(`quotation_id = $${params.length}`)
    }
    const result = await this.database.query<Row>(
      `SELECT * FROM sales_invoices WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(issued_at, created_at) DESC`,
      params
    )
    const aggregates = await this.aggregates(organizationId)
    const numbers = await this.numbers(organizationId)
    let items = result.rows.map((row) => this.map(row, aggregates, numbers))
    switch (filters.status) {
      case "draft":
        items = items.filter(
          (item) => item.status === "draft" || item.status === "pending_clearance"
        )
        break
      case "unpaid":
        items = items.filter(
          (item) => item.paymentStatus === "unpaid" || item.paymentStatus === "partial"
        )
        break
      case "overdue":
        items = items.filter((item) => item.overdue)
        break
      case "paid":
        items = items.filter((item) => item.paymentStatus === "paid")
        break
      case "zatca":
        items = items.filter(
          (item) => item.zatca.status === "rejected" || item.zatca.status === "pending"
        )
        break
    }
    const search = filters.search?.trim().toLowerCase()
    if (search) {
      items = items.filter((item) =>
        [item.number ?? "", item.customer.name, item.title ?? "", item.reference ?? ""].some(
          (value) => value.toLowerCase().includes(search)
        )
      )
    }
    return items
  }

  async summary(organizationId: string): Promise<InvoiceSummary> {
    const items = await this.list(organizationId, {})
    const month = riyadhToday().slice(0, 7)
    const payments = await this.database.query<{ amount: string | number; paid_on: Date | string }>(
      "SELECT amount, paid_on FROM sales_invoice_payments WHERE organization_id = $1",
      [organizationId]
    )
    const overdue = items.filter((item) => item.overdue)
    return {
      outstanding: round2(items.reduce((sum, item) => sum + Math.max(item.balance, 0), 0)),
      overdue: round2(overdue.reduce((sum, item) => sum + item.balance, 0)),
      overdueCount: overdue.length,
      paidThisMonth: round2(
        payments.rows
          .filter((row) => toDateString(row.paid_on)?.startsWith(month))
          .reduce((sum, row) => sum + toNumber(row.amount), 0)
      ),
      draftCount: items.filter((item) => item.status === "draft").length,
      issuedThisMonth: round2(
        items
          .filter(
            (item) =>
              item.status === "issued" &&
              item.documentType === "invoice" &&
              item.issueDate.startsWith(month)
          )
          .reduce((sum, item) => sum + item.totalAmount, 0)
      ),
      zatcaAttention: items.filter(
        (item) => item.zatca.status === "rejected" || item.zatca.status === "pending"
      ).length,
    }
  }

  async get(organizationId: string, id: string): Promise<InvoiceDetailView> {
    const row = await this.getRow(organizationId, id)
    const view = this.map(
      row,
      await this.aggregates(organizationId),
      await this.numbers(organizationId)
    )
    const lines = await readLines(this.database, "sales_invoice_lines", "invoice_id", id)
    const payments = await this.database.query<Row>(
      `SELECT * FROM sales_invoice_payments WHERE invoice_id = $1 ORDER BY paid_on, created_at`,
      [id]
    )
    const prepayments = await this.database.query<Row>(
      `SELECT p.*, a.number AS advance_number FROM sales_invoice_prepayments p
         JOIN sales_invoices a ON a.id = p.advance_invoice_id
        WHERE p.invoice_id = $1`,
      [id]
    )
    const adjustments = await this.database.query<Row>(
      `SELECT id, number, document_type, status, issue_date, total_amount, zatca_status
         FROM sales_invoices
        WHERE original_invoice_id = $1 AND organization_id = $2 AND deleted_at IS NULL
        ORDER BY created_at`,
      [id, organizationId]
    )
    return {
      ...view,
      // A draft shows the seller as it is now; an issued document as it was.
      seller:
        view.status === "draft" ? await loadSeller(this.database, organizationId) : view.seller,
      lines,
      payments: payments.rows.map((payment) => ({
        id: String(payment.id),
        amount: toNumber(payment.amount),
        paidOn: toDateString(payment.paid_on as Date | string)!,
        method: String(payment.method),
        reference: (payment.reference as string | null) ?? null,
        notes: (payment.notes as string | null) ?? null,
        createdAt: toIso(payment.created_at as Date)!,
      })),
      prepayments: prepayments.rows.map((entry) => ({
        id: String(entry.id),
        advanceInvoiceId: String(entry.advance_invoice_id),
        advanceInvoiceNumber: (entry.advance_number as string | null) ?? null,
        netAmount: toNumber(entry.net_amount),
        taxAmount: toNumber(entry.tax_amount),
        taxRate: toNumber(entry.tax_rate),
      })),
      adjustments: adjustments.rows.map((entry) => ({
        id: String(entry.id),
        number: (entry.number as string | null) ?? null,
        documentType: entry.document_type as DocumentType,
        status: entry.status as InvoiceStatus,
        issueDate: toDateString(entry.issue_date as Date | string)!,
        totalAmount: toNumber(entry.total_amount),
        zatcaStatus: (entry.zatca_status as ZatcaState) ?? null,
      })),
      advanceRemaining:
        view.invoiceKind === "advance" ? await this.advanceRemaining(id, view.taxableAmount) : null,
    }
  }

  private async advanceRemaining(advanceId: string, taxable: number, excludeInvoiceId?: string) {
    const used = await this.database.query<{ invoice_id: string; net_amount: string | number }>(
      `SELECT p.invoice_id, p.net_amount FROM sales_invoice_prepayments p
         JOIN sales_invoices i ON i.id = p.invoice_id
        WHERE p.advance_invoice_id = $1 AND i.deleted_at IS NULL AND i.status <> 'void'`,
      [advanceId]
    )
    const deducted = used.rows
      .filter((row) => row.invoice_id !== excludeInvoiceId)
      .reduce((sum, row) => sum + toNumber(row.net_amount), 0)
    return round2(taxable - deducted)
  }

  // Issued advance payment invoices that still have something to deduct.
  async listAdvances(
    organizationId: string,
    filters: {
      customerId?: string | null
      quotationId?: string | null
      excludeInvoiceId?: string | null
    }
  ): Promise<AdvanceInvoiceOption[]> {
    const result = await this.database.query<Row>(
      `SELECT id, number, issue_date, quotation_id, customer_id, taxable_amount, tax_amount
         FROM sales_invoices
        WHERE organization_id = $1 AND invoice_kind = 'advance' AND status = 'issued'
          AND document_type = 'invoice' AND deleted_at IS NULL
        ORDER BY issued_at`,
      [organizationId]
    )
    const options: AdvanceInvoiceOption[] = []
    for (const row of result.rows) {
      if (filters.quotationId && row.quotation_id && row.quotation_id !== filters.quotationId)
        continue
      if (filters.customerId && row.customer_id && row.customer_id !== filters.customerId) continue
      const taxable = toNumber(row.taxable_amount)
      const remainingNet = await this.advanceRemaining(
        String(row.id),
        taxable,
        filters.excludeInvoiceId ?? undefined
      )
      if (remainingNet <= 0.004) continue
      options.push({
        id: String(row.id),
        number: String(row.number),
        issueDate: toDateString(row.issue_date as Date | string)!,
        quotationId: (row.quotation_id as string | null) ?? null,
        netAmount: taxable,
        taxRate: taxable > 0 ? round2((toNumber(row.tax_amount) / taxable) * 100) : 0,
        remainingNet,
      })
    }
    return options
  }

  // ---- drafts ----------------------------------------------------------------------------

  private async validateQuotationLink(
    organizationId: string,
    invoiceId: string | null,
    input: InvoiceInput
  ): Promise<void> {
    if (!input.quotationId) {
      if (input.lines.some((line) => line.quotationLineId)) {
        throw INVOICING_ERRORS.invalid(
          "INVOICING_QUOTATION_REQUIRED",
          "Lines reference a quotation."
        )
      }
      return
    }
    const quotation = await this.database.query<{ status: string }>(
      `SELECT status FROM sales_quotations
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [input.quotationId, organizationId]
    )
    const status = quotation.rows[0]?.status
    if (!status) throw INVOICING_ERRORS.notFound("quotation")
    if (status === "declined" || status === "superseded") {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_NOT_BILLABLE",
        "A declined or superseded quotation can't be invoiced."
      )
    }
    const quotationLines = await this.database.query<{ id: string; quantity: string | number }>(
      "SELECT id, quantity FROM sales_quotation_lines WHERE quotation_id = $1",
      [input.quotationId]
    )
    const available = new Map(quotationLines.rows.map((row) => [row.id, toNumber(row.quantity)]))
    const billed = await this.database.query<{
      quotation_line_id: string
      invoice_id: string
      quantity: string | number
    }>(
      `SELECT l.quotation_line_id, l.invoice_id, l.quantity FROM sales_invoice_lines l
         JOIN sales_invoices i ON i.id = l.invoice_id
        WHERE i.quotation_id = $1 AND i.deleted_at IS NULL AND i.status <> 'void'
          AND i.document_type = 'invoice' AND l.quotation_line_id IS NOT NULL`,
      [input.quotationId]
    )
    const billedElsewhere = new Map<string, number>()
    for (const row of billed.rows) {
      if (row.invoice_id === invoiceId) continue
      billedElsewhere.set(
        row.quotation_line_id,
        (billedElsewhere.get(row.quotation_line_id) ?? 0) + toNumber(row.quantity)
      )
    }
    for (const [index, line] of input.lines.entries()) {
      if (!line.quotationLineId) continue
      const quantity = available.get(line.quotationLineId)
      if (quantity === undefined) {
        throw INVOICING_ERRORS.invalid(
          "INVOICING_QUOTATION_LINE_MISMATCH",
          "A line belongs to a different quotation.",
          { line: index + 1 }
        )
      }
      const total = (billedElsewhere.get(line.quotationLineId) ?? 0) + line.quantity
      if (total > quantity * 1.0001 + 0.0001) {
        throw INVOICING_ERRORS.invalid(
          "QUOTATION_OVERBILLED",
          "This would bill more than the quotation's quantity.",
          {
            line: index + 1,
            remaining: Math.max(0, quantity - (billedElsewhere.get(line.quotationLineId) ?? 0)),
          }
        )
      }
    }
  }

  private async resolvePrepayments(
    organizationId: string,
    invoiceId: string | null,
    input: InvoiceInput
  ): Promise<
    Array<{ advanceInvoiceId: string; netAmount: number; taxAmount: number; taxRate: number }>
  > {
    if (input.invoiceKind === "advance" && input.prepayments.length) {
      throw INVOICING_ERRORS.invalid(
        "INVOICING_ADVANCE_ON_ADVANCE",
        "An advance payment invoice can't deduct another advance."
      )
    }
    const options = await this.listAdvances(organizationId, { excludeInvoiceId: invoiceId })
    return input.prepayments.map((entry) => {
      const option = options.find((candidate) => candidate.id === entry.advanceInvoiceId)
      if (!option) {
        throw INVOICING_ERRORS.invalid(
          "INVOICING_ADVANCE_UNAVAILABLE",
          "That advance payment invoice isn't issued or is fully deducted."
        )
      }
      if (entry.netAmount > option.remainingNet + 0.004) {
        throw INVOICING_ERRORS.invalid(
          "INVOICING_ADVANCE_EXCEEDED",
          "That's more than what remains of the advance payment.",
          { remaining: option.remainingNet }
        )
      }
      return {
        advanceInvoiceId: entry.advanceInvoiceId,
        netAmount: round2(entry.netAmount),
        taxAmount: round2((entry.netAmount * option.taxRate) / 100),
        taxRate: option.taxRate,
      }
    })
  }

  private async saveDraft(
    organizationId: string,
    workspaceId: string | null,
    userId: string,
    existingId: string | null,
    input: InvoiceInput
  ): Promise<string> {
    assertExemptionReasons(input.lines)
    if (input.invoiceKind === "advance" && input.lines.some((line) => line.quotationLineId)) {
      throw INVOICING_ERRORS.invalid(
        "INVOICING_ADVANCE_LINES",
        "An advance payment invoice doesn't bill quotation lines."
      )
    }
    const computed = computePayload(input.lines, input)
    await this.validateQuotationLink(organizationId, existingId, input)
    const prepayments = await this.resolvePrepayments(organizationId, existingId, input)
    const prepaidAmount = round2(
      prepayments.reduce((sum, entry) => sum + entry.netAmount + entry.taxAmount, 0)
    )
    if (prepaidAmount > computed.totalAmount + 0.004) {
      throw INVOICING_ERRORS.invalid(
        "INVOICING_PREPAID_EXCEEDS_TOTAL",
        "The advance deducted is more than the invoice total."
      )
    }
    const retention =
      input.invoiceKind === "advance"
        ? 0
        : retentionAmount(computed.taxableAmount, input.retentionPercent)
    const amountDue = round2(computed.totalAmount - prepaidAmount - retention)

    let claimNumber = input.claimNumber
    if (input.invoiceKind === "progress" && !claimNumber && input.quotationId) {
      const claims = await this.database.query<{ id: string }>(
        `SELECT id FROM sales_invoices
          WHERE quotation_id = $1 AND invoice_kind = 'progress' AND deleted_at IS NULL`,
        [input.quotationId]
      )
      claimNumber = claims.rows.filter((claim) => claim.id !== existingId).length + 1
    }

    const id = existingId ?? randomUUID()
    const values: unknown[] = [
      id,
      organizationId,
      input.taxType,
      input.invoiceKind,
      input.sector,
      input.quotationId,
      claimNumber,
      input.customerId,
      JSON.stringify(partyFromInput(input.customer)),
      input.title,
      input.reference,
      input.issueDate,
      input.supplyDate,
      input.supplyEndDate,
      input.dueDate,
      input.paymentTerms,
      input.paymentMeans,
      input.discountType,
      input.discountValue,
      computed.subtotal,
      computed.discountAmount,
      computed.taxableAmount,
      computed.taxAmount,
      computed.totalAmount,
      prepaidAmount,
      input.invoiceKind === "advance" ? 0 : input.retentionPercent,
      retention,
      amountDue,
      input.terms,
      input.notes,
    ]
    await this.database.withTransaction(async () => {
      if (existingId) {
        await this.database.query(
          `UPDATE sales_invoices
              SET tax_type = $3, invoice_kind = $4, sector = $5, quotation_id = $6,
                  claim_number = $7, customer_id = $8, customer = $9::jsonb, title = $10,
                  reference = $11, issue_date = $12, supply_date = $13, supply_end_date = $14,
                  due_date = $15, payment_terms = $16, payment_means = $17, discount_type = $18,
                  discount_value = $19, subtotal = $20, discount_amount = $21,
                  taxable_amount = $22, tax_amount = $23, total_amount = $24,
                  prepaid_amount = $25, retention_percent = $26, retention_amount = $27,
                  amount_due = $28, terms = $29, notes = $30, updated_at = now()
            WHERE id = $1 AND organization_id = $2`,
          values
        )
      } else {
        await this.database.query(
          `INSERT INTO sales_invoices
             (id, organization_id, tax_type, invoice_kind, sector, quotation_id, claim_number,
              customer_id, customer, title, reference, issue_date, supply_date, supply_end_date,
              due_date, payment_terms, payment_means, discount_type, discount_value, subtotal,
              discount_amount, taxable_amount, tax_amount, total_amount, prepaid_amount,
              retention_percent, retention_amount, amount_due, terms, notes, workspace_id,
              public_token, created_by, document_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16,
                   $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
                   $33, 'invoice', 'draft')`,
          [...values, workspaceId, newPublicToken(), userId]
        )
      }
      await writeLines(
        this.database,
        "sales_invoice_lines",
        "invoice_id",
        id,
        input.lines,
        computed.lines
      )
      await this.database.query("DELETE FROM sales_invoice_prepayments WHERE invoice_id = $1", [id])
      for (const entry of prepayments) {
        await this.database.query(
          `INSERT INTO sales_invoice_prepayments
             (id, invoice_id, advance_invoice_id, net_amount, tax_amount, tax_rate)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            id,
            entry.advanceInvoiceId,
            entry.netAmount,
            entry.taxAmount,
            entry.taxRate,
          ]
        )
      }
    })
    return id
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    userId: string,
    input: InvoiceInput
  ): Promise<InvoiceDetailView> {
    const id = await this.saveDraft(organizationId, workspaceId, userId, null, input)
    return this.get(organizationId, id)
  }

  async update(
    organizationId: string,
    id: string,
    input: InvoiceInput
  ): Promise<InvoiceDetailView> {
    const row = await this.getRow(organizationId, id)
    if (row.status !== "draft") {
      throw INVOICING_ERRORS.conflict(
        "SALES_INVOICE_LOCKED",
        "An issued invoice can't be changed -- issue a credit or debit note instead."
      )
    }
    if (row.document_type !== "invoice") {
      throw INVOICING_ERRORS.conflict("SALES_INVOICE_LOCKED", "Edit a note from its own form.")
    }
    await this.saveDraft(organizationId, null, "", id, input)
    return this.get(organizationId, id)
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const row = await this.getRow(organizationId, id)
    if (row.status !== "draft" || row.zatca_signed_xml) {
      throw INVOICING_ERRORS.conflict(
        "SALES_INVOICE_LOCKED",
        "Only a draft that was never sent to ZATCA can be deleted."
      )
    }
    await this.database.query("DELETE FROM sales_invoices WHERE id = $1 AND organization_id = $2", [
      id,
      organizationId,
    ])
  }

  // A credit or debit note against an issued invoice, saved as a draft to review and issue.
  async createNote(
    organizationId: string,
    userId: string,
    invoiceId: string,
    input: NoteInput
  ): Promise<InvoiceDetailView> {
    const original = await this.get(organizationId, invoiceId)
    if (original.status !== "issued" || original.documentType !== "invoice") {
      throw INVOICING_ERRORS.conflict(
        "SALES_INVOICE_NOT_ISSUED",
        "Credit and debit notes are issued against an issued invoice."
      )
    }
    assertExemptionReasons(input.lines)
    const computed = computePayload(input.lines, { discountType: "amount", discountValue: 0 })
    if (input.documentType === "credit_note") {
      const creditable = round2(
        original.totalAmount + original.debitedAmount - original.creditedAmount
      )
      if (computed.totalAmount > creditable + 0.004) {
        throw INVOICING_ERRORS.invalid(
          "SALES_CREDIT_EXCEEDS_INVOICE",
          "The credit note is more than what's left of the invoice.",
          { remaining: creditable }
        )
      }
    }
    const reason = [REASON_TEXT[input.reasonCode], input.reason].filter(Boolean).join(" - ")
    const id = randomUUID()
    await this.database.withTransaction(async () => {
      // The note stays in its invoice's workspace, so the same workspace's ZATCA device signs it.
      await this.database.query(
        `INSERT INTO sales_invoices
           (id, organization_id, workspace_id, document_type, tax_type, invoice_kind, status,
            sector, original_invoice_id, adjustment_reason_code, adjustment_reason, customer_id,
            customer, seller, title, reference, issue_date, supply_date, payment_means,
            subtotal, discount_amount, taxable_amount, tax_amount, total_amount, amount_due,
            notes, public_token, created_by)
         VALUES ($1, $2, (SELECT workspace_id FROM sales_invoices WHERE id = $6), $3, $4, 'regular', 'draft', $5, $6, $7, $8, $9, $10::jsonb,
                 $11::jsonb, $12, $13, $14, $15, $16, $17, 0, $18, $19, $20, $21, $22, $23, $24)`,
        [
          id,
          organizationId,
          input.documentType,
          original.taxType,
          original.sector,
          original.id,
          input.reasonCode,
          reason,
          original.customerId,
          JSON.stringify(original.customer),
          JSON.stringify(original.seller),
          original.title,
          original.reference,
          riyadhToday(),
          original.supplyDate ?? original.issueDate,
          original.paymentMeans,
          computed.subtotal,
          computed.taxableAmount,
          computed.taxAmount,
          computed.totalAmount,
          computed.totalAmount,
          input.notes,
          newPublicToken(),
          userId,
        ]
      )
      await writeLines(
        this.database,
        "sales_invoice_lines",
        "invoice_id",
        id,
        input.lines,
        computed.lines
      )
    })
    return this.get(organizationId, id)
  }

  // ---- issuing ---------------------------------------------------------------------------

  // Gives the document its number, signs it on the organization's ZATCA device (when it has one)
  // and, for a standard invoice, waits for ZATCA to clear it -- refused, it's back to draft with
  // ZATCA's reasons. Without any ZATCA device the document is issued as is.
  async issue(organizationId: string, id: string): Promise<InvoiceDetailView> {
    const prepared = await this.database.withTransaction(async () => {
      // Everything is checked before the invoice is claimed, so a refusal leaves it untouched.
      const row = await this.getRow(organizationId, id)
      if (row.status !== "draft") {
        throw INVOICING_ERRORS.conflict(
          "SALES_INVOICE_NOT_DRAFT",
          "This invoice was already issued."
        )
      }
      const documentType = row.document_type as DocumentType
      const taxType = row.tax_type as TaxType
      const customer = readParty(row.customer)
      const lines = await readLines(this.database, "sales_invoice_lines", "invoice_id", id)
      if (toNumber(row.total_amount) <= 0) {
        throw INVOICING_ERRORS.invalid("SALES_INVOICE_EMPTY", "The total must be more than zero.")
      }
      if (taxType === "standard") {
        const missing = missingBuyerFields(customer)
        if (missing.length) {
          throw INVOICING_ERRORS.invalid(
            "SALES_INVOICE_BUYER_INCOMPLETE",
            "A tax invoice to a business needs the buyer's VAT number (or CR) and national address.",
            { fields: missing }
          )
        }
      }

      // The seller as it is now, frozen on the issued document (notes keep their invoice's).
      const seller =
        documentType === "invoice"
          ? await loadSeller(this.database, organizationId)
          : readSeller(row.seller)
      const lookup = this.devices
        ? await this.devices.findDeviceFor(
            organizationId,
            (row.workspace_id as string | null) ?? null,
            taxType
          )
        : { device: null, anyProduction: false }
      if (!lookup.device && lookup.anyProduction) {
        throw INVOICING_ERRORS.conflict(
          "ZATCA_DEVICE_STANDARD_UNSUPPORTED",
          taxType === "standard"
            ? "Your ZATCA device was registered for simplified invoices only -- register a new device to issue tax invoices to businesses."
            : "Your ZATCA device can't issue simplified invoices -- register a new device."
        )
      }
      if (lookup.device) {
        const missing = missingSellerFields(seller)
        if (missing.length) {
          throw INVOICING_ERRORS.invalid(
            "SALES_INVOICE_SELLER_INCOMPLETE",
            "Complete your national address in Settings before issuing invoices to ZATCA.",
            { fields: missing }
          )
        }
      }

      const claimed = await this.database.query<Row>(
        `UPDATE sales_invoices SET status = 'pending_clearance', updated_at = now()
          WHERE id = $1 AND organization_id = $2 AND status = 'draft' AND deleted_at IS NULL
          RETURNING id`,
        [id, organizationId]
      )
      if (!claimed.rows[0]) {
        throw INVOICING_ERRORS.conflict(
          "SALES_INVOICE_NOT_DRAFT",
          "This invoice was already issued."
        )
      }

      const number =
        (row.number as string | null) ??
        (await nextDocumentNumber(this.database, organizationId, documentType))
      const issueDate = riyadhToday()
      const supplyDate = toDateString(row.supply_date as Date | string | null) ?? issueDate
      await this.database.query(
        `UPDATE sales_invoices
            SET number = $3, issue_date = $4, supply_date = $5, seller = $6::jsonb,
                issued_at = now(), zatca_last_error = NULL, zatca_last_error_ar = NULL,
                zatca_warnings = NULL
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, number, issueDate, supplyDate, JSON.stringify(seller)]
      )

      if (!lookup.device || !this.devices) {
        await this.database.query(
          `UPDATE sales_invoices SET status = 'issued', zatca_status = NULL WHERE id = $1`,
          [id]
        )
        return { signed: false as const }
      }

      const issuedAt = new Date()
      const itemLines = lines.map((line) => ({
        ...toLineInput(lineAsPayload(line)),
        description: line.description,
      }))
      const computedLines = lines.map((line) => ({
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        effectiveRate: line.taxCategory === "S" ? line.taxRate : 0,
      }))
      const documentLines = zatcaLines(itemLines, computedLines)
      const allowances = computeDocument(
        lines.map((line) => toLineInput(lineAsPayload(line))),
        { type: "amount", value: toNumber(row.discount_amount) }
      ).allowances
      const prepayments = await this.prepaymentsForXml(id)
      const original = row.original_invoice_id
        ? await this.database.query<{ number: string | null }>(
            "SELECT number FROM sales_invoices WHERE id = $1",
            [row.original_invoice_id]
          )
        : null
      const adjustment =
        documentType === "invoice"
          ? null
          : {
              type: documentType === "credit_note" ? ("credit" as const) : ("debit" as const),
              originalInvoiceNumber: original?.rows[0]?.number ?? "",
              reason: String(row.adjustment_reason ?? REASON_TEXT.price_amendment),
            }
      const totals = zatcaDocumentTotals({ lines: documentLines, allowances, prepayments })
      const signed = await this.devices.signDocument(organizationId, lookup.device.id, {
        issuedAt,
        sellerName: seller.name,
        sellerVatNumber: seller.vatNumber ?? "",
        totalAmount: totals.taxInclusive,
        taxAmount: totals.taxAmount,
        advanceChain: true,
        build: (chain) =>
          buildZatcaDocumentXml({
            invoiceNumber: number,
            uuid: chain.uuid,
            issuedAt,
            invoiceTypeName: taxType === "standard" ? "0100000" : "0200000",
            isPrepayment: row.invoice_kind === "advance",
            icv: chain.icv,
            previousInvoiceHashBase64: chain.previousInvoiceHashBase64,
            sellerName: chain.sellerName,
            sellerVatNumber: chain.sellerVatNumber,
            sellerCommercialRegistration: seller.commercialRegistration,
            sellerAddress: {
              streetName: seller.address.street,
              buildingNumber: seller.address.buildingNumber,
              plotIdentification: seller.address.secondaryNumber,
              citySubdivisionName: seller.address.district,
              cityName: seller.address.city,
              postalZone: seller.address.postalCode,
            },
            buyer: zatcaBuyer(customer, taxType),
            supplyDate: new Date(`${supplyDate}T00:00:00Z`),
            supplyEndDate: row.supply_end_date
              ? new Date(`${toDateString(row.supply_end_date as Date | string)}T00:00:00Z`)
              : null,
            paymentMeansCode: String(row.payment_means ?? "30"),
            lines: documentLines,
            allowances,
            prepayments,
            notes: (row.notes as string | null)?.slice(0, 1000) ?? null,
            adjustment,
          }),
      })
      await this.database.query(
        `UPDATE sales_invoices
            SET status = $2, zatca_device_id = $3, icv = $4, previous_invoice_hash = $5,
                invoice_hash = $6, zatca_uuid = $7, zatca_signed_xml = $8, qr_code = $9,
                zatca_status = 'pending', zatca_cleared_xml = NULL, zatca_last_attempt_at = NULL
          WHERE id = $1`,
        [
          id,
          taxType === "standard" ? "pending_clearance" : "issued",
          lookup.device.id,
          signed.icv,
          signed.previousInvoiceHashBase64,
          signed.invoiceHash.toString("base64"),
          signed.uuid,
          Buffer.from(signed.signedXmlBase64, "base64").toString("utf8"),
          signed.qrCodeBase64,
        ]
      )
      return { signed: true as const }
    })

    if (prepared.signed) await this.submit(id)
    return this.get(organizationId, id)
  }

  private async prepaymentsForXml(invoiceId: string): Promise<ZatcaPrepayment[]> {
    const result = await this.database.query<Row>(
      `SELECT p.net_amount, p.tax_amount, p.tax_rate, a.id AS advance_id, a.number, a.zatca_uuid,
              a.issued_at
         FROM sales_invoice_prepayments p
         JOIN sales_invoices a ON a.id = p.advance_invoice_id
        WHERE p.invoice_id = $1`,
      [invoiceId]
    )
    return result.rows.map((row) => ({
      invoiceNumber: String(row.number),
      uuid: String(row.zatca_uuid ?? row.advance_id),
      issuedAt: row.issued_at instanceof Date ? row.issued_at : new Date(String(row.issued_at)),
      netAmount: toNumber(row.net_amount),
      taxAmount: toNumber(row.tax_amount),
      taxRatePercent: toNumber(row.tax_rate),
    }))
  }

  // Sends a signed document to ZATCA: clearance for a standard one, reporting for a simplified
  // one. Returns false when there was nothing to send (or someone else is sending it).
  async submit(id: string, organizationId?: string): Promise<boolean> {
    const params: unknown[] = [id, new Date(Date.now() - CLAIM_MS)]
    if (organizationId) params.push(organizationId)
    const claimed = await this.database.query<Row>(
      `UPDATE sales_invoices SET zatca_last_attempt_at = now()
        WHERE id = $1 AND zatca_signed_xml IS NOT NULL
          AND (status = 'pending_clearance' OR (status = 'issued' AND zatca_status IN ('pending', 'rejected')
               AND tax_type = 'simplified'))
          AND (zatca_last_attempt_at IS NULL OR zatca_last_attempt_at < $2)
          ${organizationId ? "AND organization_id = $3" : ""}
        RETURNING *`,
      params
    )
    const row = claimed.rows[0]
    if (!row || !this.devices) return false
    const taxType = row.tax_type as TaxType
    let submitOnce: ((language: "en" | "ar") => Promise<unknown>) | null = null
    try {
      const credentials = await this.devices.getProductionCredentials(
        String(row.organization_id),
        String(row.zatca_device_id)
      )
      const body = Buffer.from(String(row.zatca_signed_xml), "utf8").toString("base64")
      if (taxType === "standard") {
        const send = (language: "en" | "ar") =>
          submitZatcaClearance(
            credentials.environment,
            String(row.invoice_hash),
            String(row.zatca_uuid),
            body,
            credentials,
            language
          )
        submitOnce = send
        const result = await send("en")
        if (result.status !== "CLEARED") {
          await this.markRejected(
            id,
            zatcaErrorMessage(result.raw) ?? "ZATCA did not clear the invoice.",
            null,
            result.raw,
            "draft"
          )
          return true
        }
        const clearedXml = result.clearedInvoiceBase64
          ? Buffer.from(result.clearedInvoiceBase64, "base64").toString("utf8")
          : null
        await this.database.query(
          `UPDATE sales_invoices
              SET status = 'issued', zatca_status = 'cleared', zatca_cleared_xml = $2,
                  qr_code = COALESCE($3, qr_code), zatca_warnings = $4::jsonb,
                  zatca_response = $5::jsonb, zatca_submitted_at = now(),
                  zatca_attempts = zatca_attempts + 1, zatca_last_error = NULL,
                  zatca_last_error_ar = NULL, updated_at = now()
            WHERE id = $1`,
          [
            id,
            clearedXml,
            clearedXml ? qrFromClearedXml(clearedXml) : null,
            JSON.stringify(result.warnings),
            JSON.stringify(result.raw ?? null),
          ]
        )
        return true
      }
      const send = (language: "en" | "ar") =>
        submitZatcaReporting(
          credentials.environment,
          String(row.invoice_hash),
          String(row.zatca_uuid),
          body,
          credentials,
          language
        )
      submitOnce = send
      const report = await send("en")
      if (report.status === "NOT_REPORTED") {
        await this.markRejected(
          id,
          zatcaErrorMessage(report.raw) ?? "ZATCA did not accept the invoice.",
          null,
          report.raw,
          "issued"
        )
        return true
      }
      await this.database.query(
        `UPDATE sales_invoices
            SET zatca_status = 'reported', zatca_response = $2::jsonb, zatca_submitted_at = now(),
                zatca_attempts = zatca_attempts + 1, zatca_last_error = NULL,
                zatca_last_error_ar = NULL, updated_at = now()
          WHERE id = $1`,
        [id, JSON.stringify(report.raw ?? null)]
      )
      return true
    } catch (error) {
      if (error instanceof ZatcaApiError && error.status === 400) {
        // ZATCA words business rules in Arabic when asked: the same refusal once more, in Arabic.
        let reasonAr: string | null = null
        if (submitOnce) {
          reasonAr = await submitOnce("ar").then(
            () => null,
            (arabic: unknown) =>
              arabic instanceof ZatcaApiError ? zatcaErrorMessage(arabic.body, "ar") : null
          )
        }
        await this.markRejected(
          id,
          zatcaErrorMessage(error.body) ?? "ZATCA refused the invoice.",
          reasonAr,
          error.body,
          taxType === "standard" ? "draft" : "issued"
        )
        return true
      }
      const message =
        error instanceof ZatcaApiError
          ? (zatcaErrorMessage(error.body) ?? error.message)
          : error instanceof Error
            ? error.message
            : String(error)
      console.error("invoicing.zatca_submit_failed", { id, message })
      await this.database.query(
        `UPDATE sales_invoices
            SET zatca_status = 'pending', zatca_attempts = zatca_attempts + 1,
                zatca_last_error = $2, zatca_last_error_ar = $3, updated_at = now()
          WHERE id = $1`,
        [
          id,
          message.slice(0, 500),
          error instanceof ZatcaApiError ? zatcaErrorMessage(error.body, "ar") : null,
        ]
      )
      return true
    }
  }

  // A refused standard invoice goes back to draft (it never legally existed) to be corrected and
  // issued again -- it keeps its number. A refused simplified one was already handed over: it
  // stays issued, flagged, to be retried or corrected with a credit note.
  private async markRejected(
    id: string,
    error: string,
    errorAr: string | null,
    raw: unknown,
    status: "draft" | "issued"
  ): Promise<void> {
    await this.database.query(
      `UPDATE sales_invoices
          SET status = $2, zatca_status = 'rejected', zatca_last_error = $3,
              zatca_last_error_ar = $4, zatca_response = $5::jsonb,
              zatca_attempts = zatca_attempts + 1, updated_at = now()
        WHERE id = $1`,
      [
        id,
        status,
        error.slice(0, 2000),
        errorAr?.slice(0, 2000) ?? null,
        JSON.stringify(raw ?? null),
      ]
    )
  }

  // The retry button: sends again what's waiting for ZATCA.
  async retryZatca(organizationId: string, id: string): Promise<InvoiceDetailView> {
    const row = await this.getRow(organizationId, id)
    if (row.status === "draft") return this.issue(organizationId, id)
    const sent = await this.submit(id, organizationId)
    if (!sent) {
      throw INVOICING_ERRORS.conflict(
        "ZATCA_NOTHING_TO_SEND",
        "There's nothing waiting for ZATCA on this invoice, or it's being sent right now."
      )
    }
    return this.get(organizationId, id)
  }

  // The timer's pass: documents still waiting for ZATCA's answer (not refused ones).
  async submitPending(limit = 100): Promise<number> {
    const pending = await this.database.query<{ id: string }>(
      `SELECT id FROM sales_invoices
        WHERE zatca_signed_xml IS NOT NULL AND zatca_status = 'pending'
          AND status IN ('pending_clearance', 'issued')
        ORDER BY created_at
        LIMIT ${Math.max(1, Math.floor(limit))}`
    )
    let sent = 0
    for (const row of pending.rows) if (await this.submit(row.id)) sent += 1
    return sent
  }

  // ---- payments --------------------------------------------------------------------------

  async addPayment(
    organizationId: string,
    userId: string,
    invoiceId: string,
    input: PaymentInput
  ): Promise<InvoiceDetailView> {
    const invoice = await this.get(organizationId, invoiceId)
    if (invoice.status !== "issued" || invoice.documentType === "credit_note") {
      throw INVOICING_ERRORS.conflict(
        "SALES_INVOICE_NOT_PAYABLE",
        "Payments are recorded on issued invoices."
      )
    }
    if (input.amount > invoice.balance + 0.004) {
      throw INVOICING_ERRORS.invalid(
        "SALES_PAYMENT_EXCEEDS_BALANCE",
        "That's more than the balance.",
        {
          balance: invoice.balance,
        }
      )
    }
    await this.database.query(
      `INSERT INTO sales_invoice_payments
         (id, organization_id, invoice_id, amount, paid_on, method, reference, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        organizationId,
        invoiceId,
        round2(input.amount),
        input.paidOn,
        input.method,
        input.reference,
        input.notes,
        userId,
      ]
    )
    return this.get(organizationId, invoiceId)
  }

  async removePayment(
    organizationId: string,
    invoiceId: string,
    paymentId: string
  ): Promise<InvoiceDetailView> {
    await this.getRow(organizationId, invoiceId)
    await this.database.query(
      `DELETE FROM sales_invoice_payments
        WHERE id = $1 AND invoice_id = $2 AND organization_id = $3`,
      [paymentId, invoiceId, organizationId]
    )
    return this.get(organizationId, invoiceId)
  }

  // ---- public link -----------------------------------------------------------------------

  async getPublic(token: string): Promise<InvoiceDetailView> {
    const result = await this.database.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM sales_invoices
        WHERE public_token = $1 AND deleted_at IS NULL AND status = 'issued'`,
      [token]
    )
    const row = result.rows[0]
    if (!row) throw INVOICING_ERRORS.notFound("invoice")
    return this.get(row.organization_id, row.id)
  }

  async getPublicXml(token: string): Promise<{ number: string; xml: string }> {
    const result = await this.database.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM sales_invoices
        WHERE public_token = $1 AND deleted_at IS NULL AND status = 'issued'`,
      [token]
    )
    const row = result.rows[0]
    if (!row) throw INVOICING_ERRORS.notFound("invoice")
    return this.getXml(row.organization_id, row.id)
  }

  // ZATCA's own XML of an issued document: the cleared copy, else the signed one.
  async getXml(organizationId: string, id: string): Promise<{ number: string; xml: string }> {
    const row = await this.getRow(organizationId, id)
    const xml = (row.zatca_cleared_xml as string | null) ?? (row.zatca_signed_xml as string | null)
    if (!xml) {
      throw INVOICING_ERRORS.conflict(
        "SALES_INVOICE_NO_XML",
        "This document wasn't signed for ZATCA."
      )
    }
    return { number: String(row.number ?? id), xml }
  }
}

function lineAsPayload(line: DocumentLineView): LineInputPayload {
  return {
    lineType: line.lineType,
    productId: line.productId,
    quotationLineId: line.quotationLineId,
    description: line.description,
    details: line.details,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxCategory: line.taxCategory,
    taxRate: line.taxRate,
    exemptionCode: line.exemptionCode,
    exemptionReason: line.exemptionReason,
    progressPrevious: line.progressPrevious,
    progressCurrent: line.progressCurrent,
  }
}
