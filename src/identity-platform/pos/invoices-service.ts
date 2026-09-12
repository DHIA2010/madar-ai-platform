import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosPaymentMethodsService } from "./payment-methods-service"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INVOICE_ERRORS = {
  notFound: () => new IdentityError("POS_INVOICE_NOT_FOUND", 404, "business", "Invoice not found."),
  noWorkspace: () =>
    new IdentityError(
      "POS_INVOICE_NO_WORKSPACE",
      400,
      "validation",
      "A branch must be selected before recording a sale."
    ),
  invalidPaymentMethod: () =>
    new IdentityError(
      "POS_INVOICE_INVALID_PAYMENT_METHOD",
      400,
      "validation",
      "This payment method is not enabled for this branch."
    ),
}

export type InvoiceStatus = "completed" | "cancelled" | "returned"

export interface InvoiceItemInput {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
}

export interface CreateInvoiceInput {
  organizationId: string
  workspaceId: string | null
  cashierUserId: string | null
  customerName: string | null
  customerPhone: string | null
  paymentMethodCode: string
  discountAmount: number
  notes: string | null
  items: InvoiceItemInput[]
}

export interface InvoiceItemView extends InvoiceItemInput {
  lineTotal: number
}

export interface InvoiceView {
  id: string
  workspaceId: string
  invoiceNumber: string
  status: InvoiceStatus
  customerName: string | null
  customerPhone: string | null
  cashierUserId: string | null
  paymentMethodCode: string
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  createdAt: string
  items: InvoiceItemView[]
}

export interface InvoiceSummary {
  totalCount: number
  completedCount: number
  cancelledCount: number
  returnedCount: number
  // Over completed invoices only -- a cancelled or returned sale never happened for the purpose
  // of "what does a typical sale look like here", so it would only skew the figure.
  averageCompletedValue: number
  // Same completed-only scope as the average -- this is what the cashier screen's "مبيعات اليوم"
  // reads when filtered to today and the current branch.
  totalCompletedAmount: number
}

export interface InvoiceListFilter {
  workspaceId: string | null
  status: InvoiceStatus | null
  paymentMethodCode: string | null
  from: string | null
  to: string | null
  search: string | null
}

// Real VAT, not a made-up figure: 15% is Saudi Arabia's statutory standard rate. There is no tax
// configuration anywhere in this platform yet, so this is the one rate applied until a real
// per-organization tax setting exists.
export const VAT_RATE = 0.15

interface InvoiceRow {
  id: string
  workspace_id: string
  invoice_number: string
  status: string
  customer_name: string | null
  customer_phone: string | null
  cashier_user_id: string | null
  payment_method_code: string
  subtotal_amount: string | number
  discount_amount: string | number
  tax_amount: string | number
  total_amount: string | number
  notes: string | null
  created_at: Date | string
  [key: string]: unknown
}

interface InvoiceItemRow {
  invoice_id: string
  product_id: string | null
  product_name: string
  unit_price: string | number
  quantity: string | number
  line_total: string | number
  [key: string]: unknown
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapItem(row: InvoiceItemRow): InvoiceItemView {
  return {
    productId: row.product_id,
    productName: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    lineTotal: Number(row.line_total),
  }
}

function mapInvoice(row: InvoiceRow, items: InvoiceItemView[]): InvoiceView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    invoiceNumber: row.invoice_number,
    status: row.status as InvoiceStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    cashierUserId: row.cashier_user_id,
    paymentMethodCode: row.payment_method_code,
    subtotalAmount: Number(row.subtotal_amount),
    discountAmount: Number(row.discount_amount),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
    notes: row.notes,
    createdAt: toIso(row.created_at),
    items,
  }
}

const INVOICE_SELECT = `
  SELECT id, workspace_id, invoice_number, status, customer_name, customer_phone,
         cashier_user_id, payment_method_code, subtotal_amount, discount_amount, tax_amount,
         total_amount, notes, created_at
    FROM pos_invoices
`

export class PosInvoicesService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly paymentMethodsService: PosPaymentMethodsService
  ) {}

  async list(organizationId: string, filter: InvoiceListFilter): Promise<InvoiceView[]> {
    const conditions = ["organization_id = $1"]
    const params: unknown[] = [organizationId]

    if (filter.workspaceId) {
      params.push(filter.workspaceId)
      conditions.push(`workspace_id = $${params.length}`)
    }
    if (filter.status) {
      params.push(filter.status)
      conditions.push(`status = $${params.length}`)
    }
    if (filter.paymentMethodCode) {
      params.push(filter.paymentMethodCode)
      conditions.push(`payment_method_code = $${params.length}`)
    }
    if (filter.from) {
      params.push(filter.from)
      conditions.push(`created_at >= $${params.length}`)
    }
    if (filter.to) {
      params.push(filter.to)
      conditions.push(`created_at <= $${params.length}`)
    }
    if (filter.search) {
      params.push(`%${filter.search}%`)
      const term = `$${params.length}`
      conditions.push(
        `(invoice_number ILIKE ${term} OR customer_name ILIKE ${term} OR customer_phone ILIKE ${term})`
      )
    }

    const result = await this.database.query<InvoiceRow>(
      `${INVOICE_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
      params
    )
    if (result.rows.length === 0) return []

    const itemRows = await this.database.query<InvoiceItemRow>(
      `SELECT invoice_id, product_id, product_name, unit_price, quantity, line_total
         FROM pos_invoice_items
        WHERE invoice_id = ANY($1::uuid[])`,
      [result.rows.map((row) => row.id)]
    )
    const itemsByInvoice = new Map<string, InvoiceItemView[]>()
    for (const item of itemRows.rows) {
      const list = itemsByInvoice.get(item.invoice_id) ?? []
      list.push(mapItem(item))
      itemsByInvoice.set(item.invoice_id, list)
    }

    return result.rows.map((row) => mapInvoice(row, itemsByInvoice.get(row.id) ?? []))
  }

  // Same filters as list() (minus search, which has no bearing on the totals), so the summary
  // cards always describe exactly the rows the table below them shows.
  async summary(
    organizationId: string,
    filter: Omit<InvoiceListFilter, "search">
  ): Promise<InvoiceSummary> {
    const conditions = ["organization_id = $1"]
    const params: unknown[] = [organizationId]

    if (filter.workspaceId) {
      params.push(filter.workspaceId)
      conditions.push(`workspace_id = $${params.length}`)
    }
    if (filter.status) {
      params.push(filter.status)
      conditions.push(`status = $${params.length}`)
    }
    if (filter.paymentMethodCode) {
      params.push(filter.paymentMethodCode)
      conditions.push(`payment_method_code = $${params.length}`)
    }
    if (filter.from) {
      params.push(filter.from)
      conditions.push(`created_at >= $${params.length}`)
    }
    if (filter.to) {
      params.push(filter.to)
      conditions.push(`created_at <= $${params.length}`)
    }

    const result = await this.database.query<{
      total_count: string
      completed_count: string | null
      cancelled_count: string | null
      returned_count: string | null
      average_completed_value: string | null
      total_completed_amount: string | null
    }>(
      // sum(case when ...) rather than count(*) FILTER (WHERE ...): the test harness's in-memory
      // Postgres (pg-mem) does not implement FILTER, and silently returns the unfiltered count
      // for every column instead of erroring -- CASE is standard aggregate syntax every engine
      // (real Postgres included) supports the same way.
      `SELECT
         count(*) AS total_count,
         sum(case when status = 'completed' then 1 else 0 end) AS completed_count,
         sum(case when status = 'cancelled' then 1 else 0 end) AS cancelled_count,
         sum(case when status = 'returned' then 1 else 0 end) AS returned_count,
         avg(case when status = 'completed' then total_amount end) AS average_completed_value,
         sum(case when status = 'completed' then total_amount else 0 end) AS total_completed_amount
       FROM pos_invoices
       WHERE ${conditions.join(" AND ")}`,
      params
    )

    const row = result.rows[0]
    return {
      totalCount: Number(row?.total_count ?? 0),
      completedCount: Number(row?.completed_count ?? 0),
      cancelledCount: Number(row?.cancelled_count ?? 0),
      returnedCount: Number(row?.returned_count ?? 0),
      averageCompletedValue: row?.average_completed_value ? Number(row.average_completed_value) : 0,
      totalCompletedAmount: Number(row?.total_completed_amount ?? 0),
    }
  }

  async create(input: CreateInvoiceInput): Promise<InvoiceView> {
    if (!input.workspaceId) throw INVOICE_ERRORS.noWorkspace()

    // A sale can only be recorded against a payment method this branch has actually turned on --
    // the same list the "New Invoice" picker itself is built from, so a request can never name a
    // method the UI would never have offered.
    const methods = await this.paymentMethodsService.list(input.organizationId, input.workspaceId)
    const method = methods.find((candidate) => candidate.code === input.paymentMethodCode)
    if (!method || !method.enabled) throw INVOICE_ERRORS.invalidPaymentMethod()

    const id = randomUUID()
    const subtotalAmount = input.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )
    const taxableAmount = Math.max(0, subtotalAmount - input.discountAmount)
    const taxAmount = Math.round(taxableAmount * VAT_RATE * 100) / 100
    const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100

    const numberResult = await this.database.query<{ nextval: string }>(
      `SELECT nextval('pos_invoice_number_seq')`
    )
    const invoiceNumber = `INV-${String(numberResult.rows[0].nextval).padStart(6, "0")}`

    await this.database.query(
      `INSERT INTO pos_invoices
         (id, organization_id, workspace_id, invoice_number, status, customer_name,
          customer_phone, cashier_user_id, payment_method_code, subtotal_amount,
          discount_amount, tax_amount, total_amount, notes)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        input.organizationId,
        input.workspaceId,
        invoiceNumber,
        input.customerName,
        input.customerPhone,
        input.cashierUserId,
        input.paymentMethodCode,
        subtotalAmount,
        input.discountAmount,
        taxAmount,
        totalAmount,
        input.notes,
      ]
    )

    for (const item of input.items) {
      await this.database.query(
        `INSERT INTO pos_invoice_items
           (id, invoice_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          id,
          item.productId,
          item.productName,
          item.unitPrice,
          item.quantity,
          Math.round(item.unitPrice * item.quantity * 100) / 100,
        ]
      )
    }

    const created = await this.findById(input.organizationId, id)
    if (!created) throw INVOICE_ERRORS.notFound()
    return created
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: "cancelled" | "returned"
  ): Promise<InvoiceView> {
    if (!UUID_PATTERN.test(id)) throw INVOICE_ERRORS.notFound()

    const result = await this.database.query(
      `UPDATE pos_invoices SET status = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, status]
    )
    if (result.rowCount === 0) throw INVOICE_ERRORS.notFound()

    const updated = await this.findById(organizationId, id)
    if (!updated) throw INVOICE_ERRORS.notFound()
    return updated
  }

  private async findById(organizationId: string, id: string): Promise<InvoiceView | null> {
    const result = await this.database.query<InvoiceRow>(
      `${INVOICE_SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const row = result.rows[0]
    if (!row) return null

    const itemRows = await this.database.query<InvoiceItemRow>(
      `SELECT invoice_id, product_id, product_name, unit_price, quantity, line_total
         FROM pos_invoice_items
        WHERE invoice_id = $1`,
      [id]
    )
    return mapInvoice(row, itemRows.rows.map(mapItem))
  }
}
