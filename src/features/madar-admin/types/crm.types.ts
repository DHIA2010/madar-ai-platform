// Madar Admin's CRM -- mirrors src/identity-platform/crm/types.ts.

// A built-in stage ("new" | "contacted" | "meeting" | "trial" | "won" | "lost") or a custom one's key.
export type CrmStage = string

export interface CrmStageDef {
  key: string
  label: string
  color: string
  position: number
  // Built-in: the system moves leads through it; it can't be renamed, moved or deleted.
  system: boolean
}
// booking: booked a meeting straight from the Cal.com link.
export type CrmSource = "website" | "signup" | "manual" | "booking"
export type CrmLoggableActivity = "note" | "call" | "whatsapp" | "email"
export type CrmActivityKind =
  | CrmLoggableActivity
  | "created"
  | "meeting"
  | "stage"
  | "owner"
  | "task"
  | "signup"
  | "payment"
  | "quote"
  | "invoice"
  | "call_request"

export interface CrmPerson {
  id: string
  name: string
  email: string
}

export interface CrmLead {
  id: string
  companyName: string
  contactName: string | null
  phone: string | null
  email: string | null
  source: CrmSource
  stage: CrmStage
  owner: CrmPerson | null
  expectedValue: number | null
  wonValue: number | null
  lostReason: string | null
  organizationId: string | null
  meetingAt: string | null
  // Where the meeting was booked: the website form's booking step, or the Cal.com link itself.
  meetingSource: "website_form" | "booking_link" | null
  // The phone call the lead asked for from the website form, if it did.
  callAt: string | null
  // Where it came from: the UTM tags / ad click / referrer of its first and latest visit.
  attribution: CrmAttribution | null
  stageChangedAt: string
  wonAt: string | null
  createdAt: string
  updatedAt: string
  nextTask: { id: string; title: string; dueAt: string } | null
  openTaskCount: number
  // Madar apps the lead is interested in (application ids), and free-form tags.
  interests: string[]
  tags: string[]
  // Values by custom field id.
  customFields: Record<string, CrmFieldValue>
}

export interface CrmAttributionTouch {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  clickId: string | null
  clickIdType: string | null
  referrer: string | null
  landingPage: string | null
  at: string
}

export interface CrmAttribution {
  first: CrmAttributionTouch
  last: CrmAttributionTouch
}

export type CrmFieldValue = string | number | boolean | null

export type CrmFieldType = "text" | "number" | "date" | "select" | "checkbox"

export interface CrmCustomField {
  id: string
  label: string
  type: CrmFieldType
  options: string[]
  sortOrder: number
}

export type CrmConditionOperator =
  | "is"
  | "is_not"
  | "contains"
  | "includes"
  | "excludes"
  | "gt"
  | "lt"
  | "on_or_after"
  | "on_or_before"
  | "is_set"
  | "is_empty"

export interface CrmCondition {
  field: string
  op: CrmConditionOperator
  value?: string | number | boolean | null
}

export type CrmViewPage = "leads" | "quotes" | "invoices" | "tasks"

export interface CrmSavedView {
  id: string
  name: string
  page: CrmViewPage
  definition: Record<string, unknown>
  createdBy: CrmPerson | null
  createdAt: string
}

export interface CrmActivity {
  id: string
  kind: CrmActivityKind
  body: string | null
  meta: Record<string, unknown>
  actor: CrmPerson | null
  createdAt: string
}

export interface CrmTask {
  id: string
  leadId: string
  leadCompanyName: string
  title: string
  dueAt: string
  assignee: CrmPerson | null
  doneAt: string | null
  createdAt: string
}

export interface CrmLeadDetail {
  lead: CrmLead
  activities: CrmActivity[]
  tasks: CrmTask[]
  organization: { id: string; name: string; createdAt: string } | null
}

export interface CrmLeadFilters {
  search?: string
  stage?: CrmStage | "all"
  source?: CrmSource | "all"
  owner?: string
  conditions?: CrmCondition[]
  from?: string
  to?: string
}

export interface CrmLeadInput {
  companyName: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  expectedValue?: number | null
  ownerUserId?: string | null
  interests?: string[]
  tags?: string[]
  customFields?: Record<string, CrmFieldValue>
}

export interface CrmDashboard {
  rangeDays: number
  newLeads: number
  newLeadsPrevious: number
  meetingsBooked: number
  won: number
  wonValue: number
  lost: number
  winRate: number | null
  openLeads: number
  overdueTasks: number
  bySource: { source: CrmSource; count: number }[]
  byCampaign: {
    platform: string
    campaign: string | null
    leads: number
    meetings: number
    won: number
    wonValue: number
  }[]
  byStage: { stage: CrmStage; label: string; color: string; count: number }[]
  daily: { date: string; created: number; won: number }[]
}

// ---- Quotes and invoices -- mirrors src/identity-platform/crm/sales-documents.ts ----

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "converted"
export type InvoiceStatus = "unpaid" | "paid" | "void"
export type InvoicePaymentMethod = "card" | "bank_transfer" | "cash" | "other"
export type SalesInterval = "monthly" | "yearly"

export interface SalesDocumentItem {
  kind: "package" | "custom"
  description: string
  quantity: number
  unitPriceHalalas: number
  application?: string
  packageId?: string
  packageName?: string
  interval?: SalesInterval
}

export interface SalesDocumentTotals {
  subtotal: number
  discount: number
  vat: number
  total: number
}

export interface SalesParty {
  companyName: string
  contactName: string | null
  phone: string | null
  email: string | null
}

export interface SellerInfo {
  name: string
  legalName: string
  vatNumber: string
  commercialRegistration: string
  address: string
  email: string
  // The default terms and conditions (platform settings).
  quoteTerms: string
  invoiceTerms: string
}

export interface CrmQuote {
  id: string
  number: string
  leadId: string
  status: QuoteStatus
  items: SalesDocumentItem[]
  totals: SalesDocumentTotals
  validUntil: string | null
  notes: string | null
  customer: SalesParty
  invoiceId: string | null
  // Its own terms and conditions, when changed for this quote (else seller.quoteTerms).
  terms: string | null
  createdAt: string
  updatedAt: string
}

export interface CrmInvoice {
  id: string
  number: string
  leadId: string
  quoteId: string | null
  quoteNumber: string | null
  status: InvoiceStatus
  items: SalesDocumentItem[]
  totals: SalesDocumentTotals
  dueDate: string | null
  notes: string | null
  customer: SalesParty
  payUrlToken: string
  paidAt: string | null
  paymentMethod: InvoicePaymentMethod | null
  paymentReference: string | null
  activatedAt: string | null
  // Its own terms and conditions, when changed for this invoice (else seller.invoiceTerms).
  terms: string | null
  // sales: written by the sales team. auto: issued for a payment made in the app (card or an
  // approved bank transfer); its payment receipt (receiptNumber) is under المدفوعات.
  source: "sales" | "auto"
  receiptNumber: string | null
  // The subscription period it covers (yyyy-mm-dd): worked out from its packages unless set by hand.
  subscriptionStart: string | null
  subscriptionEnd: string | null
  subscriptionDatesManual: boolean
  hasPackages: boolean
  organizationId: string | null
  createdAt: string
}

export interface CrmCatalogEntry {
  application: string
  packages: { id: string; name: string; monthlyPrice: number | null; yearlyPrice: number | null }[]
}

// What the quote editor sends.
export type SalesItemInput =
  | { kind: "package"; packageId: string; interval: SalesInterval; description?: string }
  | { kind: "custom"; description: string; quantity: number; unitPrice: number }

export interface CrmQuoteInput {
  items: SalesItemInput[]
  discount?: number
  validUntil?: string | null
  notes?: string | null
}
