import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import { writeAuditLog } from "../infrastructure/postgres/audit-log-writer"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { TaxRatesService } from "../tax/tax-rates-service"
import type { PosPaymentMethodsService } from "./payment-methods-service"
import { generateZatcaQrCode } from "./zatca-qr-code"

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
  // Guards invoice immutability: an issued invoice can only ever move completed -> cancelled or
  // completed -> returned, exactly once. Re-finalizing an invoice that already left "completed"
  // (a second cancel, a return after a cancel, etc.) would be a silent, uncontrolled alteration of
  // a document that must stay as-issued -- corrections belong in a future credit-note/refund
  // record referencing the original, never in an edit to it.
  alreadyFinalized: () =>
    new IdentityError(
      "POS_INVOICE_ALREADY_FINALIZED",
      409,
      "business",
      "This invoice has already been cancelled or returned and cannot be changed again."
    ),
  invoiceNotReturnable: () =>
    new IdentityError(
      "POS_INVOICE_NOT_RETURNABLE",
      409,
      "business",
      "This invoice is cancelled or already fully returned -- there is nothing left to return."
    ),
  returnItemNotFound: () =>
    new IdentityError(
      "POS_INVOICE_RETURN_ITEM_NOT_FOUND",
      404,
      "business",
      "One of the selected lines does not belong to this invoice."
    ),
  returnQuantityExceedsRemaining: () =>
    new IdentityError(
      "POS_INVOICE_RETURN_QUANTITY_EXCEEDS_REMAINING",
      400,
      "validation",
      "The return quantity for a line exceeds what is still left on that line."
    ),
  returnRequiresItems: () =>
    new IdentityError(
      "POS_INVOICE_RETURN_REQUIRES_ITEMS",
      400,
      "validation",
      "A return must include at least one item."
    ),
}

export type InvoiceStatus = "completed" | "cancelled" | "returned" | "partially_returned"

export interface InvoiceItemInput {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  // A discount applied to just this line -- resolved client-side to a plain currency amount the
  // same way the order-level discountAmount below already is (POS itself decides percent vs
  // fixed, tax-inclusive or not; this service only ever sees the final number). Optional/absent
  // means no line discount, same as 0.
  discountAmount?: number
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
  // This specific pos_invoice_items row's own id -- how a return (see createReturn()) says
  // exactly which line, and how much of it, is being returned.
  id: string
  lineTotal: number
  discountAmount: number
  // This line's own final taxable base and VAT -- after its own discount AND its share of the
  // order-wide discount, at its own effective tax rate, with gross/net pricing already resolved.
  // Always self-consistent: netAmount + taxAmount is exactly this line's contribution to the
  // invoice's own taxableAmount + taxAmount (see create()'s per-line loop). Distinct from
  // unitPrice/lineTotal, which stay the raw as-charged figures no discount or tax ever touches.
  netAmount: number
  taxAmount: number
  // Cumulative quantity already returned across every past return event on this line -- what a
  // return dialog subtracts from `quantity` to know how much is actually still left to return.
  returnedQuantity: number
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
  // ZATCA Phase 1 fields -- see zatca-qr-code.ts and migration 067. qrCode is generated on every
  // sale regardless of whether the organization has a VAT number on file yet (loadSellerSnapshot)
  // -- an unset VAT number just means an empty tag inside the QR, never a fabricated one; qrCode
  // is only ever null for an invoice issued before this feature existed. sellerVatNumber/
  // sellerAddress stay null until the organization's tax profile actually has them.
  qrCode: string | null
  sellerName: string | null
  sellerVatNumber: string | null
  sellerAddress: string | null
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

// One line of a return event -- always references the ORIGINAL pos_invoice_items row it is
// returning against, so createReturn() can validate and accumulate returned_quantity correctly.
export interface InvoiceReturnItemView {
  id: string
  invoiceItemId: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  netAmount: number
  taxAmount: number
}

// A real credit note (إشعار دائن) -- see createReturn(). Mirrors InvoiceView's own real-money
// shape (subtotal/discount/tax/total, seller snapshot, QR) for the same reason an invoice has
// them: this is a real, independently-issued fiscal document, not just a note attached to the
// original invoice.
export interface InvoiceReturnView {
  id: string
  organizationId: string
  workspaceId: string
  invoiceId: string
  // The original sale's own invoice_number -- shown on the printed credit note ("رقم فاتورة
  // البيع") so it can always be traced back to exactly which sale it corrects.
  invoiceNumber: string
  returnNumber: string
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  // The method the refund was actually given back through -- see createReturn(). Purely
  // informational for cash/card/transfer/bnpl; for 'credit'/'prepaid' it is what decided whether
  // this return also credited the customer's real account balance.
  refundPaymentMethodCode: string | null
  notes: string | null
  createdAt: string
  items: InvoiceReturnItemView[]
  qrCode: string | null
  sellerName: string | null
  sellerVatNumber: string | null
  sellerAddress: string | null
}

// 15% is Saudi Arabia's statutory standard VAT rate -- used as the last-resort fallback only if
// an organization's real configured default tax rate (TaxRatesService.getDefaultRatePercent, now
// what create() actually charges) could somehow not be read. Exported so the frontend's live
// checkout preview has an immediate number to render before its own real rate finishes loading.
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
  qr_code: string | null
  seller_name: string | null
  seller_vat_number: string | null
  seller_address: string | null
  [key: string]: unknown
}

interface InvoiceItemRow {
  id: string
  invoice_id: string
  product_id: string | null
  product_name: string
  unit_price: string | number
  quantity: string | number
  line_total: string | number
  discount_amount: string | number
  net_amount: string | number
  tax_amount: string | number
  returned_quantity: string | number
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
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    lineTotal: Number(row.line_total),
    discountAmount: Number(row.discount_amount),
    netAmount: Number(row.net_amount),
    taxAmount: Number(row.tax_amount),
    returnedQuantity: Number(row.returned_quantity),
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
    qrCode: row.qr_code,
    sellerName: row.seller_name,
    sellerVatNumber: row.seller_vat_number,
    sellerAddress: row.seller_address,
  }
}

interface InvoiceReturnRow {
  id: string
  organization_id: string
  workspace_id: string
  invoice_id: string
  return_number: string
  subtotal_amount: string | number
  discount_amount: string | number
  tax_amount: string | number
  total_amount: string | number
  refund_payment_method_code: string | null
  notes: string | null
  created_at: Date | string
  qr_code: string | null
  seller_name: string | null
  seller_vat_number: string | null
  seller_address: string | null
  [key: string]: unknown
}

interface InvoiceReturnItemRow {
  id: string
  return_id: string
  invoice_item_id: string
  product_id: string | null
  product_name: string
  unit_price: string | number
  quantity: string | number
  net_amount: string | number
  tax_amount: string | number
  [key: string]: unknown
}

function mapReturnItem(row: InvoiceReturnItemRow): InvoiceReturnItemView {
  return {
    id: row.id,
    invoiceItemId: row.invoice_item_id,
    productId: row.product_id,
    productName: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    netAmount: Number(row.net_amount),
    taxAmount: Number(row.tax_amount),
  }
}

function mapReturn(
  row: InvoiceReturnRow,
  invoiceNumber: string,
  items: InvoiceReturnItemView[]
): InvoiceReturnView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    invoiceId: row.invoice_id,
    invoiceNumber,
    returnNumber: row.return_number,
    subtotalAmount: Number(row.subtotal_amount),
    discountAmount: Number(row.discount_amount),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
    refundPaymentMethodCode: row.refund_payment_method_code,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    items,
    qrCode: row.qr_code,
    sellerName: row.seller_name,
    sellerVatNumber: row.seller_vat_number,
    sellerAddress: row.seller_address,
  }
}

const INVOICE_SELECT = `
  SELECT id, workspace_id, invoice_number, status, customer_name, customer_phone, customer_id,
         cashier_user_id, payment_method_code, subtotal_amount, discount_amount, tax_amount,
         total_amount, notes, created_at, qr_code, seller_name, seller_vat_number, seller_address
    FROM pos_invoices
`

export class PosInvoicesService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly paymentMethodsService: PosPaymentMethodsService,
    private readonly taxRatesService: TaxRatesService
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
        `SELECT id, invoice_id, product_id, product_name, unit_price, quantity, line_total,
                 discount_amount, net_amount, tax_amount, returned_quantity
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

    const seller = await this.loadSellerSnapshot(input.organizationId)

    // The organization's own configured default rate (Settings -> الضرائب), not the hardcoded
    // 15% VAT_RATE constant -- see TaxRatesService.getDefaultRatePercent for the 15% fallback
    // this only ever falls back to if no real rate could be read at all. A sale is charged 0%
    // across every line instead when the organization has turned off "تطبيق الضريبة تلقائياً على
    // المنتجات" -- that switch overrides even a product's own rate, since it means "we are not
    // charging VAT at all right now" (e.g. not yet VAT-registered).
    const defaultTaxRate = seller.autoApplyTax
      ? await this.taxRatesService.getDefaultRatePercent(input.organizationId)
      : 0

    // A native product can carry its own tax_rate_id (Settings -> المنتجات -> الضريبة) --
    // "exempt"/"zero-rate" items alongside standard-rated ones in the same cart. Only a real,
    // native product (a uuid this organization actually owns a row for) can override the
    // default; a synced storefront product or a free-text line always uses it.
    const nativeProductIds = [
      ...new Set(
        input.items
          .map((item) => item.productId)
          .filter((id): id is string => id !== null && UUID_PATTERN.test(id))
      ),
    ]
    const overrideRateIdByProduct = new Map<string, string>()
    // Whether each native product's own sell_price is already tax-inclusive (Settings ->
    // الضرائب -> "الأسعار تشمل الضريبة", or a per-product conversion) -- see
    // ProductCatalogService.applyPriceTaxConvention. Read regardless of autoApplyTax so a
    // gross-priced line still resolves to its real net amount even when VAT itself is off (rate 0
    // makes the gross/net split a no-op, but the lookup itself doesn't depend on that flag).
    const priceIncludesTaxByProduct = new Map<string, boolean>()
    if (nativeProductIds.length > 0) {
      const placeholders = nativeProductIds.map((_, index) => `$${index + 2}`).join(", ")
      const rows = await this.database.query<{
        id: string
        tax_rate_id: string | null
        price_includes_tax: boolean
      }>(
        `SELECT id, tax_rate_id, price_includes_tax FROM products
          WHERE organization_id = $1 AND id IN (${placeholders})`,
        [input.organizationId, ...nativeProductIds]
      )
      for (const row of rows.rows) {
        if (seller.autoApplyTax && row.tax_rate_id)
          overrideRateIdByProduct.set(row.id, row.tax_rate_id)
        if (row.price_includes_tax) priceIncludesTaxByProduct.set(row.id, true)
      }
    }
    const overrideRatePercentById =
      overrideRateIdByProduct.size > 0
        ? await this.taxRatesService.getRatePercentsByIds(input.organizationId, [
            ...new Set(overrideRateIdByProduct.values()),
          ])
        : new Map<string, number>()

    // A gross-priced (tax-inclusive) line's shown price already contains VAT, so it is converted
    // to its real net amount BEFORE the discount is applied -- the standard invoicing order
    // (discount reduces the taxable base, VAT is then computed on what's left of it), and what
    // lets a net-priced line's arithmetic stay bit-for-bit identical to before this feature
    // existed (a net line's "gross" conversion is a no-op). unitPrice and
    // pos_invoice_items.line_total are never touched by any of this -- they stay exactly what was
    // actually charged, whichever convention the line's price used.
    const lineComputations = input.items.map((item) => {
      const lineSubtotal = item.unitPrice * item.quantity
      const overrideId = item.productId ? overrideRateIdByProduct.get(item.productId) : undefined
      const lineRate =
        overrideId !== undefined
          ? (overrideRatePercentById.get(overrideId) ?? defaultTaxRate)
          : defaultTaxRate
      const priceIncludesTax = item.productId
        ? (priceIncludesTaxByProduct.get(item.productId) ?? false)
        : false
      const lineNet = priceIncludesTax ? lineSubtotal / (1 + lineRate) : lineSubtotal
      // A line discount is applied here, before the order-wide discount below is distributed --
      // clamped so it can never exceed what this one line is actually worth. Both discounts can
      // be present on the same sale at once; see migration 071.
      const itemDiscount = Math.min(Math.max(0, item.discountAmount ?? 0), lineNet)
      return { lineNet, lineNetAfterItemDiscount: lineNet - itemDiscount, lineRate, itemDiscount }
    })
    const netSubtotal = lineComputations.reduce((sum, line) => sum + line.lineNet, 0)
    const netSubtotalAfterItemDiscounts = lineComputations.reduce(
      (sum, line) => sum + line.lineNetAfterItemDiscount,
      0
    )
    const itemDiscountTotal = lineComputations.reduce((sum, line) => sum + line.itemDiscount, 0)

    // The order-wide discount is spread across lines by their share of the (net, already
    // line-discounted) subtotal, so a mixed-rate cart's total tax is the sum of each line's own
    // (post-discount) taxable amount at its own effective rate. Rounds only once, at the very
    // end, so this reduces to bit-for-bit the same arithmetic as the old single-rate formula
    // whenever every line shares one rate, no line is gross-priced, and no line has its own
    // discount -- still by far the common case.
    let taxableAmount = 0
    let taxAmount = 0
    // Captured per line (not just the running totals above) so each pos_invoice_items row can
    // store its own final net/tax -- see migration 072 and ThermalInvoiceReceipt.tsx's per-line
    // VAT column, which needs the real post-discount figure, not an approximation reconstructed
    // later from unit_price/line_total (which stay the raw, undiscounted, as-charged amounts).
    // netAmount alone also isn't enough for a later PARTIAL RETURN to prorate correctly -- it
    // needs to know how much of the original (pre-discount) net was actually discount, which is
    // why line.lineNet itself (this line's net for its full quantity, before any discount) is
    // captured here too, as lineNetAmount -- see migration 073 and createReturn() below.
    const lineTaxDetails: Array<{ netAmount: number; taxAmount: number; lineNetAmount: number }> =
      []
    for (const line of lineComputations) {
      const lineShare =
        netSubtotalAfterItemDiscounts > 0
          ? line.lineNetAfterItemDiscount / netSubtotalAfterItemDiscounts
          : 0
      const lineOrderDiscount = input.discountAmount * lineShare
      const lineTaxable = Math.max(0, line.lineNetAfterItemDiscount - lineOrderDiscount)
      const lineTax = lineTaxable * line.lineRate
      taxableAmount += lineTaxable
      taxAmount += lineTax
      lineTaxDetails.push({
        netAmount: Math.round(lineTaxable * 100) / 100,
        taxAmount: Math.round(lineTax * 100) / 100,
        lineNetAmount: Math.round(line.lineNet * 100) / 100,
      })
    }
    const subtotalAmount = Math.round(netSubtotal * 100) / 100
    // The invoice's one discount_amount column is the total of everything actually discounted --
    // the order-wide discount plus every line's own -- so subtotalAmount - discountAmount still
    // equals the real post-discount taxable amount, exactly like before this feature existed (see
    // ThermalInvoiceReceipt.tsx, which subtracts these two to show "المبلغ الخاضع للضريبة بعد
    // الخصم").
    const discountAmount = Math.round((input.discountAmount + itemDiscountTotal) * 100) / 100
    taxableAmount = Math.round(taxableAmount * 100) / 100
    taxAmount = Math.round(taxAmount * 100) / 100
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

    const issuedAt = new Date()

    let invoiceNumber = ""
    await this.database.withTransaction(async () => {
      // A per-workspace (branch) counter, incremented with a row-locked UPSERT inside this same
      // transaction -- unlike the old global pos_invoice_number_seq (see migration 067), a
      // rollback here reverts the counter along with everything else, so a failed create() can
      // never burn a number and leave a real gap in this branch's own sequence. One sequence per
      // workspace also means two different organizations' sales never interleave into what looks
      // like a gap in either one's own invoice log.
      const counterResult = await this.database.query<{ next_number: string }>(
        `INSERT INTO pos_invoice_number_counters (workspace_id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (workspace_id)
         DO UPDATE SET next_number = pos_invoice_number_counters.next_number + 1
         RETURNING next_number`,
        [input.workspaceId]
      )
      invoiceNumber = `INV-${String(counterResult.rows[0].next_number).padStart(6, "0")}`

      // Always generate a QR -- a merchant who hasn't finished their tax profile in Settings yet
      // still gets one on every sale, just with an empty VAT-number tag rather than a fabricated
      // value, instead of no QR at all until they do (see loadSellerSnapshot above).
      const qrCode = generateZatcaQrCode({
        sellerName: seller.name,
        vatRegistrationNumber: seller.vatNumber ?? "",
        timestamp: issuedAt.toISOString(),
        invoiceTotal: totalAmount,
        vatTotal: taxAmount,
      })

      await this.database.query(
        `INSERT INTO pos_invoices
           (id, organization_id, workspace_id, invoice_number, status, customer_name,
            customer_phone, customer_id, cashier_user_id, payment_method_code, subtotal_amount,
            discount_amount, tax_amount, total_amount, notes, created_at, qr_code, seller_name,
            seller_vat_number, seller_address)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19)`,
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
          discountAmount,
          taxAmount,
          totalAmount,
          input.notes,
          issuedAt,
          qrCode,
          seller.name || null,
          seller.vatNumber,
          seller.address,
        ]
      )

      for (const [index, item] of input.items.entries()) {
        await this.database.query(
          `INSERT INTO pos_invoice_items
             (id, invoice_id, product_id, product_name, unit_price, quantity, line_total,
              discount_amount, net_amount, tax_amount, line_net_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            randomUUID(),
            id,
            item.productId,
            item.productName,
            item.unitPrice,
            item.quantity,
            // Never touched by the discount -- stays exactly what was actually charged per unit.
            Math.round(item.unitPrice * item.quantity * 100) / 100,
            Math.round(lineComputations[index].itemDiscount * 100) / 100,
            lineTaxDetails[index].netAmount,
            lineTaxDetails[index].taxAmount,
            lineTaxDetails[index].lineNetAmount,
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

    // The sale is already fully committed at this point -- a failure writing its audit trail
    // entry must never be reported back as a failed sale (the cashier would retry a charge that
    // already went through). Best-effort only; swallow and move on.
    await writeAuditLog(this.database, {
      action: "pos_invoice.created",
      actorUserId: input.cashierUserId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      entityType: "pos_invoice",
      entityId: id,
      metadata: { invoiceNumber, totalAmount, status: "completed" },
    }).catch(() => {})

    return created
  }

  // "returned" is no longer a status this can flip an invoice to directly -- see createReturn()
  // below, which replaced that blunt whole-invoice flip with a real, itemized, partial-capable
  // return event (exactly what this method's own pre-existing comment already called for: "a
  // genuine further correction belongs in a new credit-note/refund record that references this
  // one, not another status flip on it").
  async setStatus(
    organizationId: string,
    id: string,
    status: "cancelled",
    actorUserId: string | null
  ): Promise<InvoiceView> {
    if (!UUID_PATTERN.test(id)) throw INVOICE_ERRORS.notFound()

    const existing = await this.database.query<{ status: string; workspace_id: string }>(
      `SELECT status, workspace_id FROM pos_invoices WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    const invoiceRow = existing.rows[0]
    if (!invoiceRow) throw INVOICE_ERRORS.notFound()
    // Invoice immutability: once an invoice has left "completed" (been cancelled, returned, or
    // partially returned), it is finalized and can never be finalized again.
    if (invoiceRow.status !== "completed") throw INVOICE_ERRORS.alreadyFinalized()

    await this.database.query(
      `UPDATE pos_invoices SET status = $3, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, id, status]
    )

    const updated = await this.findById(organizationId, id)
    if (!updated) throw INVOICE_ERRORS.notFound()

    // The status change is already committed -- an audit-log failure here must never be reported
    // back as a failed cancel.
    await writeAuditLog(this.database, {
      action: "pos_invoice.cancelled",
      actorUserId,
      organizationId,
      workspaceId: invoiceRow.workspace_id,
      entityType: "pos_invoice",
      entityId: id,
      metadata: { status },
    }).catch(() => {})

    return updated
  }

  // A real, itemized return event -- an إشعار دائن (credit note) with its own sequential number,
  // its own totals, and a real line per returned item/quantity, distinct from (and referencing)
  // the original invoice. Supports a PARTIAL return: input.items only needs to name the lines and
  // quantities actually being returned THIS time, not the whole invoice, and can be called again
  // later for whatever is still left on the same invoice (pos_invoice_items.returned_quantity is
  // cumulative across every past call). A return that happens to cover everything still
  // outstanding on every line is simply the full-invoice case of the same mechanism -- there is
  // no separate "return everything" code path anymore.
  // No workspaceId parameter -- a return always belongs to whichever branch the ORIGINAL invoice
  // was rung up on (invoiceRow.workspace_id, below), not whatever branch the actor happens to be
  // viewing right now.
  async createReturn(
    organizationId: string,
    invoiceId: string,
    input: {
      items: Array<{ invoiceItemId: string; quantity: number }>
      paymentMethodCode: string
      notes: string | null
    },
    actorUserId: string | null
  ): Promise<InvoiceReturnView> {
    if (!UUID_PATTERN.test(invoiceId)) throw INVOICE_ERRORS.notFound()

    const invoiceResult = await this.database.query<{
      status: string
      customer_id: string | null
      workspace_id: string
    }>(
      `SELECT status, customer_id, workspace_id FROM pos_invoices
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, invoiceId]
    )
    const invoiceRow = invoiceResult.rows[0]
    if (!invoiceRow) throw INVOICE_ERRORS.notFound()
    // A cancelled or already fully-returned invoice has nothing left to return; a
    // "partially_returned" one can absolutely be returned against again (that is the entire point
    // of tracking returned_quantity per line rather than one whole-invoice flag).
    if (invoiceRow.status !== "completed" && invoiceRow.status !== "partially_returned") {
      throw INVOICE_ERRORS.invoiceNotReturnable()
    }

    // Same rule create() already enforces for a sale's own payments -- a refund can only be
    // attributed to a method this branch has actually turned on.
    const paymentMethods = await this.paymentMethodsService.list(
      organizationId,
      invoiceRow.workspace_id
    )
    const refundMethod = paymentMethods.find(
      (candidate) => candidate.code === input.paymentMethodCode
    )
    if (!refundMethod || !refundMethod.enabled) throw INVOICE_ERRORS.invalidPaymentMethod()
    // A "credit"/"prepaid" refund settles against the customer's own real account (see below);
    // any other kind (cash, card, transfer, bnpl) means the refund was already handled outside
    // this system -- cash physically handed back, a card reversal run separately -- so crediting
    // account balance too would double-refund the same return.
    const creditsAccountBalance = refundMethod.kind === "credit" || refundMethod.kind === "prepaid"

    const itemsResult = await this.database.query<{
      id: string
      product_id: string | null
      product_name: string
      unit_price: string | number
      quantity: string | number
      returned_quantity: string | number
      net_amount: string | number
      tax_amount: string | number
      line_net_amount: string | number
    }>(
      `SELECT id, product_id, product_name, unit_price, quantity, returned_quantity, net_amount,
              tax_amount, line_net_amount
         FROM pos_invoice_items
        WHERE invoice_id = $1`,
      [invoiceId]
    )
    const itemById = new Map(itemsResult.rows.map((row) => [row.id, row]))

    let subtotalAmount = 0
    let discountAmount = 0
    let taxAmount = 0
    const returnLines: Array<{
      invoiceItemId: string
      productId: string | null
      productName: string
      unitPrice: number
      quantity: number
      netAmount: number
      taxAmount: number
    }> = []

    for (const requested of input.items) {
      const line = itemById.get(requested.invoiceItemId)
      if (!line) throw INVOICE_ERRORS.returnItemNotFound()

      const originalQuantity = Number(line.quantity)
      const alreadyReturned = Number(line.returned_quantity)
      const remaining = Math.round((originalQuantity - alreadyReturned) * 1000) / 1000
      if (requested.quantity <= 0 || requested.quantity > remaining + 1e-6) {
        throw INVOICE_ERRORS.returnQuantityExceedsRemaining()
      }

      // Prorated by this line's own share of its full quantity -- net_amount/tax_amount are
      // already this line's final post-discount figures for the FULL quantity, so dividing by
      // quantity gives a stable per-unit rate regardless of how many units are being returned.
      const perUnitLineNet = Number(line.line_net_amount) / originalQuantity
      const perUnitNet = Number(line.net_amount) / originalQuantity
      const perUnitTax = Number(line.tax_amount) / originalQuantity
      const perUnitDiscount = perUnitLineNet - perUnitNet

      const lineSubtotal = Math.round(perUnitLineNet * requested.quantity * 100) / 100
      const lineDiscount = Math.round(perUnitDiscount * requested.quantity * 100) / 100
      const lineNet = Math.round(perUnitNet * requested.quantity * 100) / 100
      const lineTax = Math.round(perUnitTax * requested.quantity * 100) / 100

      subtotalAmount += lineSubtotal
      discountAmount += lineDiscount
      taxAmount += lineTax

      returnLines.push({
        invoiceItemId: line.id,
        productId: line.product_id,
        productName: line.product_name,
        unitPrice: Number(line.unit_price),
        quantity: requested.quantity,
        netAmount: lineNet,
        taxAmount: lineTax,
      })
    }
    if (returnLines.length === 0) throw INVOICE_ERRORS.returnRequiresItems()

    subtotalAmount = Math.round(subtotalAmount * 100) / 100
    discountAmount = Math.round(discountAmount * 100) / 100
    taxAmount = Math.round(taxAmount * 100) / 100
    const totalAmount = Math.round((subtotalAmount - discountAmount + taxAmount) * 100) / 100

    // Read fresh, same as create() does for the original invoice -- an org's tax profile can
    // change between the original sale and a later return, and this credit note is its own real
    // document, not a copy of what the invoice happened to say at sale time.
    const seller = await this.loadSellerSnapshot(organizationId)
    const issuedAt = new Date()

    const returnId = randomUUID()
    let returnNumber = ""

    await this.database.withTransaction(async () => {
      // Same row-locked-UPSERT numbering pattern create() uses for invoice_number (migration
      // 067) -- a rollback inside this same transaction reverts the counter too.
      const counterResult = await this.database.query<{ next_number: string }>(
        `INSERT INTO pos_return_number_counters (workspace_id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (workspace_id)
         DO UPDATE SET next_number = pos_return_number_counters.next_number + 1
         RETURNING next_number`,
        [invoiceRow.workspace_id]
      )
      returnNumber = `RTN-${String(counterResult.rows[0].next_number).padStart(6, "0")}`

      // Same Phase 1 QR shape create() already generates for an invoice (see zatca-qr-code.ts) --
      // there is no separate credit-note tag in this simplified TLV structure, so the credit
      // note's own totals are encoded the same way an invoice's are.
      const qrCode = generateZatcaQrCode({
        sellerName: seller.name,
        vatRegistrationNumber: seller.vatNumber ?? "",
        timestamp: issuedAt.toISOString(),
        invoiceTotal: totalAmount,
        vatTotal: taxAmount,
      })

      await this.database.query(
        `INSERT INTO pos_invoice_returns
           (id, organization_id, workspace_id, invoice_id, return_number, subtotal_amount,
            discount_amount, tax_amount, total_amount, refund_payment_method_code, notes,
            created_by, created_at, qr_code, seller_name, seller_vat_number, seller_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          returnId,
          organizationId,
          invoiceRow.workspace_id,
          invoiceId,
          returnNumber,
          subtotalAmount,
          discountAmount,
          taxAmount,
          totalAmount,
          input.paymentMethodCode,
          input.notes,
          actorUserId,
          issuedAt,
          qrCode,
          seller.name || null,
          seller.vatNumber,
          seller.address,
        ]
      )

      for (const line of returnLines) {
        await this.database.query(
          `INSERT INTO pos_invoice_return_items
             (id, return_id, invoice_item_id, product_id, product_name, unit_price, quantity,
              net_amount, tax_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            randomUUID(),
            returnId,
            line.invoiceItemId,
            line.productId,
            line.productName,
            line.unitPrice,
            line.quantity,
            line.netAmount,
            line.taxAmount,
          ]
        )
        await this.database.query(
          `UPDATE pos_invoice_items SET returned_quantity = returned_quantity + $2
            WHERE id = $1`,
          [line.invoiceItemId, line.quantity]
        )
        // A returned unit goes back on the shelf -- only for a real, still-tracked native
        // product (a synced product has no product_id we own, and a null stock_quantity means
        // this product's stock isn't tracked at all, e.g. a service).
        if (line.productId) {
          await this.database.query(
            `UPDATE products SET stock_quantity = stock_quantity + $2, updated_at = now()
              WHERE id = $1 AND stock_quantity IS NOT NULL`,
            [line.productId, line.quantity]
          )
        }
      }

      // Every line on the invoice fully back -> "returned"; some but not all ->
      // "partially_returned". Read back from the rows themselves (not just this call's own
      // deltas) so this stays correct across more than one partial return on the same invoice.
      const statusCheck = await this.database.query<{ fully_returned: boolean }>(
        `SELECT bool_and(returned_quantity >= quantity) AS fully_returned
           FROM pos_invoice_items WHERE invoice_id = $1`,
        [invoiceId]
      )
      const nextStatus = statusCheck.rows[0]?.fully_returned ? "returned" : "partially_returned"
      await this.database.query(
        `UPDATE pos_invoices SET status = $2, updated_at = now() WHERE id = $1`,
        [invoiceId, nextStatus]
      )

      // Real store credit for the returned amount -- only when the cashier actually chose a
      // "credit"/"prepaid" refund method (see creditsAccountBalance above); cash/card/transfer/
      // bnpl means the refund already happened outside this system, so crediting the account too
      // would double-refund the same return.
      if (creditsAccountBalance && invoiceRow.customer_id && totalAmount > 0) {
        const referenceResult = await this.database.query<{ nextval: string }>(
          `SELECT nextval('customer_return_number_seq')`
        )
        const reference = `RET-${String(referenceResult.rows[0].nextval).padStart(5, "0")}`

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
            invoiceId,
          ]
        )
      }
    })

    const created = await this.findReturnById(organizationId, returnId)
    if (!created) throw INVOICE_ERRORS.notFound()

    await writeAuditLog(this.database, {
      action: "pos_invoice.returned",
      actorUserId,
      organizationId,
      workspaceId: invoiceRow.workspace_id,
      entityType: "pos_invoice_return",
      entityId: returnId,
      metadata: { invoiceId, returnNumber, totalAmount },
    }).catch(() => {})

    return created
  }

  async listReturns(
    organizationId: string,
    filter: { workspaceId: string | null; from: string | null; to: string | null }
  ): Promise<InvoiceReturnView[]> {
    const conditions = ["r.organization_id = $1"]
    const params: unknown[] = [organizationId]

    if (filter.workspaceId) {
      params.push(filter.workspaceId)
      conditions.push(`r.workspace_id = $${params.length}`)
    }
    if (filter.from) {
      params.push(filter.from)
      conditions.push(`r.created_at >= $${params.length}`)
    }
    if (filter.to) {
      params.push(filter.to)
      conditions.push(`r.created_at <= $${params.length}`)
    }

    const result = await this.database.query<InvoiceReturnRow & { invoice_number: string }>(
      `SELECT r.id, r.organization_id, r.workspace_id, r.invoice_id, r.return_number,
              r.subtotal_amount, r.discount_amount, r.tax_amount, r.total_amount,
              r.refund_payment_method_code, r.notes, r.created_at, r.qr_code, r.seller_name,
              r.seller_vat_number, r.seller_address, i.invoice_number
         FROM pos_invoice_returns r
         JOIN pos_invoices i ON i.id = r.invoice_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY r.created_at DESC`,
      params
    )
    if (result.rows.length === 0) return []

    const returnIds = result.rows.map((row) => row.id)
    const idPlaceholders = returnIds.map((_, index) => `$${index + 1}`).join(", ")
    const itemsResult = await this.database.query<InvoiceReturnItemRow>(
      `SELECT id, return_id, invoice_item_id, product_id, product_name, unit_price, quantity,
              net_amount, tax_amount
         FROM pos_invoice_return_items
        WHERE return_id IN (${idPlaceholders})`,
      returnIds
    )
    const itemsByReturn = new Map<string, InvoiceReturnItemView[]>()
    for (const row of itemsResult.rows) {
      const list = itemsByReturn.get(row.return_id) ?? []
      list.push(mapReturnItem(row))
      itemsByReturn.set(row.return_id, list)
    }

    return result.rows.map((row) =>
      mapReturn(row, row.invoice_number, itemsByReturn.get(row.id) ?? [])
    )
  }

  private async findReturnById(
    organizationId: string,
    returnId: string
  ): Promise<InvoiceReturnView | null> {
    const result = await this.database.query<InvoiceReturnRow & { invoice_number: string }>(
      `SELECT r.id, r.organization_id, r.workspace_id, r.invoice_id, r.return_number,
              r.subtotal_amount, r.discount_amount, r.tax_amount, r.total_amount,
              r.refund_payment_method_code, r.notes, r.created_at, r.qr_code, r.seller_name,
              r.seller_vat_number, r.seller_address, i.invoice_number
         FROM pos_invoice_returns r
         JOIN pos_invoices i ON i.id = r.invoice_id
        WHERE r.organization_id = $1 AND r.id = $2`,
      [organizationId, returnId]
    )
    const row = result.rows[0]
    if (!row) return null

    const itemsResult = await this.database.query<InvoiceReturnItemRow>(
      `SELECT id, return_id, invoice_item_id, product_id, product_name, unit_price, quantity,
              net_amount, tax_amount
         FROM pos_invoice_return_items
        WHERE return_id = $1`,
      [returnId]
    )
    return mapReturn(row, row.invoice_number, itemsResult.rows.map(mapReturnItem))
  }

  // Seller identity as of right now, read straight from organizations.settings -- the same jsonb
  // an owner edits from Settings (SettingsDashboard.tsx's storeName/taxNumber/addressShort
  // fields; see command-handlers.ts's updateOrganization). This is intentionally NOT cached or
  // passed in from the caller: create() re-reads it fresh on every sale and then snapshots the
  // result onto the invoice row, so today's sale reflects today's tax profile even if it changes
  // again tomorrow, while an already-issued invoice never does.
  private async loadSellerSnapshot(organizationId: string): Promise<{
    name: string
    vatNumber: string | null
    address: string | null
    // Settings -> الضرائب's "تطبيق الضريبة تلقائياً على المنتجات" toggle -- false means this
    // organization has deliberately chosen not to charge tax at all (e.g. not yet VAT-registered),
    // so create() charges 0% instead of the configured default rate. Defaults to true (the
    // existing, always-taxed behavior) when unset, so nothing changes for an organization that
    // has never touched this setting.
    autoApplyTax: boolean
  }> {
    const result = await this.database.query<{ name: string; settings: Record<string, unknown> }>(
      `SELECT name, settings FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const row = result.rows[0]
    const settings = row?.settings ?? {}
    const storeName = typeof settings.storeName === "string" ? settings.storeName.trim() : ""
    const taxNumber = typeof settings.taxNumber === "string" ? settings.taxNumber.trim() : ""
    const addressShort =
      typeof settings.addressShort === "string" ? settings.addressShort.trim() : ""

    return {
      name: storeName || row?.name || "",
      vatNumber: taxNumber || null,
      address: addressShort || null,
      autoApplyTax: settings.taxAutoApplyToProducts !== false,
    }
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
        `SELECT id, invoice_id, product_id, product_name, unit_price, quantity, line_total,
                 discount_amount, net_amount, tax_amount, returned_quantity
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
