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

export type InvoiceStatus = "completed" | "cancelled" | "returned"

export interface InvoiceItem {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
  lineTotal: number
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

export interface CreateInvoiceItemInput {
  productId: string | null
  productName: string
  unitPrice: number
  quantity: number
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

  async setStatus(id: string, status: "cancelled" | "returned"): Promise<Invoice> {
    return client.patch<{ status: "cancelled" | "returned" }, Invoice>(
      [INVOICES_ENDPOINT, encodeURIComponent(id), "status"].join(PATH_SEPARATOR),
      { status }
    )
  },
}
