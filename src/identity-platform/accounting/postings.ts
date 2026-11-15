import { createHash } from "node:crypto"

import { expenseCategoryKey, type SystemAccountKey } from "./chart"

// What each Madar document posts to the books. Every function here is pure: it takes a document
// reduced to the figures that matter and returns the journal entry for it, in halalas (whole
// numbers, so an entry either balances exactly or visibly doesn't).
//
// The rules follow how Madar itself treats each document, so the books agree with the screens
// people already trust:
// - amounts on sales and purchases are stored before VAT, with the VAT alongside;
// - a customer has ONE running balance (what they owe, or their credit with the shop), so credit
//   sales, store-credit spending, receipts and returns-to-account all move the same receivable
//   account, by customer;
// - a purchase always raises what is owed to the supplier; paying is a separate supplier voucher.

export type PartyType = "customer" | "supplier"

// An account named by its role (cash, sales...) or by the expense category it belongs to.
export type AccountRef = SystemAccountKey | `expense_category:${string}`

export interface DraftLine {
  account: AccountRef
  debit: number
  credit: number
  memo?: string
  party?: { type: PartyType; id: string }
}

export const SOURCE_TYPES = [
  "pos_invoice",
  "pos_return",
  "sales_invoice",
  "sales_payment",
  "online_order",
  "customer_voucher",
  "purchase",
  "purchase_return",
  "supplier_voucher",
  "expense",
  "stock_count",
] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export interface DraftEntry {
  sourceType: SourceType
  sourceId: string
  workspaceId: string | null
  date: string
  reference: string
  description: string
  lines: DraftLine[]
  // What the document itself says, hashed: an unchanged document is skipped on the next pass.
  hash: string
  // The cost of the goods, fixed the first time the document is posted.
  cogs: number
}

// How money changed hands, in the books' terms.
export type PaymentKind = "cash" | "card" | "wallet" | "transfer" | "bnpl" | "credit" | "prepaid"

export const toCents = (value: unknown): number => Math.round(Number(value ?? 0) * 100)

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

const debit = (account: AccountRef, amount: number, extra: Partial<DraftLine> = {}): DraftLine => ({
  account,
  debit: amount,
  credit: 0,
  ...extra,
})
const credit = (
  account: AccountRef,
  amount: number,
  extra: Partial<DraftLine> = {}
): DraftLine => ({
  account,
  debit: 0,
  credit: amount,
  ...extra,
})

const customer = (id: string | null | undefined) =>
  id ? { party: { type: "customer" as const, id } } : {}
const supplier = (id: string | null | undefined) =>
  id ? { party: { type: "supplier" as const, id } } : {}

// Where a payment lands: cash in the drawer, the bank, or the card/e-payment balance that settles
// to the bank later. A sale "on account" or paid from store credit moves the customer's balance.
function paymentLine(
  side: "debit" | "credit",
  kind: PaymentKind,
  amount: number,
  customerId: string | null | undefined
): DraftLine {
  const make = side === "debit" ? debit : credit
  if (kind === "cash") return make("cash", amount)
  if (kind === "transfer") return make("bank", amount)
  if (kind === "credit" || kind === "prepaid")
    return make("receivable", amount, customer(customerId))
  return make("card_clearing", amount)
}

// Drops empty lines, turns a negative amount into the other side, and -- so that every entry
// balances -- puts a leftover (a halala of rounding in the source figures) on the rounding
// account instead of leaving the books out of balance.
function finish(lines: DraftLine[]): DraftLine[] {
  const cleaned = lines
    .map((line) =>
      line.debit < 0 || line.credit < 0
        ? { ...line, debit: Math.max(0, -line.credit), credit: Math.max(0, -line.debit) }
        : line
    )
    .filter((line) => line.debit !== 0 || line.credit !== 0)
  const difference =
    cleaned.reduce((sum, line) => sum + line.debit, 0) -
    cleaned.reduce((sum, line) => sum + line.credit, 0)
  if (difference > 0) cleaned.push(credit("rounding", difference))
  if (difference < 0) cleaned.push(debit("rounding", -difference))
  return cleaned
}

// The goods leaving (a sale) or coming back (a return), at cost.
function costLines(cogs: number, direction: "out" | "in"): DraftLine[] {
  if (cogs <= 0) return []
  return direction === "out"
    ? [debit("cogs", cogs), credit("inventory", cogs)]
    : [debit("inventory", cogs), credit("cogs", cogs)]
}

// ---- Point of sale -------------------------------------------------------------------------

export interface PosSaleDoc {
  id: string
  workspaceId: string
  number: string
  date: string
  customerId: string | null
  subtotal: number
  discount: number
  tax: number
  payments: Array<{ kind: PaymentKind; amount: number }>
}

export function postPosSale(doc: PosSaleDoc, cogs: number): DraftEntry {
  return {
    sourceType: "pos_invoice",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.number,
    description: `فاتورة نقطة بيع ${doc.number}`,
    lines: finish([
      ...doc.payments.map((payment) =>
        paymentLine("debit", payment.kind, payment.amount, doc.customerId)
      ),
      debit("sales_discounts", doc.discount),
      credit("sales", doc.subtotal),
      credit("vat_output", doc.tax),
      ...costLines(cogs, "out"),
    ]),
    hash: hashOf(doc),
    cogs,
  }
}

export interface PosReturnDoc {
  id: string
  workspaceId: string
  number: string
  date: string
  customerId: string | null
  // Net of discount, before VAT.
  net: number
  tax: number
  refunds: Array<{ kind: PaymentKind; amount: number }>
}

export function postPosReturn(doc: PosReturnDoc, cogs: number): DraftEntry {
  return {
    sourceType: "pos_return",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.number,
    description: `مرتجع نقطة بيع ${doc.number}`,
    lines: finish([
      debit("sales_returns", doc.net),
      debit("vat_output", doc.tax),
      ...doc.refunds.map((refund) =>
        paymentLine("credit", refund.kind, refund.amount, doc.customerId)
      ),
      ...costLines(cogs, "in"),
    ]),
    hash: hashOf(doc),
    cogs,
  }
}

// ---- Tax invoices (the Invoicing app) ------------------------------------------------------

export interface SalesInvoiceDoc {
  id: string
  workspaceId: string | null
  number: string
  date: string
  documentType: "invoice" | "credit_note" | "debit_note"
  kind: "regular" | "advance" | "progress"
  customerId: string | null
  taxable: number
  tax: number
  total: number
  // Advance invoices deducted from this one: their net and VAT.
  prepaidNet: number
  prepaidTax: number
  retention: number
  amountDue: number
}

export function postSalesInvoice(doc: SalesInvoiceDoc): DraftEntry {
  const who = customer(doc.customerId)
  let lines: DraftLine[]
  let description: string
  if (doc.documentType === "credit_note") {
    description = `إشعار دائن ${doc.number}`
    lines = [
      debit("sales_returns", doc.taxable),
      debit("vat_output", doc.tax),
      credit("receivable", doc.total, who),
    ]
  } else if (doc.documentType === "debit_note") {
    description = `إشعار مدين ${doc.number}`
    lines = [
      debit("receivable", doc.total, who),
      credit("sales", doc.taxable),
      credit("vat_output", doc.tax),
    ]
  } else if (doc.kind === "advance") {
    // A down payment: owed to the customer as goods or work until the final invoice uses it up.
    description = `فاتورة دفعة مقدمة ${doc.number}`
    lines = [
      debit("receivable", doc.total, who),
      credit("customer_advances", doc.taxable),
      credit("vat_output", doc.tax),
    ]
  } else {
    // The invoice's full value is revenue. What the customer still owes is that, less the
    // advances already invoiced (their VAT was declared with them) and less the retention
    // held back until the work is accepted.
    description = `فاتورة ضريبية ${doc.number}`
    lines = [
      debit("receivable", doc.amountDue, who),
      debit("retention_receivable", doc.retention, who),
      debit("customer_advances", doc.prepaidNet),
      debit("vat_output", doc.prepaidTax),
      credit("sales", doc.taxable),
      credit("vat_output", doc.tax),
    ]
  }
  return {
    sourceType: "sales_invoice",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.number,
    description,
    lines: finish(lines),
    hash: hashOf(doc),
    cogs: 0,
  }
}

export type SimpleMethod = "cash" | "bank" | "card"

const moneyAccount = (method: SimpleMethod): AccountRef =>
  method === "cash" ? "cash" : method === "card" ? "card_clearing" : "bank"

export interface SalesPaymentDoc {
  id: string
  workspaceId: string | null
  invoiceNumber: string
  date: string
  method: SimpleMethod
  amount: number
  customerId: string | null
}

export function postSalesPayment(doc: SalesPaymentDoc): DraftEntry {
  return {
    sourceType: "sales_payment",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.invoiceNumber,
    description: `سداد فاتورة ${doc.invoiceNumber}`,
    lines: finish([
      debit(moneyAccount(doc.method), doc.amount),
      credit("receivable", doc.amount, customer(doc.customerId)),
    ]),
    hash: hashOf(doc),
    cogs: 0,
  }
}

// ---- Online orders -------------------------------------------------------------------------

export interface OnlineOrderDoc {
  id: string
  workspaceId: string
  number: string
  date: string
  customerId: string | null
  // Paid already (and how), or still owed by the customer.
  paid: boolean
  method: SimpleMethod
  total: number
  tax: number
  // Shipping charged, less any shipping discount.
  shipping: number
}

export function postOnlineOrder(doc: OnlineOrderDoc, cogs: number): DraftEntry {
  return {
    sourceType: "online_order",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.number,
    description: `طلب ${doc.number}`,
    lines: finish([
      doc.paid
        ? debit(moneyAccount(doc.method), doc.total)
        : debit("receivable", doc.total, customer(doc.customerId)),
      credit("sales", doc.total - doc.tax - doc.shipping),
      credit("shipping_income", doc.shipping),
      credit("vat_output", doc.tax),
      ...costLines(cogs, "out"),
    ]),
    hash: hashOf(doc),
    cogs,
  }
}

// ---- Customer receipts and payments --------------------------------------------------------

export interface CustomerVoucherDoc {
  id: string
  workspaceId: string | null
  reference: string
  date: string
  type: "receipt" | "payment"
  kind: PaymentKind
  amount: number
  customerId: string
}

export function postCustomerVoucher(doc: CustomerVoucherDoc): DraftEntry {
  const balance = customer(doc.customerId)
  return {
    sourceType: "customer_voucher",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.reference,
    description: doc.type === "receipt" ? `سند قبض ${doc.reference}` : `سند صرف ${doc.reference}`,
    lines: finish(
      doc.type === "receipt"
        ? [
            paymentLine("debit", doc.kind, doc.amount, null),
            credit("receivable", doc.amount, balance),
          ]
        : [
            debit("receivable", doc.amount, balance),
            paymentLine("credit", doc.kind, doc.amount, null),
          ]
    ),
    hash: hashOf(doc),
    cogs: 0,
  }
}

// ---- Purchases and suppliers ---------------------------------------------------------------

export interface PurchaseDoc {
  id: string
  workspaceId: string | null
  code: string
  date: string
  supplierId: string
  // What the goods cost to bring in: the lines after their discounts, less the invoice discount,
  // plus shipping and other costs.
  cost: number
  tax: number
}

export function postPurchase(doc: PurchaseDoc): DraftEntry {
  return {
    sourceType: "purchase",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.code,
    description: `فاتورة مشتريات ${doc.code}`,
    lines: finish([
      debit("inventory", doc.cost),
      debit("vat_input", doc.tax),
      credit("payable", doc.cost + doc.tax, supplier(doc.supplierId)),
    ]),
    hash: hashOf(doc),
    cogs: 0,
  }
}

export interface PurchaseReturnDoc {
  id: string
  workspaceId: string | null
  code: string
  date: string
  supplierId: string
  // At the purchase's net unit cost, as the supplier statement values it.
  value: number
}

export function postPurchaseReturn(doc: PurchaseReturnDoc): DraftEntry {
  return {
    sourceType: "purchase_return",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.code,
    description: `مرتجع مشتريات ${doc.code}`,
    lines: finish([
      debit("payable", doc.value, supplier(doc.supplierId)),
      credit("inventory", doc.value),
    ]),
    hash: hashOf(doc),
    cogs: 0,
  }
}

export interface SupplierVoucherDoc {
  id: string
  workspaceId: string | null
  reference: string
  date: string
  type: "receipt" | "payment"
  method: SimpleMethod
  amount: number
  supplierId: string
}

// The business pays by card from its bank account, so a card payment out is a bank movement.
const payingAccount = (method: SimpleMethod): AccountRef => (method === "cash" ? "cash" : "bank")

export function postSupplierVoucher(doc: SupplierVoucherDoc): DraftEntry {
  const balance = supplier(doc.supplierId)
  return {
    sourceType: "supplier_voucher",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.reference,
    description:
      doc.type === "payment"
        ? `سند صرف لمورد ${doc.reference}`
        : `سند قبض من مورد ${doc.reference}`,
    lines: finish(
      doc.type === "payment"
        ? [debit("payable", doc.amount, balance), credit(payingAccount(doc.method), doc.amount)]
        : [debit(payingAccount(doc.method), doc.amount), credit("payable", doc.amount, balance)]
    ),
    hash: hashOf(doc),
    cogs: 0,
  }
}

// ---- Expenses ------------------------------------------------------------------------------

export interface ExpenseDoc {
  id: string
  workspaceId: string
  date: string
  name: string
  reference: string
  categoryId: string
  amount: number
  // The VAT inside the amount (only for an expense entered as including VAT).
  tax: number
  method: SimpleMethod
}

export function postExpense(doc: ExpenseDoc): DraftEntry {
  return {
    sourceType: "expense",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.reference,
    description: doc.name,
    lines: finish([
      debit(expenseCategoryKey(doc.categoryId), doc.amount - doc.tax),
      debit("vat_input", doc.tax),
      credit(payingAccount(doc.method), doc.amount),
    ]),
    hash: hashOf(doc),
    cogs: 0,
  }
}

// ---- Stock counts --------------------------------------------------------------------------

export interface StockCountDoc {
  id: string
  workspaceId: string | null
  reference: string
  date: string
  // Counted less expected, at cost: positive when the count found more than the system had.
  adjustment: number
}

export function postStockCount(doc: StockCountDoc): DraftEntry {
  return {
    sourceType: "stock_count",
    sourceId: doc.id,
    workspaceId: doc.workspaceId,
    date: doc.date,
    reference: doc.reference,
    description: `تسوية جرد ${doc.reference}`,
    lines: finish(
      doc.adjustment >= 0
        ? [debit("inventory", doc.adjustment), credit("inventory_adjustments", doc.adjustment)]
        : [debit("inventory_adjustments", -doc.adjustment), credit("inventory", -doc.adjustment)]
    ),
    hash: hashOf(doc),
    cogs: 0,
  }
}
