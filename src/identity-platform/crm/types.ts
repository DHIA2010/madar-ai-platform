// Madar Admin's CRM -- see identity-platform/migrations/134_crm.sql.

// The built-in stages (see stages.ts); the sales team can add its own between them.
export const CRM_STAGES = ["new", "contacted", "meeting", "trial", "won", "lost"] as const
export type SystemStage = (typeof CRM_STAGES)[number]
// A built-in stage or a custom one's key ("c_...").
export type CrmStage = string

export interface CrmStageView {
  key: string
  label: string
  color: string
  position: number
  // Built-in: can't be renamed, moved or deleted.
  system: boolean
}

// booking: booked a meeting straight from the Cal.com link (no website form first).
export const CRM_SOURCES = ["website", "signup", "manual", "booking"] as const
export type CrmSource = (typeof CRM_SOURCES)[number]

// What a salesperson can log by hand; the rest are recorded by the system.
export const CRM_LOGGABLE_ACTIVITIES = ["note", "call", "whatsapp", "email"] as const
export type CrmLoggableActivity = (typeof CRM_LOGGABLE_ACTIVITIES)[number]
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
  // Asked for a phone call at a time it picked (the website form's second step).
  | "call_request"

export interface CrmPerson {
  id: string
  name: string
  email: string
}

export interface CrmLeadView {
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
  // The phone call the lead asked for, if it did.
  callAt: string | null
  // Where it came from: the UTM tags / ad click / referrer of its first and latest visit.
  attribution: CrmAttribution | null
  stageChangedAt: string
  wonAt: string | null
  createdAt: string
  updatedAt: string
  // The earliest open follow-up, if any.
  nextTask: { id: string; title: string; dueAt: string } | null
  openTaskCount: number
  // The Madar apps it's interested in, free-form tags, and custom field values (by field id).
  interests: string[]
  tags: string[]
  customFields: Record<string, string | number | boolean | null>
}

export const CRM_FIELD_TYPES = ["text", "number", "date", "select", "checkbox"] as const
export type CrmFieldType = (typeof CRM_FIELD_TYPES)[number]

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

export interface CrmCustomField {
  id: string
  label: string
  type: CrmFieldType
  options: string[]
  sortOrder: number
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

export interface CrmActivityView {
  id: string
  kind: CrmActivityKind
  body: string | null
  meta: Record<string, unknown>
  actor: CrmPerson | null
  createdAt: string
}

export interface CrmTaskView {
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
  lead: CrmLeadView
  activities: CrmActivityView[]
  tasks: CrmTaskView[]
  // The Madar account it became, when it signed up.
  organization: { id: string; name: string; createdAt: string } | null
}

export interface CrmDashboard {
  rangeDays: number
  newLeads: number
  newLeadsPrevious: number
  meetingsBooked: number
  won: number
  wonValue: number
  lost: number
  // Won ÷ closed (won + lost) in the range, 0–100; null with nothing closed yet.
  winRate: number | null
  openLeads: number
  overdueTasks: number
  bySource: { source: CrmSource; count: number }[]
  // Leads added in the range by the platform and campaign that first brought them.
  byCampaign: {
    platform: string
    campaign: string | null
    leads: number
    meetings: number
    won: number
    wonValue: number
  }[]
  byStage: { stage: CrmStage; label: string; color: string; count: number }[]
  // One point per day in the range: leads created and leads won.
  daily: { date: string; created: number; won: number }[]
}
