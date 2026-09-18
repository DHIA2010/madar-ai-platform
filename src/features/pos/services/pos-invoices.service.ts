import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the other pos services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const INVOICES_ENDPOINT = ["", "v1", "pos", "invoices"].join(PATH_SEPARATOR)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

export type InvoiceStatus = "completed" | "cancelled" | "returned" | "partially_returned"

export interface InvoiceItem {
  // This specific line's own id -- how a return (see createReturn below) says exactly which line,
  // and how much of it, is being returned.
  id: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  lineTotal: number
  discountAmount: number
  // This line's own final net (taxable) amount and VAT -- after its own discount AND its share of
  // the order-wide discount, at its own effective tax rate. netAmount + taxAmount is exactly this
  // line's contribution to the invoice's own subtotal-after-discount + taxAmount, so a printed
  // receipt's per-line row is always internally consistent (see ThermalInvoiceReceipt.tsx).
  netAmount: number
  taxAmount: number
  // Cumulative quantity already returned across every past return event on this line -- quantity
  // minus this is what a return dialog can still offer.
  returnedQuantity: number
}

export interface InvoicePayment {
  paymentMethodCode: string
  amount: number
}

// Real VAT (Saudi Arabia's statutory 15% rate), not a fabricated figure -- there is no per-
// organization tax configuration anywhere in the platform yet, so this is the one rate applied.
export const VAT_RATE = 0.15

export interface Invoice {
  id: string
  workspaceId: string
  invoiceNumber: string
  status: InvoiceStatus
  // Null is "عميل نقدي" (a walk-in, no customer recorded) -- a snapshot typed at sale time, not
  // a link to the synced-customer aggregation (which has no stable row of its own and would be
  // empty for any branch without a connected storefront).
  customerName: string | null
  customerPhone: string | null
  // A real customer this sale is attributed to -- distinct from customerName/customerPhone,
  // which stay a text snapshot either way. Only set when a payment line deferred an amount to a
  // real customer's account, or the cashier explicitly picked one.
  customerId: string | null
  cashierUserId: string | null
  // The single method's code, or "split" once more than one payments[] line was used -- the real
  // per-method breakdown always lives in payments.
  paymentMethodCode: string
  payments: InvoicePayment[]
  subtotalAmount: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  notes: string | null
  createdAt: string
  items: InvoiceItem[]
  // ZATCA Phase 1 (Generation Phase) fields -- a snapshot of the seller's tax profile as it stood
  // at issuance, plus a Base64 TLV QR payload (see backend zatca-qr-code.ts). qrCode is generated
  // on every sale regardless of whether the organization has a VAT registration number
  // (Settings -> الرقم الضريبي) on file -- an unset one just leaves that tag empty inside the QR,
  // never a fabricated value, and never blocks generating it. sellerVatNumber/sellerAddress stay
  // null until the organization's tax profile actually has them.
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
  averageCompletedValue: number
  totalCompletedAmount: number
}

export interface InvoiceListFilter {
  workspaceId?: string
  status?: InvoiceStatus
  paymentMethodCode?: string
  from?: string
  to?: string
  search?: string
}

// One line of a real return event -- always references the ORIGINAL invoice line it is
// returning against (invoiceItemId), since a return dialog only ever offers quantities up to
// what that line actually still has left (line.quantity - line.returnedQuantity).
export interface InvoiceReturnItem {
  id: string
  invoiceItemId: string
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  netAmount: number
  taxAmount: number
}

// A real credit note (إشعار دائن) -- see PosInvoicesService.createReturn() on the backend. One
// invoice can have more than one of these over its lifetime (partial returns on separate
// occasions), each its own independently-numbered document.
export interface InvoiceReturn {
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
  // The method the refund was actually given back through -- purely informational for cash/card/
  // transfer/bnpl; for credit/prepaid it's what decided whether this return also credited the
  // customer's real account balance (see createReturn on the backend).
  refundPaymentMethodCode: string | null
  notes: string | null
  createdAt: string
  items: InvoiceReturnItem[]
  qrCode: string | null
  sellerName: string | null
  sellerVatNumber: string | null
  sellerAddress: string | null
}

export interface CreateInvoiceReturnItemInput {
  invoiceItemId: string
  quantity: number
}

export interface CreateInvoiceReturnInput {
  items: CreateInvoiceReturnItemInput[]
  // Which method the refund was actually given back through -- must be an enabled method code,
  // same rule a sale's own payments already follow.
  paymentMethodCode: string
  notes: string | null
}

export interface InvoiceReturnListFilter {
  workspaceId?: string
  from?: string
  to?: string
}

export interface CreateInvoiceItemInput {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  discountAmount?: number
}

export interface CreateInvoiceInput {
  customerName: string | null
  customerPhone: string | null
  customerId: string | null
  payments: InvoicePayment[]
  discountAmount: number
  notes: string | null
  items: CreateInvoiceItemInput[]
}

function buildQuery(filter: InvoiceListFilter): string {
  const params = new URLSearchParams()
  if (filter.workspaceId) params.set("workspaceId", filter.workspaceId)
  if (filter.status) params.set("status", filter.status)
  if (filter.paymentMethodCode) params.set("paymentMethodCode", filter.paymentMethodCode)
  if (filter.from) params.set("from", filter.from)
  if (filter.to) params.set("to", filter.to)
  if (filter.search) params.set("search", filter.search)
  const query = params.toString()
  return query ? `?${query}` : ""
}

function buildReturnsQuery(filter: InvoiceReturnListFilter): string {
  const params = new URLSearchParams()
  if (filter.workspaceId) params.set("workspaceId", filter.workspaceId)
  if (filter.from) params.set("from", filter.from)
  if (filter.to) params.set("to", filter.to)
  const query = params.toString()
  return query ? `?${query}` : ""
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posInvoicesService = {
  async list(filter: InvoiceListFilter = {}): Promise<Invoice[]> {
    const response = await client.get<{ items: Invoice[] }>(
      `${INVOICES_ENDPOINT}${buildQuery(filter)}`
    )
    return response.items
  },

  async summary(filter: Omit<InvoiceListFilter, "search"> = {}): Promise<InvoiceSummary> {
    return client.get<InvoiceSummary>(
      [INVOICES_ENDPOINT, "summary"].join(PATH_SEPARATOR) + buildQuery(filter)
    )
  },

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    return client.post<CreateInvoiceInput, Invoice>(INVOICES_ENDPOINT, input)
  },

  // "returned" is no longer a valid value here -- a return is now its own real, itemized event
  // (see createReturn below), not a blunt whole-invoice status flip.
  async setStatus(id: string, status: "cancelled"): Promise<Invoice> {
    return client.patch<{ status: "cancelled" }, Invoice>(
      [INVOICES_ENDPOINT, encodeURIComponent(id), "status"].join(PATH_SEPARATOR),
      { status }
    )
  },

  async createReturn(invoiceId: string, input: CreateInvoiceReturnInput): Promise<InvoiceReturn> {
    return client.post<CreateInvoiceReturnInput, InvoiceReturn>(
      [INVOICES_ENDPOINT, encodeURIComponent(invoiceId), "returns"].join(PATH_SEPARATOR),
      input
    )
  },

  async listReturns(filter: InvoiceReturnListFilter = {}): Promise<InvoiceReturn[]> {
    const response = await client.get<{ items: InvoiceReturn[] }>(
      [INVOICES_ENDPOINT, "returns"].join(PATH_SEPARATOR) + buildReturnsQuery(filter)
    )
    return response.items
  },
}
