import type {
  CrmCatalogEntry,
  CrmCondition,
  CrmCustomField,
  CrmDashboard,
  CrmFieldType,
  CrmInvoice,
  CrmLead,
  CrmLeadDetail,
  CrmLeadFilters,
  CrmLeadInput,
  CrmLoggableActivity,
  CrmPerson,
  CrmQuote,
  CrmQuoteInput,
  CrmSavedView,
  CrmStage,
  CrmStageDef,
  CrmTask,
  CrmViewPage,
  InvoicePaymentMethod,
  InvoiceStatus,
  QuoteStatus,
  SellerInfo,
} from "../types/crm.types"
import type { AdminPage } from "../types/platform-admin.types"

import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Madar Admin's CRM (/v1/platform-admin/crm/*). Cross-tenant, so no workspace header.
const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "crm"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

function toQuery(params: Record<string, string | number | CrmCondition[] | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "all") continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, JSON.stringify(value))
      continue
    }
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

const lead = (id: string) => `${ENDPOINT}/leads/${encodeURIComponent(id)}`

export const crmService = {
  listStages(): Promise<CrmStageDef[]> {
    return client.get(`${ENDPOINT}/stages`)
  },
  saveStage(
    key: string | null,
    input: { label: string; color: string; after?: string }
  ): Promise<CrmStageDef[]> {
    return key
      ? client.patch(`${ENDPOINT}/stages/${encodeURIComponent(key)}`, input)
      : client.post(`${ENDPOINT}/stages`, input)
  },
  // Drag-and-drop order of the open stages (won/lost excluded).
  reorderStages(order: string[]): Promise<CrmStageDef[]> {
    return client.put(`${ENDPOINT}/stages/order`, { order })
  },
  // Its leads move to `moveTo`.
  deleteStage(key: string, moveTo: string): Promise<CrmStageDef[]> {
    return client.delete(`${ENDPOINT}/stages/${encodeURIComponent(key)}${toQuery({ moveTo })}`)
  },
  owners(): Promise<CrmPerson[]> {
    return client.get(`${ENDPOINT}/owners`)
  },
  dashboard(rangeDays: number): Promise<CrmDashboard> {
    return client.get(`${ENDPOINT}/dashboard${toQuery({ rangeDays })}`)
  },
  pipeline(filters: Omit<CrmLeadFilters, "stage">): Promise<{ leads: CrmLead[] }> {
    return client.get(`${ENDPOINT}/pipeline${toQuery({ ...filters })}`)
  },
  listLeads(filters: CrmLeadFilters, page: number, pageSize: number): Promise<AdminPage<CrmLead>> {
    return client.get(`${ENDPOINT}/leads${toQuery({ ...filters, page, pageSize })}`)
  },

  // ---- Custom lead fields and saved views ----
  listFields(): Promise<CrmCustomField[]> {
    return client.get(`${ENDPOINT}/fields`)
  },
  saveField(
    id: string | null,
    input: { label: string; type: CrmFieldType; options?: string[] }
  ): Promise<CrmCustomField[]> {
    return id
      ? client.patch(`${ENDPOINT}/fields/${encodeURIComponent(id)}`, input)
      : client.post(`${ENDPOINT}/fields`, input)
  },
  deleteField(id: string): Promise<CrmCustomField[]> {
    return client.delete(`${ENDPOINT}/fields/${encodeURIComponent(id)}`)
  },
  listViews(page: CrmViewPage): Promise<CrmSavedView[]> {
    return client.get(`${ENDPOINT}/views${toQuery({ page })}`)
  },
  saveView(input: {
    name: string
    page: CrmViewPage
    definition: Record<string, unknown>
  }): Promise<CrmSavedView[]> {
    return client.post(`${ENDPOINT}/views`, input)
  },
  deleteView(id: string): Promise<CrmSavedView[]> {
    return client.delete(`${ENDPOINT}/views/${encodeURIComponent(id)}`)
  },
  getLead(id: string): Promise<CrmLeadDetail> {
    return client.get(lead(id))
  },
  createLead(input: CrmLeadInput): Promise<CrmLeadDetail> {
    return client.post(`${ENDPOINT}/leads`, input)
  },
  updateLead(id: string, patch: Partial<CrmLeadInput>): Promise<CrmLeadDetail> {
    return client.patch(lead(id), patch)
  },
  deleteLead(id: string): Promise<void> {
    return client.delete(lead(id))
  },
  changeStage(id: string, stage: CrmStage, lostReason?: string | null): Promise<CrmLeadDetail> {
    return client.post(`${lead(id)}/stage`, { stage, lostReason })
  },
  logActivity(id: string, kind: CrmLoggableActivity, body: string): Promise<CrmLeadDetail> {
    return client.post(`${lead(id)}/activities`, { kind, body })
  },
  createTask(
    id: string,
    input: { title: string; dueAt: string; assigneeUserId?: string | null }
  ): Promise<CrmLeadDetail> {
    return client.post(`${lead(id)}/tasks`, input)
  },
  setTaskDone(taskId: string, done: boolean): Promise<CrmLeadDetail> {
    return client.patch(`${ENDPOINT}/tasks/${encodeURIComponent(taskId)}`, { done })
  },
  deleteTask(taskId: string): Promise<CrmLeadDetail> {
    return client.delete(`${ENDPOINT}/tasks/${encodeURIComponent(taskId)}`)
  },
  listTasks(filters: {
    scope: "mine" | "all"
    status: "open" | "overdue" | "done"
    from?: string
    to?: string
  }): Promise<CrmTask[]> {
    return client.get(`${ENDPOINT}/tasks${toQuery(filters)}`)
  },

  // ---- Quotes and invoices ----
  catalog(): Promise<CrmCatalogEntry[]> {
    return client.get(`${ENDPOINT}/catalog`)
  },
  listQuotes(
    filters: {
      status?: QuoteStatus | "all"
      leadId?: string
      search?: string
      from?: string
      to?: string
    } = {}
  ): Promise<CrmQuote[]> {
    return client.get(`${ENDPOINT}/quotes${toQuery(filters)}`)
  },
  getQuote(id: string): Promise<{ quote: CrmQuote; seller: SellerInfo }> {
    return client.get(`${ENDPOINT}/quotes/${encodeURIComponent(id)}`)
  },
  createQuote(
    leadId: string,
    input: CrmQuoteInput
  ): Promise<{ quote: CrmQuote; seller: SellerInfo }> {
    return client.post(`${lead(leadId)}/quotes`, input)
  },
  updateQuote(id: string, input: CrmQuoteInput): Promise<{ quote: CrmQuote; seller: SellerInfo }> {
    return client.patch(`${ENDPOINT}/quotes/${encodeURIComponent(id)}`, input)
  },
  setQuoteStatus(
    id: string,
    status: "draft" | "sent" | "accepted" | "rejected"
  ): Promise<{ quote: CrmQuote; seller: SellerInfo }> {
    return client.post(`${ENDPOINT}/quotes/${encodeURIComponent(id)}/status`, { status })
  },
  deleteQuote(id: string): Promise<void> {
    return client.delete(`${ENDPOINT}/quotes/${encodeURIComponent(id)}`)
  },
  convertQuote(
    id: string,
    dueDate: string | null
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.post(`${ENDPOINT}/quotes/${encodeURIComponent(id)}/convert`, { dueDate })
  },
  // An invoice written directly, without a quote.
  createInvoice(
    leadId: string,
    input: Omit<CrmQuoteInput, "validUntil"> & { dueDate?: string | null }
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.post(`${lead(leadId)}/invoices`, input)
  },
  listInvoices(
    filters: {
      status?: InvoiceStatus | "all"
      leadId?: string
      method?: InvoicePaymentMethod | "all"
      search?: string
      from?: string
      to?: string
      dateField?: "created" | "paid"
      activation?: "activated" | "pending" | "all"
    } = {}
  ): Promise<CrmInvoice[]> {
    return client.get(`${ENDPOINT}/invoices${toQuery(filters)}`)
  },
  getInvoice(id: string): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.get(`${ENDPOINT}/invoices/${encodeURIComponent(id)}`)
  },
  // A payment made outside the pay link, recorded by staff.
  markInvoicePaid(
    id: string,
    input: { method: InvoicePaymentMethod; reference: string | null; paidAt: string | null }
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.post(`${ENDPOINT}/invoices/${encodeURIComponent(id)}/mark-paid`, input)
  },
  // The subscription period by hand; nulls go back to working it out from the packages.
  setInvoicePeriod(
    id: string,
    period: { start: string | null; end: string | null }
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.put(`${ENDPOINT}/invoices/${encodeURIComponent(id)}/period`, period)
  },
  // A quote's or invoice's own terms and conditions; null goes back to the default ones.
  setQuoteTerms(
    id: string,
    terms: string | null
  ): Promise<{ quote: CrmQuote; seller: SellerInfo }> {
    return client.put(`${ENDPOINT}/quotes/${encodeURIComponent(id)}/terms`, { terms })
  },
  setInvoiceTerms(
    id: string,
    terms: string | null
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.put(`${ENDPOINT}/invoices/${encodeURIComponent(id)}/terms`, { terms })
  },
  voidInvoice(id: string): Promise<{ invoice: CrmInvoice; seller: SellerInfo }> {
    return client.post(`${ENDPOINT}/invoices/${encodeURIComponent(id)}/void`, {})
  },
  // بانتظار التفعيل: paid invoices whose apps aren't switched on yet.
  listActivations(filters: { search?: string } = {}): Promise<CrmInvoice[]> {
    return client.get(`${ENDPOINT}/activations${toQuery(filters)}`)
  },
  // Creates (or links) the customer's Madar account, switches the apps on, emails a welcome.
  activateAccount(
    id: string,
    input: { email?: string | null; contactName?: string | null }
  ): Promise<{ invoice: CrmInvoice; seller: SellerInfo; newAccount: boolean }> {
    return client.post(`${ENDPOINT}/invoices/${encodeURIComponent(id)}/activate-account`, input)
  },
}
