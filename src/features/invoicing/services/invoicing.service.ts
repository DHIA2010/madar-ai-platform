import type {
  AdvanceOption,
  InvoiceInput,
  InvoiceSummary,
  NoteInput,
  PaymentInput,
  Quotation,
  QuotationDetail,
  QuotationInput,
  QuotationSummary,
  SalesInvoice,
  SalesInvoiceDetail,
  ZatcaReadiness,
} from "../types/invoicing.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { getClientEnvironment } from "@/infrastructure/environment/app-environment"
import { createSessionManager } from "@/infrastructure/identity"

// Same getWorkspaceIdFromStorage duplication convention as the other feature services.
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

const SEPARATOR = String.fromCharCode(47)
const path = (...parts: string[]) => ["", "v1", ...parts].join(SEPARATOR)
const withQuery = (base: string, params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const quotationService = {
  async list(filters: { status?: string; search?: string } = {}): Promise<Quotation[]> {
    return (
      await client.get<{ items: Quotation[] }>(withQuery(path("invoicing", "quotations"), filters))
    ).items
  },
  summary: () => client.get<QuotationSummary>(path("invoicing", "quotations", "summary")),
  get: (id: string) => client.get<QuotationDetail>(path("invoicing", "quotations", id)),
  create: (input: QuotationInput) =>
    client.post<QuotationInput, QuotationDetail>(path("invoicing", "quotations"), input),
  update: (id: string, input: QuotationInput) =>
    client.put<QuotationInput, QuotationDetail>(path("invoicing", "quotations", id), input),
  remove: (id: string) => client.delete<void>(path("invoicing", "quotations", id)),
  setStatus: (
    id: string,
    status: "draft" | "sent" | "accepted" | "declined",
    declineReason?: string
  ) =>
    client.post<{ status: string; declineReason?: string }, QuotationDetail>(
      path("invoicing", "quotations", id, "status"),
      { status, declineReason }
    ),
  revise: (id: string) =>
    client.post<Record<string, never>, QuotationDetail>(
      path("invoicing", "quotations", id, "revise"),
      {}
    ),
  duplicate: (id: string) =>
    client.post<Record<string, never>, QuotationDetail>(
      path("invoicing", "quotations", id, "duplicate"),
      {}
    ),
}

export const salesInvoiceService = {
  async list(
    filters: { documentType?: string; status?: string; search?: string; quotationId?: string } = {}
  ): Promise<SalesInvoice[]> {
    return (
      await client.get<{ items: SalesInvoice[] }>(withQuery(path("invoicing", "invoices"), filters))
    ).items
  },
  summary: () => client.get<InvoiceSummary>(path("invoicing", "invoices", "summary")),
  async advances(filters: {
    customerId?: string | null
    quotationId?: string | null
    excludeInvoiceId?: string | null
  }) {
    return (
      await client.get<{ items: AdvanceOption[] }>(
        withQuery(path("invoicing", "invoices", "advances"), filters)
      )
    ).items
  },
  get: (id: string) => client.get<SalesInvoiceDetail>(path("invoicing", "invoices", id)),
  create: (input: InvoiceInput) =>
    client.post<InvoiceInput, SalesInvoiceDetail>(path("invoicing", "invoices"), input),
  update: (id: string, input: InvoiceInput) =>
    client.put<InvoiceInput, SalesInvoiceDetail>(path("invoicing", "invoices", id), input),
  remove: (id: string) => client.delete<void>(path("invoicing", "invoices", id)),
  issue: (id: string) =>
    client.post<Record<string, never>, SalesInvoiceDetail>(
      path("invoicing", "invoices", id, "issue"),
      {}
    ),
  retryZatca: (id: string) =>
    client.post<Record<string, never>, SalesInvoiceDetail>(
      path("invoicing", "invoices", id, "zatca-retry"),
      {}
    ),
  createNote: (id: string, input: NoteInput) =>
    client.post<NoteInput, SalesInvoiceDetail>(path("invoicing", "invoices", id, "notes"), input),
  addPayment: (id: string, input: PaymentInput) =>
    client.post<PaymentInput, SalesInvoiceDetail>(
      path("invoicing", "invoices", id, "payments"),
      input
    ),
  removePayment: (id: string, paymentId: string) =>
    client.delete<SalesInvoiceDetail>(path("invoicing", "invoices", id, "payments", paymentId)),
  readiness: () => client.get<ZatcaReadiness>(path("invoicing", "zatca-readiness")),
  // ZATCA's XML of an issued document, downloaded with the signed-in session.
  async downloadXml(id: string, number: string): Promise<void> {
    const session = sessionManager.restore()
    const response = await fetch(
      new URL(path("invoicing", "invoices", id, "xml"), getClientEnvironment().API_BASE_URL),
      {
        headers: session?.accessToken?.token
          ? { authorization: `${session.accessToken.tokenType} ${session.accessToken.token}` }
          : {},
      }
    )
    if (!response.ok) throw new Error("xml")
    const blob = await response.blob()
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${number}.xml`
    link.click()
    URL.revokeObjectURL(link.href)
  },
}

// The customer's links (no session).
async function publicRequest<T>(target: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(target, getClientEnvironment().API_BASE_URL), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => null)) as T & { code?: string; message?: string }
  if (!response.ok) throw Object.assign(new Error(body?.message ?? "request"), { code: body?.code })
  return body
}

export const publicDocumentService = {
  quotation: (token: string) =>
    publicRequest<QuotationDetail>(path("public", "quotations", encodeURIComponent(token))),
  respond: (token: string, action: "accept" | "decline", name: string, reason: string | null) =>
    publicRequest<QuotationDetail>(
      path("public", "quotations", encodeURIComponent(token), "respond"),
      {
        method: "POST",
        body: JSON.stringify({ action, name, reason }),
      }
    ),
  invoice: (token: string) =>
    publicRequest<SalesInvoiceDetail>(path("public", "sales-invoices", encodeURIComponent(token))),
  invoiceXmlUrl: (token: string) =>
    new URL(
      path("public", "sales-invoices", encodeURIComponent(token), "xml"),
      getClientEnvironment().API_BASE_URL
    ).toString(),
}
