import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { toDateString } from "../invoicing/shared"
import { PAYMENT_METHOD_CATALOG } from "../pos/payment-methods-service"
import {
  type DraftEntry,
  type PaymentKind,
  postCustomerVoucher,
  postExpense,
  postOnlineOrder,
  postPosReturn,
  postPosSale,
  postPurchase,
  postPurchaseReturn,
  postSalesInvoice,
  postSalesPayment,
  postStockCount,
  postSupplierVoucher,
  type SimpleMethod,
  type SourceType,
  toCents,
} from "./postings"

// Reads the organization's documents and reduces each to what the books need. Read-only: the
// tables here belong to the apps that write them.
//
// Three kinds of document are high-volume (POS sales, POS returns, online orders), so on a routine
// pass only the ones touched since the last pass are read (`since`). The rest are few enough to
// read whole every time, which is also how a deleted payment or voucher is noticed.

export interface SourceDocument {
  type: SourceType
  id: string
  // Builds the entry. `cogs` is the cost of goods already fixed for this document, or null the
  // first time it is posted -- in which case today's product costs are used.
  build: (frozenCogs: number | null) => DraftEntry
}

export interface LoadedDocuments {
  documents: SourceDocument[]
  // Documents read in this pass that must NOT have an entry (a cancelled POS invoice).
  removed: Array<{ type: SourceType; id: string }>
  // The kinds read whole: an existing entry of one of these with no document behind it any more
  // is a deleted document.
  wholeTypes: SourceType[]
}

const WHOLE_TYPES: SourceType[] = [
  "sales_invoice",
  "sales_payment",
  "customer_voucher",
  "purchase",
  "purchase_return",
  "supplier_voucher",
  "expense",
  "stock_count",
]

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

// The calendar day in Saudi Arabia an instant falls on.
function riyadhDay(value: unknown): string {
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  return new Date(time + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
}

const dateOf = (value: unknown): string =>
  toDateString(value as Date | string | null) ?? riyadhDay(new Date())

type Row = Record<string, unknown>

function groupBy<T extends Row>(rows: T[], key: string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const id = String(row[key])
    const list = groups.get(id)
    if (list) list.push(row)
    else groups.set(id, [row])
  }
  return groups
}

const CATALOG_KIND = new Map(
  PAYMENT_METHOD_CATALOG.map((entry) => [entry.code, entry.kind as PaymentKind])
)

// A purchase, expense or voucher records how it was paid as a plain word.
function simpleMethod(value: unknown): SimpleMethod {
  const method = String(value ?? "").toLowerCase()
  if (method === "cash" || method === "cod") return "cash"
  if (method === "card" || method === "mada" || method.includes("visa") || method.includes("pay")) {
    return "card"
  }
  return "bank"
}

export async function loadDocuments(
  db: PostgresDatabase,
  organizationId: string,
  since: string | null
): Promise<LoadedDocuments> {
  const documents: SourceDocument[] = []
  const removed: LoadedDocuments["removed"] = []
  const query = async (sql: string, values: unknown[] = [organizationId]) =>
    (await db.query<Row>(sql, values)).rows
  // The high-volume kinds take the window; `column` is what marks a row as touched.
  const windowed = async (sql: string, column: string, tail = "") =>
    since
      ? query(`${sql} AND ${column} >= $2 ${tail}`, [organizationId, since])
      : query(`${sql} ${tail}`)

  // ---- Costs and payment kinds ----
  const costByProduct = new Map(
    (await query("SELECT id, cost_price FROM products WHERE organization_id = $1")).map((row) => [
      String(row.id),
      Number(row.cost_price ?? 0),
    ])
  )
  const customKinds = new Map(
    (
      await query(
        "SELECT code, settings FROM pos_payment_methods WHERE organization_id = $1 AND is_custom = true"
      )
    ).map((row) => [
      String(row.code),
      ((row.settings as { kind?: PaymentKind } | null)?.kind ?? "cash") as PaymentKind,
    ])
  )
  const kindOf = (code: unknown): PaymentKind =>
    CATALOG_KIND.get(String(code)) ?? customKinds.get(String(code)) ?? "cash"
  // What a list of sold or returned lines cost, at the products' current cost.
  const costOf = (lines: Row[] | undefined, quantityKey: string): number =>
    Math.round(
      (lines ?? []).reduce(
        (sum, line) =>
          sum + (costByProduct.get(String(line.product_id)) ?? 0) * Number(line[quantityKey] ?? 0),
        0
      ) * 100
    )

  // ---- POS sales ----
  const invoices = await windowed(
    `SELECT id, workspace_id, invoice_number, status, customer_id, payment_method_code,
            subtotal_amount, discount_amount, tax_amount, total_amount, created_at
       FROM pos_invoices WHERE organization_id = $1`,
    "updated_at"
  )
  const invoicePayments = groupBy(
    await windowed(
      `SELECT p.invoice_id, p.payment_method_code, p.amount
         FROM pos_invoice_payments p
         JOIN pos_invoices i ON i.id = p.invoice_id
        WHERE i.organization_id = $1`,
      "i.updated_at"
    ),
    "invoice_id"
  )
  const invoiceItems = groupBy(
    await windowed(
      `SELECT t.invoice_id, t.product_id, t.quantity
         FROM pos_invoice_items t
         JOIN pos_invoices i ON i.id = t.invoice_id
        WHERE i.organization_id = $1`,
      "i.updated_at"
    ),
    "invoice_id"
  )
  for (const row of invoices) {
    const id = String(row.id)
    if (row.status === "cancelled") {
      removed.push({ type: "pos_invoice", id })
      continue
    }
    const total = toCents(row.total_amount)
    const paid = invoicePayments.get(id)
    // An invoice from before split payments were stored has only its header method.
    const payments = paid?.length
      ? paid.map((payment) => ({
          kind: kindOf(payment.payment_method_code),
          amount: toCents(payment.amount),
        }))
      : [{ kind: kindOf(row.payment_method_code), amount: total }]
    const doc = {
      id,
      workspaceId: String(row.workspace_id),
      number: String(row.invoice_number),
      date: riyadhDay(row.created_at),
      customerId: row.customer_id ? String(row.customer_id) : null,
      subtotal: toCents(row.subtotal_amount),
      discount: toCents(row.discount_amount),
      tax: toCents(row.tax_amount),
      payments,
    }
    const cost = costOf(invoiceItems.get(id), "quantity")
    documents.push({ type: "pos_invoice", id, build: (frozen) => postPosSale(doc, frozen ?? cost) })
  }

  // ---- POS returns ----
  const returns = await windowed(
    `SELECT r.id, r.workspace_id, r.return_number, r.subtotal_amount, r.discount_amount,
            r.tax_amount, r.total_amount, r.refund_payment_method_code, r.created_at,
            i.customer_id
       FROM pos_invoice_returns r
       JOIN pos_invoices i ON i.id = r.invoice_id
      WHERE r.organization_id = $1`,
    "r.created_at"
  )
  const returnPayments = groupBy(
    await windowed(
      `SELECT p.return_id, p.payment_method_code, p.amount
         FROM pos_invoice_return_payments p
         JOIN pos_invoice_returns r ON r.id = p.return_id
        WHERE r.organization_id = $1`,
      "r.created_at"
    ),
    "return_id"
  )
  const returnItems = groupBy(
    await windowed(
      `SELECT t.return_id, t.product_id, t.quantity
         FROM pos_invoice_return_items t
         JOIN pos_invoice_returns r ON r.id = t.return_id
        WHERE r.organization_id = $1`,
      "r.created_at"
    ),
    "return_id"
  )
  for (const row of returns) {
    const id = String(row.id)
    const refunded = returnPayments.get(id)
    const doc = {
      id,
      workspaceId: String(row.workspace_id),
      number: String(row.return_number),
      date: riyadhDay(row.created_at),
      customerId: row.customer_id ? String(row.customer_id) : null,
      net: toCents(row.subtotal_amount) - toCents(row.discount_amount),
      tax: toCents(row.tax_amount),
      refunds: refunded?.length
        ? refunded.map((refund) => ({
            kind: kindOf(refund.payment_method_code),
            amount: toCents(refund.amount),
          }))
        : [{ kind: kindOf(row.refund_payment_method_code), amount: toCents(row.total_amount) }],
    }
    const cost = costOf(returnItems.get(id), "quantity")
    documents.push({
      type: "pos_return",
      id,
      build: (frozen) => postPosReturn(doc, frozen ?? cost),
    })
  }

  // ---- Online orders ----
  const orders = await windowed(
    `SELECT id, workspace_id, order_number, payment_status, payment_method_code, customer_id,
            shipping_cost, shipping_discount_amount, tax_amount, total_amount, status, created_at
       FROM madar_orders WHERE organization_id = $1`,
    "created_at"
  )
  const orderItems = groupBy(
    await windowed(
      `SELECT t.order_id, t.cost_price, t.quantity
         FROM madar_order_items t
         JOIN madar_orders o ON o.id = t.order_id
        WHERE o.organization_id = $1`,
      "o.created_at"
    ),
    "order_id"
  )
  for (const row of orders) {
    const id = String(row.id)
    if (row.status === "cancelled" || row.status === "refunded") {
      removed.push({ type: "online_order", id })
      continue
    }
    const doc = {
      id,
      workspaceId: String(row.workspace_id),
      number: String(row.order_number),
      date: riyadhDay(row.created_at),
      customerId: row.customer_id ? String(row.customer_id) : null,
      paid: row.payment_status === "paid",
      method: simpleMethod(row.payment_method_code),
      total: toCents(row.total_amount),
      tax: toCents(row.tax_amount),
      shipping: toCents(row.shipping_cost) - toCents(row.shipping_discount_amount),
    }
    // The order keeps the cost each line had when it was placed.
    const cost = Math.round(
      (orderItems.get(id) ?? []).reduce(
        (sum, line) => sum + Number(line.cost_price ?? 0) * Number(line.quantity ?? 0),
        0
      ) * 100
    )
    documents.push({
      type: "online_order",
      id,
      build: (frozen) => postOnlineOrder(doc, frozen ?? cost),
    })
  }

  // ---- Tax invoices and their payments ----
  const salesInvoices = await query(
    `SELECT id, workspace_id, number, document_type, invoice_kind, customer_id, issue_date,
            taxable_amount, tax_amount, total_amount, retention_amount, amount_due
       FROM sales_invoices
      WHERE organization_id = $1 AND status = 'issued' AND deleted_at IS NULL`
  )
  const prepayments = groupBy(
    await query(
      `SELECT p.invoice_id, p.net_amount, p.tax_amount
         FROM sales_invoice_prepayments p
         JOIN sales_invoices i ON i.id = p.invoice_id
        WHERE i.organization_id = $1`
    ),
    "invoice_id"
  )
  const issued = new Map<string, Row>()
  for (const row of salesInvoices) {
    const id = String(row.id)
    issued.set(id, row)
    const deducted = prepayments.get(id) ?? []
    const doc = {
      id,
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      number: String(row.number ?? ""),
      date: dateOf(row.issue_date),
      documentType: row.document_type as "invoice" | "credit_note" | "debit_note",
      kind: row.invoice_kind as "regular" | "advance" | "progress",
      customerId: row.customer_id ? String(row.customer_id) : null,
      taxable: toCents(row.taxable_amount),
      tax: toCents(row.tax_amount),
      total: toCents(row.total_amount),
      prepaidNet: deducted.reduce((sum, line) => sum + toCents(line.net_amount), 0),
      prepaidTax: deducted.reduce((sum, line) => sum + toCents(line.tax_amount), 0),
      retention: toCents(row.retention_amount),
      amountDue: toCents(row.amount_due),
    }
    documents.push({ type: "sales_invoice", id, build: () => postSalesInvoice(doc) })
  }
  for (const row of await query(
    `SELECT id, invoice_id, amount, paid_on, method
       FROM sales_invoice_payments WHERE organization_id = $1`
  )) {
    const invoice = issued.get(String(row.invoice_id))
    if (!invoice) continue
    const doc = {
      id: String(row.id),
      workspaceId: invoice.workspace_id ? String(invoice.workspace_id) : null,
      invoiceNumber: String(invoice.number ?? ""),
      date: dateOf(row.paid_on),
      method: simpleMethod(row.method),
      amount: toCents(row.amount),
      customerId: invoice.customer_id ? String(invoice.customer_id) : null,
    }
    documents.push({ type: "sales_payment", id: doc.id, build: () => postSalesPayment(doc) })
  }

  // ---- Customer receipts and payments (a POS sale or return on account is posted with its
  // invoice, so only the vouchers are read here) ----
  for (const row of await query(
    `SELECT id, workspace_id, customer_id, type, reference, amount, payment_method_code, created_at
       FROM customer_account_transactions
      WHERE organization_id = $1 AND type IN ('receipt', 'payment')`
  )) {
    const doc = {
      id: String(row.id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      reference: String(row.reference),
      date: riyadhDay(row.created_at),
      type: row.type as "receipt" | "payment",
      kind: kindOf(row.payment_method_code),
      amount: toCents(row.amount),
      customerId: String(row.customer_id),
    }
    documents.push({ type: "customer_voucher", id: doc.id, build: () => postCustomerVoucher(doc) })
  }

  // ---- Purchases ----
  const purchaseLines = groupBy(
    await query(
      `SELECT l.purchase_id, l.net_unit_cost, l.qty, l.discount, l.tax_percent
         FROM purchase_line_items l
         JOIN purchases p ON p.id = l.purchase_id
        WHERE p.organization_id = $1 AND p.deleted_at IS NULL`
    ),
    "purchase_id"
  )
  for (const row of await query(
    `SELECT id, workspace_id, code, supplier_id, date, order_tax_percent, discount_amount,
            shipping_amount, other_costs
       FROM purchases WHERE organization_id = $1 AND deleted_at IS NULL`
  )) {
    const id = String(row.id)
    // The same arithmetic the purchases screen shows the person (purchase.types.ts): each line
    // after its discount, its VAT, then the order-level tax on the lot.
    let linesNet = 0
    let linesTax = 0
    for (const line of purchaseLines.get(id) ?? []) {
      const net = Number(line.net_unit_cost) * Number(line.qty) - Number(line.discount ?? 0)
      linesNet += net
      linesTax += (net * Number(line.tax_percent ?? 0)) / 100
    }
    const orderTax = ((linesNet + linesTax) * Number(row.order_tax_percent ?? 0)) / 100
    const doc = {
      id,
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      code: String(row.code),
      date: dateOf(row.date),
      supplierId: String(row.supplier_id),
      cost: toCents(
        linesNet -
          Number(row.discount_amount ?? 0) +
          Number(row.shipping_amount ?? 0) +
          Number(row.other_costs ?? 0)
      ),
      tax: toCents(linesTax + orderTax),
    }
    documents.push({ type: "purchase", id, build: () => postPurchase(doc) })
  }

  const returnLines = groupBy(
    await query(
      `SELECT l.return_id, l.qty, l.unit_cost
         FROM purchase_return_items l
         JOIN purchase_returns r ON r.id = l.return_id
        WHERE r.organization_id = $1 AND r.deleted_at IS NULL`
    ),
    "return_id"
  )
  for (const row of await query(
    `SELECT id, workspace_id, code, supplier_id, return_date
       FROM purchase_returns WHERE organization_id = $1 AND deleted_at IS NULL`
  )) {
    const id = String(row.id)
    const doc = {
      id,
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      code: String(row.code),
      date: dateOf(row.return_date),
      supplierId: String(row.supplier_id),
      value: toCents(
        (returnLines.get(id) ?? []).reduce(
          (sum, line) => sum + Number(line.qty) * Number(line.unit_cost),
          0
        )
      ),
    }
    documents.push({ type: "purchase_return", id, build: () => postPurchaseReturn(doc) })
  }

  for (const row of await query(
    `SELECT id, workspace_id, reference, supplier_id, type, amount, payment_method,
            transaction_date
       FROM supplier_vouchers WHERE organization_id = $1 AND deleted_at IS NULL`
  )) {
    const doc = {
      id: String(row.id),
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      reference: String(row.reference),
      date: dateOf(row.transaction_date),
      type: row.type as "receipt" | "payment",
      method: simpleMethod(row.payment_method),
      amount: toCents(row.amount),
      supplierId: String(row.supplier_id),
    }
    documents.push({ type: "supplier_voucher", id: doc.id, build: () => postSupplierVoucher(doc) })
  }

  // ---- Expenses ----
  // An expense entered as including VAT carries it at the organization's standard rate, the same
  // way the VAT return report reads it.
  const defaultRate = await query(
    "SELECT rate_percent FROM tax_rates WHERE organization_id = $1 AND is_default = true"
  )
  const vatRate = defaultRate[0] ? Number(defaultRate[0].rate_percent) / 100 : 0.15
  for (const row of await query(
    `SELECT id, workspace_id, category_id, name, amount, payment_method, tax_inclusive,
            expense_date, reference_number
       FROM expenses
      WHERE organization_id = $1 AND deleted_at IS NULL AND status <> 'cancelled'`
  )) {
    const amount = toCents(row.amount)
    const doc = {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      date: dateOf(row.expense_date),
      name: String(row.name ?? ""),
      reference: String(row.reference_number ?? "") || "مصروف",
      categoryId: String(row.category_id),
      amount,
      tax: row.tax_inclusive ? Math.round((amount * vatRate) / (1 + vatRate)) : 0,
      method: simpleMethod(row.payment_method),
    }
    documents.push({ type: "expense", id: doc.id, build: () => postExpense(doc) })
  }

  // ---- Stock counts ----
  const countLines = groupBy(
    await query(
      `SELECT l.count_id, l.system_quantity, l.counted_quantity, l.unit_cost
         FROM stock_count_items l
         JOIN stock_counts c ON c.id = l.count_id
        WHERE c.organization_id = $1 AND c.status = 'completed'`
    ),
    "count_id"
  )
  for (const row of await query(
    `SELECT id, workspace_id, reference, count_date, completed_at
       FROM stock_counts WHERE organization_id = $1 AND status = 'completed'`
  )) {
    const id = String(row.id)
    const doc = {
      id,
      workspaceId: row.workspace_id ? String(row.workspace_id) : null,
      reference: String(row.reference),
      date: row.completed_at ? riyadhDay(row.completed_at) : dateOf(row.count_date),
      adjustment: toCents(
        (countLines.get(id) ?? []).reduce(
          (sum, line) =>
            sum +
            (Number(line.counted_quantity ?? 0) - Number(line.system_quantity ?? 0)) *
              Number(line.unit_cost ?? 0),
          0
        )
      ),
    }
    if (doc.adjustment !== 0) {
      documents.push({ type: "stock_count", id, build: () => postStockCount(doc) })
    }
  }

  return { documents, removed, wholeTypes: WHOLE_TYPES }
}
