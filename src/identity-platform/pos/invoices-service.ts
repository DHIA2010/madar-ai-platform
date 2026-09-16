import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosPaymentMethodsService } from "./payment-methods-service"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The literal payment_method_code stored on pos_invoices once more than one method was used --
// keeps the existing "filter/group by payment_method_code" callers (list(), summary(),
// shifts-service.ts) meaningful for a split sale instead of picking one method arbitrarily. The
// real per-method breakdown always lives in pos_invoice_payments.
const SPLIT_PAYMENT_CODE = "split"

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
  paymentAmountMismatch: () =>
    new IdentityError(
      "POS_INVOICE_PAYMENT_AMOUNT_MISMATCH",
      400,
      "validation",
      "The payment amounts must add up to the invoice total."
    ),
  deferredRequiresCustomer: () =>
    new IdentityError(
      "POS_INVOICE_DEFERRED_REQUIRES_CUSTOMER",
      400,
      "validation",
      "A deferred (آجل) amount must be attributed to a real customer."
    ),
  walletRequiresCustomer: () =>
    new IdentityError(
      "POS_INVOICE_WALLET_REQUIRES_CUSTOMER",
      400,
      "validation",
      "A customer-wallet amount must be attributed to a real customer."
    ),
  insufficientWalletBalance: () =>
    new IdentityError(
      "POS_INVOICE_INSUFFICIENT_WALLET_BALANCE",
      400,
      "validation",
      "The customer's wallet balance is lower than the amount being charged to it."
    ),
  customerNotFound: () =>
    new IdentityError(
      "POS_INVOICE_CUSTOMER_NOT_FOUND",
      404,
      "business",
      "The selected customer was not found."
    ),
}

export type InvoiceStatus = "completed" | "cancelled" | "returned"

export interface InvoiceItemInput {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
}

export interface InvoicePaymentInput {
  paymentMethodCode: string
  amount: number
}

export interface CreateInvoiceInput {
  organizationId: string
  workspaceId: string | null
  cashierUserId: string | null
  customerName: string | null
  customerPhone: string | null
  // A real customer this sale is attributed to (see migration 062_pos_split_payments.sql's
  // pos_invoices.customer_id) -- distinct from customerName/customerPhone, which stay a snapshot
  // either way. Required whenever any payment line uses a "credit"-kind method: a deferred
  // amount has to land on an actual account, not a free-text name.
  customerId: string | null
  // One or more methods settling this sale -- amounts must add up to the computed total exactly
  // (see create()). A single-entry array is the common case (one method, full amount).
  payments: InvoicePaymentInput[]
  discountAmount: number
  notes: string | null
  items: InvoiceItemInput[]
}

export interface InvoiceItemView extends InvoiceItemInput {
  lineTotal: number
}

export type InvoicePaymentView = InvoicePaymentInput

export interface InvoiceView {
  id: string
  workspaceId: string
  invoiceNumber: string
  status: InvoiceStatus
  customerName: string | null
  customerPhone: string | null
  customerId: string | null
  cashierUserId: string | null
  paymentMethodCode: string
  payments: InvoicePaymentView[]
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
  customer_id: string | null
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

interface InvoicePaymentRow {
  invoice_id: string
  payment_method_code: string
  amount: string | number
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

function mapPayment(row: InvoicePaymentRow): InvoicePaymentView {
  return {
    paymentMethodCode: row.payment_method_code,
    amount: Number(row.amount),
  }
}

function mapInvoice(
  row: InvoiceRow,
  items: InvoiceItemView[],
  payments: InvoicePaymentView[]
): InvoiceView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    invoiceNumber: row.invoice_number,
    status: row.status as InvoiceStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerId: row.customer_id,
    cashierUserId: row.cashier_user_id,
    paymentMethodCode: row.payment_method_code,
    payments,
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
  SELECT id, workspace_id, invoice_number, status, customer_name, customer_phone, customer_id,
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

    const invoiceIds = result.rows.map((row) => row.id)
    // A plain IN-list rather than `= ANY($1::uuid[])`: the latter is standard, well-supported SQL
    // against real Postgres, but the test harness's in-memory engine (pg-mem) silently returns no
    // rows for it (the same class of gap already documented on summary()'s FILTER avoidance).
    const idPlaceholders = invoiceIds.map((_, index) => `$${index + 1}`).join(", ")
    const [itemRows, paymentRows] = await Promise.all([
      this.database.query<InvoiceItemRow>(
        `SELECT invoice_id, product_id, product_name, unit_price, quantity, line_total
           FROM pos_invoice_items
          WHERE invoice_id IN (${idPlaceholders})`,
        invoiceIds
      ),
      this.database.query<InvoicePaymentRow>(
        `SELECT invoice_id, payment_method_code, amount
           FROM pos_invoice_payments
          WHERE invoice_id IN (${idPlaceholders})`,
        invoiceIds
      ),
    ])
    const itemsByInvoice = new Map<string, InvoiceItemView[]>()
    for (const item of itemRows.rows) {
      const list = itemsByInvoice.get(item.invoice_id) ?? []
      list.push(mapItem(item))
      itemsByInvoice.set(item.invoice_id, list)
    }
    const paymentsByInvoice = new Map<string, InvoicePaymentView[]>()
    for (const payment of paymentRows.rows) {
      const list = paymentsByInvoice.get(payment.invoice_id) ?? []
      list.push(mapPayment(payment))
      paymentsByInvoice.set(payment.invoice_id, list)
    }

    return result.rows.map((row) =>
      mapInvoice(row, itemsByInvoice.get(row.id) ?? [], paymentsByInvoice.get(row.id) ?? [])
    )
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
    if (input.payments.length === 0) throw INVOICE_ERRORS.invalidPaymentMethod()

    // Every payment line can only name a method this branch has actually turned on -- the same
    // list the payment picker itself is built from, so a request can never name a method the UI
    // would never have offered.
    const methods = await this.paymentMethodsService.list(input.organizationId, input.workspaceId)
    const methodByCode = new Map(methods.map((candidate) => [candidate.code, candidate]))
    for (const payment of input.payments) {
      const method = methodByCode.get(payment.paymentMethodCode)
      if (!method || !method.enabled) throw INVOICE_ERRORS.invalidPaymentMethod()
    }

    const subtotalAmount = input.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )
    const taxableAmount = Math.max(0, subtotalAmount - input.discountAmount)
    const taxAmount = Math.round(taxableAmount * VAT_RATE * 100) / 100
    const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100

    // The payment lines have to fully settle the invoice -- not more, not less. A tiny epsilon
    // absorbs float/decimal rounding noise across several lines, the same tolerance the frontend
    // checkout uses to decide when "المبلغ المتبقي" reads as zero.
    const paidAmount = Math.round(input.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
    if (Math.abs(paidAmount - totalAmount) > 0.01) throw INVOICE_ERRORS.paymentAmountMismatch()

    // A "credit" line defers that amount to the customer's real account instead of collecting it
    // now, and a "prepaid" line spends down their real wallet instead -- both can only ever be
    // attributed to a real, existing customer record.
    const sumByKind = (kind: string) =>
      Math.round(
        input.payments
          .filter((payment) => methodByCode.get(payment.paymentMethodCode)?.kind === kind)
          .reduce((sum, payment) => sum + payment.amount, 0) * 100
      ) / 100
    const deferredAmount = sumByKind("credit")
    const prepaidAmount = sumByKind("prepaid")
    if (deferredAmount > 0 && !input.customerId) throw INVOICE_ERRORS.deferredRequiresCustomer()
    if (prepaidAmount > 0 && !input.customerId) throw INVOICE_ERRORS.walletRequiresCustomer()

    let customerAccountBalance = 0
    if (input.customerId) {
      const customer = await this.database.query<{ id: string; account_balance: string | number }>(
        `SELECT id, account_balance FROM customers
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [input.customerId, input.organizationId]
      )
      const customerRow = customer.rows[0]
      if (!customerRow) throw INVOICE_ERRORS.customerNotFound()
      customerAccountBalance = Number(customerRow.account_balance) || 0
    }
    if (prepaidAmount > customerAccountBalance) throw INVOICE_ERRORS.insufficientWalletBalance()

    const id = randomUUID()
    const paymentMethodCode =
      input.payments.length === 1 ? input.payments[0].paymentMethodCode : SPLIT_PAYMENT_CODE

    const numberResult = await this.database.query<{ nextval: string }>(
      `SELECT nextval('pos_invoice_number_seq')`
    )
    const invoiceNumber = `INV-${String(numberResult.rows[0].nextval).padStart(6, "0")}`

    await this.database.withTransaction(async () => {
      await this.database.query(
        `INSERT INTO pos_invoices
           (id, organization_id, workspace_id, invoice_number, status, customer_name,
            customer_phone, customer_id, cashier_user_id, payment_method_code, subtotal_amount,
            discount_amount, tax_amount, total_amount, notes)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id,
          input.organizationId,
          input.workspaceId,
          invoiceNumber,
          input.customerName,
          input.customerPhone,
          input.customerId,
          input.cashierUserId,
          paymentMethodCode,
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

      for (const payment of input.payments) {
        await this.database.query(
          `INSERT INTO pos_invoice_payments (id, invoice_id, payment_method_code, amount)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), id, payment.paymentMethodCode, payment.amount]
        )
      }

      // A deferred ("آجل") portion and a wallet-funded portion both draw down the SAME unified
      // account -- one combined ledger entry for the sale, not two. Only the wallet-funded
      // portion has a solvency floor (deferred has none, that is what deferred means), so the
      // race-safe re-check below only guards on prepaidAmount even though the whole drawdown is
      // debited together.
      const accountDrawdown = Math.round((deferredAmount + prepaidAmount) * 100) / 100
      if (accountDrawdown > 0) {
        if (prepaidAmount > 0) {
          const debited = await this.database.query(
            `UPDATE customers SET account_balance = account_balance - $2, updated_at = now()
              WHERE id = $1 AND account_balance >= $3`,
            [input.customerId, accountDrawdown, prepaidAmount]
          )
          if (debited.rowCount === 0) throw INVOICE_ERRORS.insufficientWalletBalance()
        } else {
          await this.database.query(
            `UPDATE customers SET account_balance = account_balance - $2, updated_at = now()
              WHERE id = $1`,
            [input.customerId, accountDrawdown]
          )
        }

        await this.database.query(
          `INSERT INTO customer_account_transactions
             (id, organization_id, workspace_id, customer_id, type, reference, amount, invoice_id)
           VALUES ($1, $2, $3, $4, 'sale', $5, $6, $7)`,
          [
            randomUUID(),
            input.organizationId,
            input.workspaceId,
            input.customerId,
            invoiceNumber,
            accountDrawdown,
            id,
          ]
        )
      }
    })

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

    const existing = await this.database.query<{
      status: string
      customer_id: string | null
      workspace_id: string
      total_amount: string | number
    }>(
      `SELECT status, customer_id, workspace_id, total_amount FROM pos_invoices
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const invoiceRow = existing.rows[0]
    if (!invoiceRow) throw INVOICE_ERRORS.notFound()

    await this.database.withTransaction(async () => {
      await this.database.query(
        `UPDATE pos_invoices SET status = $3, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, status]
      )

      // A return always credits the FULL invoice total back to the customer's account as real
      // store credit -- regardless of how it was originally paid (cash, card, credit, or
      // wallet), a refund becomes account balance rather than cash handed back. Only the first
      // transition into "returned" credits anything -- calling this again on an
      // already-returned invoice must not credit twice.
      const totalAmount = Number(invoiceRow.total_amount) || 0
      if (
        status === "returned" &&
        invoiceRow.status !== "returned" &&
        invoiceRow.customer_id &&
        totalAmount > 0
      ) {
        const returnNumber = await this.database.query<{ nextval: string }>(
          `SELECT nextval('customer_return_number_seq')`
        )
        const reference = `RET-${String(returnNumber.rows[0].nextval).padStart(5, "0")}`

        await this.database.query(
          `UPDATE customers SET account_balance = account_balance + $2, updated_at = now()
            WHERE id = $1`,
          [invoiceRow.customer_id, totalAmount]
        )
        await this.database.query(
          `INSERT INTO customer_account_transactions
             (id, organization_id, workspace_id, customer_id, type, reference, amount, invoice_id)
           VALUES ($1, $2, $3, $4, 'return', $5, $6, $7)`,
          [
            randomUUID(),
            organizationId,
            invoiceRow.workspace_id,
            invoiceRow.customer_id,
            reference,
            totalAmount,
            id,
          ]
        )
      }
    })

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

    const [itemRows, paymentRows] = await Promise.all([
      this.database.query<InvoiceItemRow>(
        `SELECT invoice_id, product_id, product_name, unit_price, quantity, line_total
           FROM pos_invoice_items
          WHERE invoice_id = $1`,
        [id]
      ),
      this.database.query<InvoicePaymentRow>(
        `SELECT invoice_id, payment_method_code, amount
           FROM pos_invoice_payments
          WHERE invoice_id = $1`,
        [id]
      ),
    ])
    return mapInvoice(row, itemRows.rows.map(mapItem), paymentRows.rows.map(mapPayment))
  }
}
