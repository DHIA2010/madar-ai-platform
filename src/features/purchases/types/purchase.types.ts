// Toggle switch in the reference UI, not a badge -- a purchase is simply received or not yet.
export type PurchaseStatus = "received" | "pending"
export type PurchasePaymentStatus = "paid" | "partial" | "pending" | "overdue"
export type PurchasePaymentMethod = "cash" | "bank_transfer" | "card" | "cheque"
// Fixed and server-computed at creation, never settable or changeable from the frontend (see
// src/identity-platform/procurement/returns-repository.ts's create()): "full" if the return
// covers every line on its purchase at that line's full originally-purchased qty, "partial"
// otherwise.
export type ReturnStatus = "full" | "partial"

export interface PurchaseLineItem {
  id: string
  productId: string
  productName: string
  sku: string
  netUnitCost: number
  qty: number
  discount: number
  taxPercent: number
}

// subtotal is always (netUnitCost * qty - discount) * (1 + taxPercent/100) -- never stored, always
// recomputed, so it can never drift from its own inputs.
export function lineItemSubtotal(item: PurchaseLineItem): number {
  const base = item.netUnitCost * item.qty - item.discount
  return base * (1 + item.taxPercent / 100)
}

export interface Purchase {
  id: string
  code: string
  supplierId: string
  supplierName: string
  supplierImageUrl: string | null
  warehouseId: string
  warehouseName: string
  date: string
  dueDate: string | null
  deliveryDate: string | null
  status: PurchaseStatus
  items: PurchaseLineItem[]
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
  // Follows the selected supplier's own currency (set on suppliers.bankDetails.currency) --
  // never edited directly on the purchase, see handleSupplierChange in purchase-form.tsx.
  currency: string
  paymentMethod: PurchasePaymentMethod | null
  referenceNumber: string
  note: string
  createdAt: string
}

export const DEFAULT_PURCHASE_CURRENCY = "SAR"

// Order-level tax/discount/shipping apply on top of the line items' own subtotals (which already
// carry their own per-line tax/discount) -- mirrors the reference's own "Order Tax / Discount /
// Shipping -> Grand Total" breakdown beneath the line-items table.
export function purchaseItemsSubtotal(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + lineItemSubtotal(item), 0)
}

export function purchaseGrandTotal(purchase: {
  items: PurchaseLineItem[]
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
}): number {
  const subtotal = purchaseItemsSubtotal(purchase.items)
  const withOrderTax = subtotal * (1 + purchase.orderTaxPercent / 100)
  // otherCosts is guarded because it's the newest field here -- a purchase record built in an
  // already-open session before this field existed won't have it on the object yet.
  const otherCosts = Number.isFinite(purchase.otherCosts) ? purchase.otherCosts : 0
  return withOrderTax - purchase.discountAmount + purchase.shippingAmount + otherCosts
}

export function purchaseItemCount(items: PurchaseLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0)
}

// A supplier "سند صرف" (payment voucher) linked to this purchase's id, as recorded in
// @/features/suppliers' own vouchers store -- kept as a minimal structural shape here (not the
// real SupplierVoucher type) so this module stays self-contained and doesn't need a cross-feature
// type import just for this.
export interface PurchasePaymentVoucher {
  purchaseId: string | null
  type: "receipt" | "payment"
  amount: number
}

// Payment status is never hand-set (there's no "mark as paid" control anywhere) -- it's always
// derived live from real سند صرف vouchers linked to this purchase vs. its own grand total, plus
// today's date against the due date:
//   - nothing paid yet, due date not reached      -> pending
//   - nothing paid yet, due date has passed        -> overdue
//   - something paid but less than the grand total -> partial (overdue takes priority once due)
//   - paid amount reaches the grand total          -> paid, regardless of date
// Sum of every سند صرف (payment voucher) linked to this purchase -- the only source "paid" ever
// comes from, since there's no other way to record a payment against a purchase. Exported so
// callers that just need the paid/remaining amounts (e.g. the purchases list table's own columns)
// don't have to duplicate this filter+reduce.
export function purchasePaidAmount(purchase: Purchase, vouchers: PurchasePaymentVoucher[]): number {
  return vouchers
    .filter((voucher) => voucher.purchaseId === purchase.id && voucher.type === "payment")
    .reduce((sum, voucher) => sum + voucher.amount, 0)
}

export function derivePurchasePaymentStatus(
  purchase: Purchase,
  vouchers: PurchasePaymentVoucher[],
  today: Date = new Date()
): PurchasePaymentStatus {
  const grandTotal = purchaseGrandTotal(purchase)
  const paidAmount = purchasePaidAmount(purchase, vouchers)

  if (grandTotal > 0 && paidAmount >= grandTotal) return "paid"

  const isPastDue = purchase.dueDate !== null && today > new Date(purchase.dueDate)
  if (isPastDue) return "overdue"

  return paidAmount > 0 ? "partial" : "pending"
}

// A return's items mirror the purchased product (not the full PurchaseLineItem -- a return has no
// discount/tax of its own, just how many units of that product are coming back and at what cost).
export interface ReturnLineItem {
  productId: string
  productName: string
  sku: string
  qty: number
  unitCost: number
}

export function returnLineItemAmount(item: ReturnLineItem): number {
  return item.qty * item.unitCost
}

// returnQty/returnAmount on PurchaseReturn are always this sum over `items`, computed once at
// creation (same convention as Purchase's own derived totals) -- never hand-entered, so a return
// can never claim more than what its selected items actually add up to.
export function returnItemsTotalQty(items: ReturnLineItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0)
}

export function returnItemsTotalAmount(items: ReturnLineItem[]): number {
  return items.reduce((sum, item) => sum + returnLineItemAmount(item), 0)
}

export interface PurchaseReturn {
  id: string
  code: string
  purchaseId: string
  purchaseCode: string
  supplierId: string
  supplierName: string
  supplierImageUrl: string | null
  warehouseId: string
  warehouseName: string
  items: ReturnLineItem[]
  returnQty: number
  returnAmount: number
  status: ReturnStatus
  returnDate: string
  notes: string
  createdAt: string
}

export interface PurchaseFormValues {
  supplierId: string
  warehouseId: string
  date: string
  dueDate: string
  deliveryDate: string
  status: PurchaseStatus
  items: PurchaseLineItem[]
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
  currency: string
  paymentMethod: PurchasePaymentMethod | null
  referenceNumber: string
  note: string
}

export const EMPTY_PURCHASE_FORM_VALUES: PurchaseFormValues = {
  supplierId: "",
  warehouseId: "",
  date: "",
  dueDate: "",
  deliveryDate: "",
  status: "pending",
  items: [],
  orderTaxPercent: 0,
  discountAmount: 0,
  shippingAmount: 0,
  otherCosts: 0,
  currency: DEFAULT_PURCHASE_CURRENCY,
  paymentMethod: null,
  referenceNumber: "",
  note: "",
}

// No "status" field -- it's computed server-side from the submitted items vs the purchase, never
// set by this form.
export interface ReturnFormValues {
  purchaseId: string
  supplierId: string
  warehouseId: string
  items: ReturnLineItem[]
  returnDate: string
  notes: string
}

export const EMPTY_RETURN_FORM_VALUES: ReturnFormValues = {
  purchaseId: "",
  supplierId: "",
  warehouseId: "",
  items: [],
  returnDate: "",
  notes: "",
}
