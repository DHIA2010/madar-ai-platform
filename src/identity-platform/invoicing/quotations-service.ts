import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { round2 } from "./calculations"
import type { QuotationInput } from "./schemas"
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
  riyadhToday,
  type Sector,
  type SellerSnapshot,
  toDateString,
  toIso,
  toNumber,
  writeLines,
} from "./shared"

// draft -> sent -> accepted / declined. A quotation past its validity that was never answered
// shows as expired; one replaced by a revision is superseded.
export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "superseded"
export type QuotationDisplayStatus = QuotationStatus | "expired"

export interface QuotationView {
  id: string
  number: string
  revision: number
  revisionOf: string | null
  status: QuotationStatus
  displayStatus: QuotationDisplayStatus
  sector: Sector
  customerId: string | null
  customer: PartySnapshot
  title: string | null
  reference: string | null
  issueDate: string
  validUntil: string | null
  currency: string
  discountType: "amount" | "percent"
  discountValue: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  advancePercent: number
  retentionPercent: number
  paymentTerms: string | null
  terms: string | null
  notes: string | null
  publicToken: string
  sentAt: string | null
  respondedAt: string | null
  respondedBy: string | null
  declineReason: string | null
  createdAt: string
  updatedAt: string
  // What its invoices billed of its lines (before VAT), drafts included so nothing is billed twice.
  billedAmount: number
  billedPercent: number
  billingStatus: "none" | "partial" | "full"
  advanceBilledAmount: number
  invoiceCount: number
}

export interface QuotationLineView extends DocumentLineView {
  billedQuantity: number
  // Share of the line already billed (percent), the starting point of the next progress claim.
  billedPercent: number
}

export interface QuotationInvoiceSummary {
  id: string
  number: string | null
  invoiceKind: "regular" | "advance" | "progress"
  status: string
  claimNumber: number | null
  issueDate: string
  totalAmount: number
  zatcaStatus: string | null
}

export interface QuotationDetailView extends QuotationView {
  lines: QuotationLineView[]
  invoices: QuotationInvoiceSummary[]
  revisions: Array<{ id: string; revision: number; status: QuotationStatus; createdAt: string }>
  seller: SellerSnapshot
}

export interface QuotationSummary {
  openCount: number
  openAmount: number
  acceptedAmount: number
  acceptanceRate: number
  expiringSoon: number
  draftCount: number
}

type Row = Record<string, unknown>

function displayStatus(status: QuotationStatus, validUntil: string | null): QuotationDisplayStatus {
  if ((status === "sent" || status === "draft") && validUntil && validUntil < riyadhToday()) {
    return "expired"
  }
  return status
}

export class QuotationsService {
  constructor(private readonly database: PostgresDatabase) {}

  private map(
    row: Row,
    billing: { billed: number; advance: number; invoices: number } | undefined
  ): QuotationView {
    const status = row.status as QuotationStatus
    const validUntil = toDateString(row.valid_until as Date | string | null)
    const subtotal = toNumber(row.subtotal)
    const billed = billing?.billed ?? 0
    const billedPercent = subtotal > 0 ? Math.min(100, round2((billed / subtotal) * 100)) : 0
    return {
      id: String(row.id),
      number: String(row.number),
      revision: Number(row.revision),
      revisionOf: (row.revision_of as string | null) ?? null,
      status,
      displayStatus: displayStatus(status, validUntil),
      sector: row.sector as Sector,
      customerId: (row.customer_id as string | null) ?? null,
      customer: readParty(row.customer),
      title: (row.title as string | null) ?? null,
      reference: (row.reference as string | null) ?? null,
      issueDate: toDateString(row.issue_date as Date | string)!,
      validUntil,
      currency: String(row.currency),
      discountType: row.discount_type as "amount" | "percent",
      discountValue: toNumber(row.discount_value),
      subtotal,
      discountAmount: toNumber(row.discount_amount),
      taxableAmount: toNumber(row.taxable_amount),
      taxAmount: toNumber(row.tax_amount),
      totalAmount: toNumber(row.total_amount),
      advancePercent: toNumber(row.advance_percent),
      retentionPercent: toNumber(row.retention_percent),
      paymentTerms: (row.payment_terms as string | null) ?? null,
      terms: (row.terms as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      publicToken: String(row.public_token),
      sentAt: toIso(row.sent_at as Date | null),
      respondedAt: toIso(row.responded_at as Date | null),
      respondedBy: (row.responded_by as string | null) ?? null,
      declineReason: (row.decline_reason as string | null) ?? null,
      createdAt: toIso(row.created_at as Date)!,
      updatedAt: toIso(row.updated_at as Date)!,
      billedAmount: round2(billed),
      billedPercent,
      billingStatus: billed <= 0.004 ? "none" : billedPercent >= 99.99 ? "full" : "partial",
      advanceBilledAmount: round2(billing?.advance ?? 0),
      invoiceCount: billing?.invoices ?? 0,
    }
  }

  // Per quotation: what its invoices billed of its lines, its advance invoices, how many invoices.
  private async billingFor(
    organizationId: string
  ): Promise<Map<string, { billed: number; advance: number; invoices: number }>> {
    const invoices = await this.database.query<{
      id: string
      quotation_id: string
      invoice_kind: string
      subtotal: string | number
    }>(
      `SELECT id, quotation_id, invoice_kind, subtotal FROM sales_invoices
        WHERE organization_id = $1 AND quotation_id IS NOT NULL
          AND document_type = 'invoice' AND deleted_at IS NULL AND status <> 'void'`,
      [organizationId]
    )
    const linked = await this.database.query<{ invoice_id: string; amount: string | number }>(
      `SELECT l.invoice_id, SUM(l.net_amount) AS amount
         FROM sales_invoice_lines l
         JOIN sales_invoices i ON i.id = l.invoice_id
        WHERE i.organization_id = $1 AND l.quotation_line_id IS NOT NULL
        GROUP BY l.invoice_id`,
      [organizationId]
    )
    const linkedByInvoice = new Map(
      linked.rows.map((row) => [row.invoice_id, toNumber(row.amount)])
    )
    const map = new Map<string, { billed: number; advance: number; invoices: number }>()
    for (const row of invoices.rows) {
      const entry = map.get(row.quotation_id) ?? { billed: 0, advance: 0, invoices: 0 }
      entry.invoices += 1
      if (row.invoice_kind === "advance") entry.advance += toNumber(row.subtotal)
      else entry.billed += linkedByInvoice.get(row.id) ?? 0
      map.set(row.quotation_id, entry)
    }
    return map
  }

  private async getRow(organizationId: string, id: string): Promise<Row> {
    const result = await this.database.query<Row>(
      `SELECT * FROM sales_quotations WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    )
    const row = result.rows[0]
    if (!row) throw INVOICING_ERRORS.notFound("quotation")
    return row
  }

  async list(
    organizationId: string,
    filters: { status?: string | null; search?: string | null; customerId?: string | null }
  ): Promise<QuotationView[]> {
    const params: unknown[] = [organizationId]
    const where = ["organization_id = $1", "deleted_at IS NULL"]
    if (filters.customerId) {
      params.push(filters.customerId)
      where.push(`customer_id = $${params.length}`)
    }
    const result = await this.database.query<Row>(
      `SELECT * FROM sales_quotations WHERE ${where.join(" AND ")} ORDER BY created_at DESC`,
      params
    )
    const billing = await this.billingFor(organizationId)
    let items = result.rows.map((row) => this.map(row, billing.get(String(row.id))))
    // Superseded revisions stay reachable from their newer revision, not the list.
    if (filters.status !== "superseded") {
      items = items.filter((item) => item.status !== "superseded")
    }
    if (filters.status && filters.status !== "all") {
      items = items.filter((item) =>
        filters.status === "invoiced"
          ? item.billingStatus !== "none"
          : item.displayStatus === filters.status
      )
    }
    const search = filters.search?.trim().toLowerCase()
    if (search) {
      items = items.filter((item) =>
        [item.number, item.customer.name, item.title ?? "", item.reference ?? ""].some((value) =>
          value.toLowerCase().includes(search)
        )
      )
    }
    return items
  }

  async summary(organizationId: string): Promise<QuotationSummary> {
    const items = await this.list(organizationId, {})
    const open = items.filter((item) => item.displayStatus === "sent")
    const accepted = items.filter((item) => item.status === "accepted")
    const answered = items.filter(
      (item) => item.status === "accepted" || item.status === "declined"
    )
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    return {
      openCount: open.length,
      openAmount: round2(open.reduce((sum, item) => sum + item.totalAmount, 0)),
      acceptedAmount: round2(accepted.reduce((sum, item) => sum + item.totalAmount, 0)),
      acceptanceRate: answered.length ? round2((accepted.length / answered.length) * 100) : 0,
      expiringSoon: open.filter((item) => item.validUntil && item.validUntil <= soon).length,
      draftCount: items.filter((item) => item.status === "draft").length,
    }
  }

  async get(organizationId: string, id: string): Promise<QuotationDetailView> {
    const row = await this.getRow(organizationId, id)
    const billing = await this.billingFor(organizationId)
    const view = this.map(row, billing.get(id))
    const lines = await readLines(this.database, "sales_quotation_lines", "quotation_id", id)
    const billed = await this.database.query<{
      quotation_line_id: string
      quantity: string | number
    }>(
      `SELECT l.quotation_line_id, SUM(l.quantity) AS quantity
         FROM sales_invoice_lines l
         JOIN sales_invoices i ON i.id = l.invoice_id
        WHERE i.quotation_id = $1 AND i.deleted_at IS NULL AND i.status <> 'void'
          AND i.document_type = 'invoice' AND l.quotation_line_id IS NOT NULL
        GROUP BY l.quotation_line_id`,
      [id]
    )
    const billedByLine = new Map(
      billed.rows.map((entry) => [entry.quotation_line_id, toNumber(entry.quantity)])
    )
    const invoices = await this.database.query<Row>(
      `SELECT id, number, invoice_kind, status, claim_number, issue_date, total_amount, zatca_status
         FROM sales_invoices
        WHERE quotation_id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND document_type = 'invoice'
        ORDER BY created_at`,
      [id, organizationId]
    )
    // Every revision of this quotation (same number).
    const revisions = await this.database.query<Row>(
      `SELECT id, revision, status, created_at FROM sales_quotations
        WHERE organization_id = $1 AND number = $2 AND deleted_at IS NULL
        ORDER BY revision`,
      [organizationId, view.number]
    )
    return {
      ...view,
      lines: lines.map((line) => {
        const billedQuantity = billedByLine.get(line.id) ?? 0
        return {
          ...line,
          billedQuantity,
          billedPercent:
            line.quantity > 0 ? Math.min(100, round2((billedQuantity / line.quantity) * 100)) : 0,
        }
      }),
      invoices: invoices.rows.map((invoice) => ({
        id: String(invoice.id),
        number: (invoice.number as string | null) ?? null,
        invoiceKind: invoice.invoice_kind as QuotationInvoiceSummary["invoiceKind"],
        status: String(invoice.status),
        claimNumber: invoice.claim_number === null ? null : Number(invoice.claim_number),
        issueDate: toDateString(invoice.issue_date as Date | string)!,
        totalAmount: toNumber(invoice.total_amount),
        zatcaStatus: (invoice.zatca_status as string | null) ?? null,
      })),
      revisions: revisions.rows.map((revision) => ({
        id: String(revision.id),
        revision: Number(revision.revision),
        status: revision.status as QuotationStatus,
        createdAt: toIso(revision.created_at as Date)!,
      })),
      seller: await loadSeller(this.database, organizationId),
    }
  }

  async create(
    organizationId: string,
    workspaceId: string | null,
    userId: string,
    input: QuotationInput
  ): Promise<QuotationDetailView> {
    assertExemptionReasons(input.lines)
    const computed = computePayload(input.lines, input)
    const id = randomUUID()
    await this.database.withTransaction(async () => {
      const number = await nextDocumentNumber(this.database, organizationId, "quotation")
      await this.insert(id, organizationId, workspaceId, userId, number, 1, null, input, computed)
    })
    return this.get(organizationId, id)
  }

  private async insert(
    id: string,
    organizationId: string,
    workspaceId: string | null,
    userId: string,
    number: string,
    revision: number,
    revisionOf: string | null,
    input: QuotationInput,
    computed: ReturnType<typeof computePayload>
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO sales_quotations
         (id, organization_id, workspace_id, number, revision, revision_of, status, sector,
          customer_id, customer, title, reference, issue_date, valid_until, discount_type,
          discount_value, subtotal, discount_amount, taxable_amount, tax_amount, total_amount,
          advance_percent, retention_percent, payment_terms, terms, notes, public_token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
      [
        id,
        organizationId,
        workspaceId,
        number,
        revision,
        revisionOf,
        input.sector,
        input.customerId,
        JSON.stringify(partyFromInput(input.customer)),
        input.title,
        input.reference,
        input.issueDate,
        input.validUntil,
        input.discountType,
        input.discountValue,
        computed.subtotal,
        computed.discountAmount,
        computed.taxableAmount,
        computed.taxAmount,
        computed.totalAmount,
        input.advancePercent,
        input.retentionPercent,
        input.paymentTerms,
        input.terms,
        input.notes,
        newPublicToken(),
        userId,
      ]
    )
    await writeLines(
      this.database,
      "sales_quotation_lines",
      "quotation_id",
      id,
      input.lines,
      computed.lines
    )
  }

  // A draft, sent or declined quotation can be changed in place; once accepted or billed, changes
  // go into a new revision so what the customer agreed to stays on record.
  async update(
    organizationId: string,
    id: string,
    input: QuotationInput
  ): Promise<QuotationDetailView> {
    const row = await this.getRow(organizationId, id)
    const status = row.status as QuotationStatus
    const billing = (await this.billingFor(organizationId)).get(id)
    if (status === "accepted" || status === "superseded" || (billing?.invoices ?? 0) > 0) {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_LOCKED",
        "This quotation was accepted or invoiced -- create a revision to change it."
      )
    }
    assertExemptionReasons(input.lines)
    const computed = computePayload(input.lines, input)
    await this.database.withTransaction(async () => {
      await this.database.query(
        `UPDATE sales_quotations
            SET sector = $3, customer_id = $4, customer = $5::jsonb, title = $6, reference = $7,
                issue_date = $8, valid_until = $9, discount_type = $10, discount_value = $11,
                subtotal = $12, discount_amount = $13, taxable_amount = $14, tax_amount = $15,
                total_amount = $16, advance_percent = $17, retention_percent = $18,
                payment_terms = $19, terms = $20, notes = $21, updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [
          id,
          organizationId,
          input.sector,
          input.customerId,
          JSON.stringify(partyFromInput(input.customer)),
          input.title,
          input.reference,
          input.issueDate,
          input.validUntil,
          input.discountType,
          input.discountValue,
          computed.subtotal,
          computed.discountAmount,
          computed.taxableAmount,
          computed.taxAmount,
          computed.totalAmount,
          input.advancePercent,
          input.retentionPercent,
          input.paymentTerms,
          input.terms,
          input.notes,
        ]
      )
      await writeLines(
        this.database,
        "sales_quotation_lines",
        "quotation_id",
        id,
        input.lines,
        computed.lines
      )
    })
    return this.get(organizationId, id)
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: "draft" | "sent" | "accepted" | "declined",
    declineReason: string | null,
    respondedBy: string | null = null
  ): Promise<QuotationDetailView> {
    const row = await this.getRow(organizationId, id)
    if (row.status === "superseded") {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_SUPERSEDED",
        "A newer revision replaced this quotation."
      )
    }
    await this.database.query(
      `UPDATE sales_quotations
          SET status = $3::text,
              sent_at = CASE WHEN $3::text = 'sent' AND sent_at IS NULL THEN now() ELSE sent_at END,
              responded_at = CASE WHEN $3::text IN ('accepted', 'declined') THEN now() ELSE NULL END,
              responded_by = CASE WHEN $3::text IN ('accepted', 'declined') THEN $5::text ELSE NULL END,
              decline_reason = CASE WHEN $3::text = 'declined' THEN $4::text ELSE NULL END,
              updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [id, organizationId, status, declineReason, respondedBy]
    )
    return this.get(organizationId, id)
  }

  // A new revision: same number, revision + 1, back to draft; the one it replaces is superseded.
  async revise(organizationId: string, id: string, userId: string): Promise<QuotationDetailView> {
    const source = await this.get(organizationId, id)
    if (source.status === "superseded") {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_SUPERSEDED",
        "A newer revision replaced this quotation."
      )
    }
    const latest = Math.max(...source.revisions.map((revision) => revision.revision))
    const newId = randomUUID()
    const input = this.asInput(source)
    await this.database.withTransaction(async () => {
      await this.insert(
        newId,
        organizationId,
        null,
        userId,
        source.number,
        latest + 1,
        id,
        { ...input, issueDate: riyadhToday() },
        computePayload(input.lines, input)
      )
      await this.database.query(
        `UPDATE sales_quotations SET status = 'superseded', updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId]
      )
    })
    return this.get(organizationId, newId)
  }

  async duplicate(
    organizationId: string,
    id: string,
    userId: string
  ): Promise<QuotationDetailView> {
    const source = await this.get(organizationId, id)
    return this.create(organizationId, null, userId, {
      ...this.asInput(source),
      issueDate: riyadhToday(),
      validUntil: null,
    })
  }

  private asInput(source: QuotationDetailView): QuotationInput {
    return {
      sector: source.sector,
      customerId: source.customerId,
      customer: {
        ...source.customer,
        idScheme: source.customer.idScheme as QuotationInput["customer"]["idScheme"],
      },
      title: source.title,
      reference: source.reference,
      issueDate: source.issueDate,
      validUntil: source.validUntil,
      discountType: source.discountType,
      discountValue: source.discountValue,
      advancePercent: source.advancePercent,
      retentionPercent: source.retentionPercent,
      paymentTerms: source.paymentTerms,
      terms: source.terms,
      notes: source.notes,
      lines: source.lines.map((line) => ({
        lineType: line.lineType,
        productId: line.productId,
        quotationLineId: null,
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
        progressPrevious: null,
        progressCurrent: null,
      })),
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.getRow(organizationId, id)
    const billing = (await this.billingFor(organizationId)).get(id)
    if ((billing?.invoices ?? 0) > 0) {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_HAS_INVOICES",
        "This quotation has invoices and can't be deleted."
      )
    }
    await this.database.query(
      `UPDATE sales_quotations SET deleted_at = now() WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    )
  }

  // The customer's link: the quotation with the seller, and whether it can still be answered.
  async getPublic(token: string): Promise<QuotationDetailView & { canRespond: boolean }> {
    const result = await this.database.query<Row>(
      `SELECT id, organization_id FROM sales_quotations
        WHERE public_token = $1 AND deleted_at IS NULL AND status <> 'draft'`,
      [token]
    )
    const row = result.rows[0]
    if (!row) throw INVOICING_ERRORS.notFound("quotation")
    const view = await this.get(String(row.organization_id), String(row.id))
    return { ...view, canRespond: view.displayStatus === "sent" }
  }

  async respondPublic(
    token: string,
    action: "accept" | "decline",
    name: string,
    reason: string | null
  ): Promise<QuotationDetailView & { canRespond: boolean }> {
    const view = await this.getPublic(token)
    if (!view.canRespond) {
      throw INVOICING_ERRORS.conflict(
        "QUOTATION_CANNOT_RESPOND",
        "This quotation can no longer be answered."
      )
    }
    const organization = await this.database.query<{ organization_id: string }>(
      "SELECT organization_id FROM sales_quotations WHERE id = $1",
      [view.id]
    )
    await this.setStatus(
      organization.rows[0].organization_id,
      view.id,
      action === "accept" ? "accepted" : "declined",
      action === "decline" ? reason : null,
      name
    )
    return this.getPublic(token)
  }
}
