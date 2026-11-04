import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { requirePlatformPermission } from "../platform-admin/guard"

import type {
  CrmActivityKind,
  CrmAttribution,
  CrmCustomField,
  CrmFieldType,
  CrmSavedView,
  CrmViewPage,
  CrmActivityView,
  CrmDashboard,
  CrmLeadDetail,
  CrmLeadView,
  CrmLoggableActivity,
  CrmPerson,
  CrmSource,
  CrmStage,
  CrmTaskView,
} from "./types"
import { CRM_SOURCES } from "./types"
import {
  CLOSED_STAGES,
  deleteStage,
  listStages,
  reorderStages,
  requireStage,
  saveStage,
  type StageColor,
  stageRank,
} from "./stages"
import type { LeadAttribution } from "../schemas"
import { type FieldValue, type FilterCondition, matchesAll, withinDays } from "./filters"

type LeadRow = {
  id: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  source: CrmSource
  stage: CrmStage
  owner_user_id: string | null
  expected_value_halalas: number | null
  won_value_halalas: number | null
  lost_reason: string | null
  organization_id: string | null
  meeting_at: string | Date | null
  meeting_source: "website_form" | "booking_link" | null
  call_at: string | Date | null
  attribution: CrmAttribution | null
  stage_changed_at: string | Date
  won_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
  interests: string[] | null
  tags: string[] | null
  custom_fields: Record<string, string | number | boolean | null> | null
}

type TaskRow = {
  id: string
  lead_id: string
  title: string
  due_at: string | Date
  assignee_user_id: string | null
  done_at: string | Date | null
  created_at: string | Date
}

export interface CrmLeadFilters {
  search?: string
  stage?: CrmStage
  source?: CrmSource
  // A user id, or "unassigned".
  owner?: string
  // The filter builder's conditions, and a range on when the lead was added.
  conditions?: FilterCondition[]
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
  // Values by custom field id; null clears one.
  customFields?: Record<string, string | number | boolean | null>
}

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString())
const sar = (halalas: number | null) => (halalas === null ? null : Number(halalas) / 100)
const halalas = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? null : Math.round(amount * 100)

// Writes one timeline entry. Shared by the service, the system hooks below, and quotes/invoices.
export async function addActivity(
  db: PostgresDatabase,
  input: {
    leadId: string
    kind: CrmActivityKind
    body?: string | null
    meta?: Record<string, unknown>
    actorUserId?: string | null
  }
) {
  await db.query(
    `INSERT INTO crm_activities (id, lead_id, kind, body, meta, actor_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      randomUUID(),
      input.leadId,
      input.kind,
      input.body ?? null,
      JSON.stringify(input.meta ?? {}),
      input.actorUserId ?? null,
    ]
  )
}

// Moves a lead to a stage, recording it on the timeline.
export async function setStage(
  db: PostgresDatabase,
  lead: { id: string; stage: CrmStage },
  stage: CrmStage,
  options: { actorUserId?: string | null; lostReason?: string | null } = {}
) {
  if (lead.stage === stage) return
  await db.query(
    `UPDATE crm_leads SET stage = $2, stage_changed_at = now(), updated_at = now(),
       lost_reason = $3, won_at = $4
     WHERE id = $1`,
    [
      lead.id,
      stage,
      stage === "lost" ? (options.lostReason ?? null) : null,
      stage === "won" ? new Date().toISOString() : null,
    ]
  )
  await addActivity(db, {
    leadId: lead.id,
    kind: "stage",
    meta: {
      from: lead.stage,
      to: stage,
      ...(options.lostReason ? { reason: options.lostReason } : {}),
    },
    actorUserId: options.actorUserId,
  })
}

function rethrowNever(label: string) {
  return (error: unknown) => {
    console.error(`crm.${label}_failed`, {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

// ---- System hooks: called from the website form, sign-up and billing. They never throw: the
// CRM must not be able to break the thing that fed it. ----

// A "talk to sales" request from madar.my.
export async function crmFromWebsiteLead(
  db: PostgresDatabase,
  input: {
    salesLeadId: string
    companyName: string
    phone: string
    email: string | null
    attribution?: LeadAttribution | null
  }
) {
  try {
    const id = randomUUID()
    await db.query(
      `INSERT INTO crm_leads (id, company_name, phone, email, source, stage, sales_lead_id,
         attribution)
       VALUES ($1, $2, $3, $4, 'website', 'new', $5, $6::jsonb)`,
      [
        id,
        input.companyName,
        input.phone,
        input.email,
        input.salesLeadId,
        input.attribution ? JSON.stringify(input.attribution) : null,
      ]
    )
    await addActivity(db, { leadId: id, kind: "created", meta: { source: "website" } })
  } catch (error) {
    rethrowNever("website_lead")(error)
  }
}

// That request's lead then booked a demo on Cal.com.
export async function crmMeetingBooked(
  db: PostgresDatabase,
  input: { salesLeadId: string; startTime: string }
) {
  try {
    const rows = await db.query<{ id: string; stage: CrmStage; meeting_at: string | Date | null }>(
      "SELECT id, stage, meeting_at FROM crm_leads WHERE sales_lead_id = $1",
      [input.salesLeadId]
    )
    const lead = rows.rows[0]
    if (!lead) return
    await bookMeeting(db, lead, { startTime: input.startTime, via: "website_form" })
  } catch (error) {
    rethrowNever("meeting")(error)
  }
}

// What a website lead said it's interested in (the form's last step): Madar apps go into its
// interests, a free-text "other" into its tags, and the answer onto its timeline.
export async function crmWebsiteInterests(
  db: PostgresDatabase,
  input: { salesLeadId: string; interests: string[]; other: string | null }
) {
  try {
    const rows = await db.query<{ id: string; interests: string[] | null; tags: string[] | null }>(
      "SELECT id, interests, tags FROM crm_leads WHERE sales_lead_id = $1",
      [input.salesLeadId]
    )
    const lead = rows.rows[0]
    if (!lead) return
    const interests = [...new Set([...(lead.interests ?? []), ...input.interests])]
    const tags = input.other ? [...new Set([...(lead.tags ?? []), input.other])] : (lead.tags ?? [])
    await db.query(
      "UPDATE crm_leads SET interests = $2::jsonb, tags = $3::jsonb, updated_at = now() WHERE id = $1",
      [lead.id, JSON.stringify(interests), JSON.stringify(tags)]
    )
    await addActivity(db, {
      leadId: String(lead.id),
      kind: "note",
      body: [
        "اهتمامات العميل من نموذج الموقع:",
        ...input.interests.map((id) => `• ${WEBSITE_INTEREST_LABEL[id] ?? id}`),
        ...(input.other ? [`• أخرى: ${input.other}`] : []),
      ].join("\n"),
      meta: { source: "website_interests" },
    })
  } catch (error) {
    rethrowNever("website_interests")(error)
  }
}

const WEBSITE_INTEREST_LABEL: Record<string, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
}

// That request's lead asked for a phone call at a time it picked: on the lead, on its timeline,
// and as a follow-up due then (unassigned -- the team picks it up from المتابعات).
export async function crmCallRequested(
  db: PostgresDatabase,
  input: { salesLeadId: string; callAt: string }
) {
  try {
    const rows = await db.query<{ id: string; owner_user_id: string | null }>(
      "SELECT id, owner_user_id FROM crm_leads WHERE sales_lead_id = $1",
      [input.salesLeadId]
    )
    const lead = rows.rows[0]
    if (!lead) return
    await db.query("UPDATE crm_leads SET call_at = $2, updated_at = now() WHERE id = $1", [
      lead.id,
      input.callAt,
    ])
    await addActivity(db, {
      leadId: String(lead.id),
      kind: "call_request",
      meta: { callAt: input.callAt },
    })
    await db.query(
      `INSERT INTO crm_tasks (id, lead_id, title, due_at, assignee_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), lead.id, "مكالمة هاتفية طلبها العميل", input.callAt, lead.owner_user_id]
    )
  } catch (error) {
    rethrowNever("call_request")(error)
  }
}

// Records a booked meeting on a lead and moves it to "اجتماع محجوز" -- from any stage but won
// (a lost lead booking a meeting is back in play).
async function bookMeeting(
  db: PostgresDatabase,
  lead: { id: string; stage: CrmStage; meeting_at?: string | Date | null },
  meeting: {
    startTime: string
    via: "website_form" | "booking_link"
    uid?: string | null
    // Cal.com "requires confirmation": booked, waiting for the team to accept it.
    pending?: boolean
  }
) {
  // The same booking arrives twice from the website form (its page, and Cal.com's webhook).
  if (
    lead.meeting_at &&
    new Date(lead.meeting_at).getTime() === new Date(meeting.startTime).getTime()
  ) {
    return
  }
  await db.query(
    "UPDATE crm_leads SET meeting_at = $2, meeting_source = $3, updated_at = now() WHERE id = $1",
    [lead.id, meeting.startTime, meeting.via]
  )
  await addActivity(db, {
    leadId: lead.id,
    kind: "meeting",
    meta: {
      startTime: meeting.startTime,
      via: meeting.via,
      uid: meeting.uid ?? null,
      ...(meeting.pending ? { pending: true } : {}),
    },
  })
  if (lead.stage !== "meeting" && lead.stage !== "won") await setStage(db, lead, "meeting")
}

// A cancelled or rejected Cal.com booking: off the lead it was on (found by the booking's id,
// else the website form's lead, else email/phone), logged, and -- if the lead was waiting on that
// meeting -- back to "تم التواصل".
async function cancelMeeting(
  db: PostgresDatabase,
  input: {
    email: string | null
    phone: string | null
    startTime: string
    uid: string | null
    salesLeadId?: string | null
    event?: string
    reason?: string | null
  }
): Promise<string | null> {
  type Row = {
    id: string
    stage: CrmStage
    meeting_at: string | Date | null
    email: string | null
    phone: string | null
  }
  const leads = await db.query<Row>(
    "SELECT id, stage, meeting_at, email, phone FROM crm_leads ORDER BY created_at DESC LIMIT 2000"
  )
  let lead: Row | undefined
  if (input.uid) {
    const booked = await db.query<{ lead_id: string; meta: Record<string, unknown> | null }>(
      "SELECT lead_id, meta FROM crm_activities WHERE kind = 'meeting' ORDER BY created_at DESC LIMIT 2000"
    )
    const hit = booked.rows.find((row) => row.meta?.uid === input.uid)
    if (hit) lead = leads.rows.find((row) => String(row.id) === String(hit.lead_id))
  }
  if (!lead && input.salesLeadId) {
    const fromForm = await db.query<{ id: string }>(
      "SELECT id FROM crm_leads WHERE sales_lead_id = $1",
      [input.salesLeadId]
    )
    lead = leads.rows.find((row) => String(row.id) === String(fromForm.rows[0]?.id))
  }
  if (!lead) {
    const email = input.email?.trim().toLowerCase() || null
    const phone = phoneDigits(input.phone)
    lead = leads.rows.find(
      (row) =>
        (email && row.email?.toLowerCase() === email) ||
        (phone.length >= 9 && phoneDigits(row.phone) === phone)
    )
  }
  if (!lead) return null
  const sameMeeting =
    !lead.meeting_at || new Date(lead.meeting_at).getTime() === new Date(input.startTime).getTime()
  if (sameMeeting) {
    await db.query("UPDATE crm_leads SET meeting_at = NULL, updated_at = now() WHERE id = $1", [
      lead.id,
    ])
  }
  await addActivity(db, {
    leadId: String(lead.id),
    kind: "meeting",
    meta: {
      action: input.event === "rejected" ? "rejected" : "cancelled",
      startTime: input.startTime,
      uid: input.uid,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  })
  if (sameMeeting && lead.stage === "meeting") await setStage(db, lead, "contacted")
  return String(lead.id)
}

const phoneDigits = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "").slice(-9)

// A meeting booked on Cal.com (its webhook). Joins the lead with that email or phone; someone
// new becomes a lead of its own, source "booking". The website form's own booking step also
// reaches here -- that meeting is already on its lead, so it isn't recorded twice.
export async function crmBookingReceived(
  db: PostgresDatabase,
  input: {
    email: string | null
    name: string | null
    phone: string | null
    startTime: string
    uid: string | null
    // Set when it was booked from the website form's step (Cal.com metadata[leadId]).
    salesLeadId?: string | null
    // Default "created". Cancelled/rejected take the meeting off its lead.
    event?: "created" | "requested" | "rescheduled" | "cancelled" | "rejected"
    reason?: string | null
  }
): Promise<string | null> {
  try {
    if (input.event === "cancelled" || input.event === "rejected") {
      return await cancelMeeting(db, input)
    }
    const pending = input.event === "requested"
    if (input.salesLeadId) {
      const fromForm = await db.query<{
        id: string
        stage: CrmStage
        meeting_at: string | Date | null
      }>("SELECT id, stage, meeting_at FROM crm_leads WHERE sales_lead_id = $1", [
        input.salesLeadId,
      ])
      if (fromForm.rows[0]) {
        await bookMeeting(db, fromForm.rows[0], {
          startTime: input.startTime,
          via: "website_form",
          uid: input.uid,
          pending,
        })
        return String(fromForm.rows[0].id)
      }
    }
    const email = input.email?.trim().toLowerCase() || null
    const phone = phoneDigits(input.phone)
    const candidates = await db.query<{
      id: string
      stage: CrmStage
      email: string | null
      phone: string | null
      meeting_at: string | Date | null
    }>(
      "SELECT id, stage, email, phone, meeting_at FROM crm_leads ORDER BY created_at DESC LIMIT 2000"
    )
    const match = candidates.rows.find(
      (lead) =>
        (email && lead.email?.toLowerCase() === email) ||
        (phone.length >= 9 && phoneDigits(lead.phone) === phone)
    )
    if (match) {
      await bookMeeting(db, match, {
        startTime: input.startTime,
        via: "booking_link",
        uid: input.uid,
        pending,
      })
      return String(match.id)
    }
    const id = randomUUID()
    const name = input.name?.trim() || email || input.phone || "حجز اجتماع"
    await db.query(
      `INSERT INTO crm_leads (id, company_name, contact_name, phone, email, source, stage)
       VALUES ($1, $2, $3, $4, $5, 'booking', 'new')`,
      [id, name, input.name?.trim() || null, input.phone?.trim() || null, email]
    )
    await addActivity(db, { leadId: id, kind: "created", meta: { source: "booking" } })
    await bookMeeting(
      db,
      { id, stage: "new" },
      { startTime: input.startTime, via: "booking_link", uid: input.uid, pending }
    )
    return id
  } catch (error) {
    rethrowNever("booking")(error)
    return null
  }
}

// A new Madar account (a trial). Joins the lead it came from when one matches its email or phone;
// otherwise it's a new lead of its own.
export async function crmFromSignup(
  db: PostgresDatabase,
  input: {
    organizationId: string
    companyName: string
    contactName: string | null
    email: string | null
    phone?: string | null
    attribution?: LeadAttribution | null
  }
): Promise<string | null> {
  try {
    const attribution = input.attribution ? JSON.stringify(input.attribution) : null
    const organization = await db.query("SELECT id FROM organizations WHERE id = $1", [
      input.organizationId,
    ])
    if (organization.rows.length === 0) return null
    const email = input.email?.trim().toLowerCase() || null
    const candidates = await db.query<{
      id: string
      stage: CrmStage
      email: string | null
      phone: string | null
      organization_id: string | null
    }>(
      "SELECT id, stage, email, phone, organization_id FROM crm_leads WHERE organization_id IS NULL ORDER BY created_at DESC LIMIT 500"
    )
    const match = candidates.rows.find(
      (lead) =>
        (email && lead.email?.toLowerCase() === email) ||
        (input.phone && lead.phone && lead.phone === input.phone)
    )
    if (match) {
      await db.query(
        `UPDATE crm_leads SET organization_id = $2, updated_at = now(),
           contact_name = COALESCE(contact_name, $3), email = COALESCE(email, $4),
           attribution = COALESCE(attribution, $5::jsonb)
         WHERE id = $1`,
        [match.id, input.organizationId, input.contactName, email, attribution]
      )
      await addActivity(db, {
        leadId: match.id,
        kind: "signup",
        meta: { organizationId: input.organizationId },
      })
      if ((await stageRank(db, match.stage)) < (await stageRank(db, "trial"))) {
        await setStage(db, match, "trial")
      }
      return match.id
    }
    const id = randomUUID()
    await db.query(
      `INSERT INTO crm_leads (id, company_name, contact_name, email, phone, source, stage,
         organization_id, attribution)
       VALUES ($1, $2, $3, $4, $5, 'signup', 'trial', $6, $7::jsonb)`,
      [
        id,
        input.companyName,
        input.contactName,
        email,
        input.phone ?? null,
        input.organizationId,
        attribution,
      ]
    )
    await addActivity(db, { leadId: id, kind: "created", meta: { source: "signup" } })
    return id
  } catch (error) {
    rethrowNever("signup")(error)
    return null
  }
}

// An account paid for a subscription: its lead is won, and the payment counts toward its value.
export async function crmPaymentReceived(
  db: PostgresDatabase,
  input: { organizationId: string; amountHalalas: number; application: string }
) {
  try {
    const rows = await db.query<{ id: string; stage: CrmStage }>(
      "SELECT id, stage FROM crm_leads WHERE organization_id = $1 ORDER BY created_at LIMIT 1",
      [input.organizationId]
    )
    const lead = rows.rows[0]
    if (!lead) return
    await db.query(
      `UPDATE crm_leads SET won_value_halalas = COALESCE(won_value_halalas, 0) + $2,
         updated_at = now() WHERE id = $1`,
      [lead.id, input.amountHalalas]
    )
    await addActivity(db, {
      leadId: lead.id,
      kind: "payment",
      meta: { amount: input.amountHalalas / 100, application: input.application },
    })
    if (lead.stage !== "won") await setStage(db, lead, "won")
  } catch (error) {
    rethrowNever("payment")(error)
  }
}

// A lead's value for a filter-builder field.
// The platform that first brought a lead: its UTM source, else the site that referred it, else
// "direct" (typed the address, or no tracking info).
function leadPlatform(row: LeadRow) {
  const first = row.attribution?.first
  return (first?.source || first?.referrer || "direct").toLowerCase()
}

function campaignBreakdown(leads: LeadRow[], withMeeting: Set<string>) {
  const groups = new Map<string, CrmDashboard["byCampaign"][number]>()
  for (const lead of leads) {
    const platform = leadPlatform(lead)
    const campaign = lead.attribution?.first?.campaign ?? null
    const key = `${platform}\u0000${campaign ?? ""}`
    const group = groups.get(key) ?? {
      platform,
      campaign,
      leads: 0,
      meetings: 0,
      won: 0,
      wonValue: 0,
    }
    group.leads += 1
    if (lead.meeting_at || withMeeting.has(String(lead.id))) group.meetings += 1
    if (lead.stage === "won") {
      group.won += 1
      group.wonValue += sar(lead.won_value_halalas) ?? 0
    }
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => right.leads - left.leads)
}

function leadField(row: LeadRow, field: string): FieldValue {
  if (field.startsWith("custom:")) {
    const value = (row.custom_fields ?? {})[field.slice("custom:".length)]
    return value === undefined ? null : value
  }
  switch (field) {
    case "stage":
      return row.stage
    case "source":
      return row.source
    case "owner":
      return row.owner_user_id ? String(row.owner_user_id) : "unassigned"
    case "interests":
      return row.interests ?? []
    case "tags":
      return row.tags ?? []
    case "expectedValue":
      return row.expected_value_halalas === null ? null : row.expected_value_halalas / 100
    case "wonValue":
      return row.won_value_halalas === null ? null : row.won_value_halalas / 100
    case "createdAt":
      return iso(row.created_at)
    case "stageChangedAt":
      return iso(row.stage_changed_at)
    case "meetingAt":
      return iso(row.meeting_at)
    case "utmPlatform":
      return leadPlatform(row)
    case "utmCampaign":
      return row.attribution?.first?.campaign ?? null
    case "utmContent":
      return row.attribution?.first?.content ?? null
    case "utmMedium":
      return row.attribution?.first?.medium ?? null
    case "companyName":
      return row.company_name
    case "contactName":
      return row.contact_name
    case "phone":
      return row.phone
    case "email":
      return row.email
    case "hasAccount":
      return Boolean(row.organization_id)
    default:
      return null
  }
}

function matchesLead(row: LeadRow, filters: CrmLeadFilters) {
  const search = filters.search?.trim().toLowerCase()
  return (
    (!filters.stage || row.stage === filters.stage) &&
    (!filters.source || row.source === filters.source) &&
    (!filters.owner ||
      (filters.owner === "unassigned"
        ? !row.owner_user_id
        : String(row.owner_user_id) === filters.owner)) &&
    (!search ||
      [row.company_name, row.contact_name, row.phone, row.email, ...(row.tags ?? [])].some(
        (value) => value?.toLowerCase().includes(search)
      )) &&
    withinDays(row.created_at, filters.from, filters.to) &&
    matchesAll((field) => leadField(row, field), filters.conditions ?? [])
  )
}

// ---- What Madar Admin's CRM pages use (crm:manage). ----
export class CrmService {
  constructor(
    private readonly db: PostgresDatabase,
    // The staff who can own leads: Super Admins and the Sales role.
    private readonly listSalesStaff: () => Promise<CrmPerson[]>
  ) {}

  private async people(ids: (string | null)[]): Promise<Map<string, CrmPerson>> {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    const people = new Map<string, CrmPerson>()
    if (wanted.length === 0) return people
    // One lookup per person: only a handful of staff ever own leads or tasks.
    const rows = (
      await Promise.all(
        wanted.map((id) =>
          this.db.query<{ id: string; email: string; full_name: string | null }>(
            "SELECT id, email, full_name FROM users WHERE id = $1",
            [id]
          )
        )
      )
    ).flatMap((result) => result.rows)
    for (const row of rows) {
      people.set(String(row.id), {
        id: String(row.id),
        name: row.full_name || row.email,
        email: row.email,
      })
    }
    return people
  }

  private async openTasks(leadIds: string[]): Promise<Map<string, TaskRow[]>> {
    const byLead = new Map<string, TaskRow[]>()
    if (leadIds.length === 0) return byLead
    const wanted = new Set(leadIds)
    const rows = await this.db.query<TaskRow>(
      `SELECT id, lead_id, title, due_at, assignee_user_id, done_at, created_at
         FROM crm_tasks WHERE done_at IS NULL ORDER BY due_at LIMIT 5000`
    )
    for (const row of rows.rows) {
      if (!wanted.has(String(row.lead_id))) continue
      const list = byLead.get(String(row.lead_id)) ?? []
      list.push(row)
      byLead.set(String(row.lead_id), list)
    }
    return byLead
  }

  private async view(rows: LeadRow[]): Promise<CrmLeadView[]> {
    const [people, tasks] = await Promise.all([
      this.people(rows.map((row) => row.owner_user_id)),
      this.openTasks(rows.map((row) => String(row.id))),
    ])
    return rows.map((row) => {
      const open = tasks.get(String(row.id)) ?? []
      const next = open[0]
      return {
        id: String(row.id),
        companyName: row.company_name,
        contactName: row.contact_name,
        phone: row.phone,
        email: row.email,
        source: row.source,
        stage: row.stage,
        owner: row.owner_user_id ? (people.get(String(row.owner_user_id)) ?? null) : null,
        expectedValue: sar(row.expected_value_halalas),
        wonValue: sar(row.won_value_halalas),
        lostReason: row.lost_reason,
        organizationId: row.organization_id ? String(row.organization_id) : null,
        meetingAt: iso(row.meeting_at),
        meetingSource: row.meeting_source ?? null,
        callAt: iso(row.call_at ?? null),
        attribution: row.attribution ?? null,
        stageChangedAt: iso(row.stage_changed_at) as string,
        wonAt: iso(row.won_at),
        createdAt: iso(row.created_at) as string,
        updatedAt: iso(row.updated_at) as string,
        nextTask: next
          ? { id: String(next.id), title: next.title, dueAt: iso(next.due_at) as string }
          : null,
        openTaskCount: open.length,
        interests: row.interests ?? [],
        tags: row.tags ?? [],
        customFields: row.custom_fields ?? {},
      }
    })
  }

  private async leadRow(id: string): Promise<LeadRow> {
    const rows = await this.db.query<LeadRow>("SELECT * FROM crm_leads WHERE id = $1", [id])
    const row = rows.rows[0]
    if (!row) throw ERRORS.notFound("Lead")
    return row
  }

  // ---- Pipeline stages ----

  async stages(actor: AuthenticatedActor) {
    requirePlatformPermission(actor, "crm:manage")
    return listStages(this.db)
  }

  async saveStage(
    actor: AuthenticatedActor,
    key: string | null,
    input: { label: string; color: StageColor; after?: string }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    return saveStage(this.db, key, input)
  }

  async reorderStages(actor: AuthenticatedActor, order: string[]) {
    requirePlatformPermission(actor, "crm:manage")
    return reorderStages(this.db, order)
  }

  async deleteStage(actor: AuthenticatedActor, key: string, moveTo: string) {
    requirePlatformPermission(actor, "crm:manage")
    return deleteStage(this.db, key, moveTo)
  }

  async owners(actor: AuthenticatedActor): Promise<CrmPerson[]> {
    requirePlatformPermission(actor, "crm:manage")
    return this.listSalesStaff()
  }

  async listLeads(
    actor: AuthenticatedActor,
    filters: CrmLeadFilters,
    paging: { page: number; pageSize: number }
  ): Promise<{ items: CrmLeadView[]; total: number; page: number; pageSize: number }> {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<LeadRow>(
      "SELECT * FROM crm_leads ORDER BY created_at DESC LIMIT 5000"
    )
    const matching = rows.rows.filter((row) => matchesLead(row, filters))
    const start = (paging.page - 1) * paging.pageSize
    return {
      items: await this.view(matching.slice(start, start + paging.pageSize)),
      total: matching.length,
      page: paging.page,
      pageSize: paging.pageSize,
    }
  }

  // The board: every open lead, plus what was won or lost in the last 30 days, filtered. The page
  // groups it (by stage, owner, source, interest, or a custom field).
  async pipeline(actor: AuthenticatedActor, filters: CrmLeadFilters) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<LeadRow>(
      `SELECT * FROM crm_leads
        WHERE stage NOT IN ('won', 'lost')
           OR stage_changed_at > now() - interval '30 days'
        ORDER BY stage_changed_at DESC LIMIT 1000`
    )
    return { leads: await this.view(rows.rows.filter((row) => matchesLead(row, filters))) }
  }

  async getLead(actor: AuthenticatedActor, id: string): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.leadRow(id)
    const [[lead], activityRows, taskRows] = await Promise.all([
      this.view([row]),
      this.db.query<{
        id: string
        kind: CrmActivityKind
        body: string | null
        meta: Record<string, unknown> | null
        actor_user_id: string | null
        created_at: string | Date
      }>("SELECT * FROM crm_activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 300", [
        id,
      ]),
      this.db.query<TaskRow>("SELECT * FROM crm_tasks WHERE lead_id = $1 ORDER BY due_at", [id]),
    ])
    const people = await this.people([
      ...activityRows.rows.map((activity) => activity.actor_user_id),
      ...taskRows.rows.map((task) => task.assignee_user_id),
    ])
    let organization: CrmLeadDetail["organization"] = null
    if (row.organization_id) {
      const org = await this.db.query<{ id: string; name: string; created_at: string | Date }>(
        "SELECT id, name, created_at FROM organizations WHERE id = $1",
        [row.organization_id]
      )
      if (org.rows[0]) {
        organization = {
          id: String(org.rows[0].id),
          name: org.rows[0].name,
          createdAt: iso(org.rows[0].created_at) as string,
        }
      }
    }
    return {
      lead,
      activities: activityRows.rows.map(
        (activity): CrmActivityView => ({
          id: String(activity.id),
          kind: activity.kind,
          body: activity.body,
          meta: activity.meta ?? {},
          actor: activity.actor_user_id
            ? (people.get(String(activity.actor_user_id)) ?? null)
            : null,
          createdAt: iso(activity.created_at) as string,
        })
      ),
      // Open follow-ups first (soonest due), then the done ones.
      tasks: [...taskRows.rows]
        .sort((left, right) => Number(Boolean(left.done_at)) - Number(Boolean(right.done_at)))
        .map((task) => this.taskView(task, row.company_name, people)),
      organization,
    }
  }

  private taskView(
    task: TaskRow,
    companyName: string,
    people: Map<string, CrmPerson>
  ): CrmTaskView {
    return {
      id: String(task.id),
      leadId: String(task.lead_id),
      leadCompanyName: companyName,
      title: task.title,
      dueAt: iso(task.due_at) as string,
      assignee: task.assignee_user_id ? (people.get(String(task.assignee_user_id)) ?? null) : null,
      doneAt: iso(task.done_at),
      createdAt: iso(task.created_at) as string,
    }
  }

  async createLead(actor: AuthenticatedActor, input: CrmLeadInput): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO crm_leads
         (id, company_name, contact_name, phone, email, source, stage, owner_user_id,
          expected_value_halalas, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'manual', 'new', $6, $7, $8)`,
      [
        id,
        input.companyName,
        input.contactName ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.ownerUserId ?? actor.userId,
        halalas(input.expectedValue),
        actor.userId,
      ]
    )
    await addActivity(this.db, {
      leadId: id,
      kind: "created",
      meta: { source: "manual" },
      actorUserId: actor.userId,
    })
    return this.getLead(actor, id)
  }

  async updateLead(
    actor: AuthenticatedActor,
    id: string,
    patch: Partial<CrmLeadInput>
  ): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.leadRow(id)
    const next = {
      company_name: patch.companyName ?? row.company_name,
      contact_name: patch.contactName !== undefined ? patch.contactName : row.contact_name,
      phone: patch.phone !== undefined ? patch.phone : row.phone,
      email: patch.email !== undefined ? patch.email : row.email,
      expected_value_halalas:
        patch.expectedValue !== undefined
          ? halalas(patch.expectedValue)
          : row.expected_value_halalas,
      owner_user_id: patch.ownerUserId !== undefined ? patch.ownerUserId : row.owner_user_id,
      interests: patch.interests ?? row.interests ?? [],
      tags: patch.tags ?? row.tags ?? [],
      custom_fields: patch.customFields
        ? await this.mergeCustomFields(row.custom_fields ?? {}, patch.customFields)
        : (row.custom_fields ?? {}),
    }
    await this.db.query(
      `UPDATE crm_leads SET company_name = $2, contact_name = $3, phone = $4, email = $5,
         expected_value_halalas = $6, owner_user_id = $7, interests = $8::jsonb, tags = $9::jsonb,
         custom_fields = $10::jsonb, updated_at = now()
       WHERE id = $1`,
      [
        id,
        next.company_name,
        next.contact_name,
        next.phone,
        next.email,
        next.expected_value_halalas,
        next.owner_user_id,
        JSON.stringify([...new Set(next.interests)]),
        JSON.stringify([...new Set(next.tags.map((tag) => tag.trim()).filter(Boolean))]),
        JSON.stringify(next.custom_fields),
      ]
    )
    if (String(next.owner_user_id ?? "") !== String(row.owner_user_id ?? "")) {
      await addActivity(this.db, {
        leadId: id,
        kind: "owner",
        meta: { to: next.owner_user_id },
        actorUserId: actor.userId,
      })
    }
    return this.getLead(actor, id)
  }

  // Only fields that exist are kept, each value checked against its field's type.
  private async mergeCustomFields(
    current: Record<string, string | number | boolean | null>,
    patch: Record<string, string | number | boolean | null>
  ) {
    const fields = new Map((await this.listCustomFieldRows()).map((field) => [field.id, field]))
    const merged = { ...current }
    for (const [key, value] of Object.entries(patch)) {
      const field = fields.get(key)
      if (!field) continue
      if (value === null || value === "") {
        delete merged[key]
        continue
      }
      if (field.type === "number" && !Number.isFinite(Number(value))) {
        throw ERRORS.validation({ [field.label]: "Must be a number." })
      }
      if (field.type === "select" && !field.options.includes(String(value))) {
        throw ERRORS.validation({ [field.label]: "Not one of the field's choices." })
      }
      merged[key] =
        field.type === "number"
          ? Number(value)
          : field.type === "checkbox"
            ? Boolean(value)
            : String(value)
    }
    return merged
  }

  // ---- Custom fields ----

  private async listCustomFieldRows(): Promise<CrmCustomField[]> {
    const rows = await this.db.query<{
      id: string
      label: string
      field_type: CrmFieldType
      options: string[] | null
      sort_order: number
    }>("SELECT * FROM crm_custom_fields ORDER BY sort_order, created_at")
    return rows.rows.map((row) => ({
      id: String(row.id),
      label: row.label,
      type: row.field_type,
      options: row.options ?? [],
      sortOrder: row.sort_order,
    }))
  }

  async listCustomFields(actor: AuthenticatedActor) {
    requirePlatformPermission(actor, "crm:manage")
    return this.listCustomFieldRows()
  }

  async saveCustomField(
    actor: AuthenticatedActor,
    id: string | null,
    input: { label: string; type: CrmFieldType; options?: string[] }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    const options =
      input.type === "select"
        ? [...new Set((input.options ?? []).map((option) => option.trim()).filter(Boolean))]
        : []
    if (input.type === "select" && options.length === 0) {
      throw ERRORS.validation({ options: "A list field needs at least one choice." })
    }
    if (id) {
      const updated = await this.db.query(
        "UPDATE crm_custom_fields SET label = $2, field_type = $3, options = $4::jsonb WHERE id = $1",
        [id, input.label, input.type, JSON.stringify(options)]
      )
      if (!updated.rowCount) throw ERRORS.notFound("Field")
    } else {
      const count = (await this.listCustomFieldRows()).length
      await this.db.query(
        `INSERT INTO crm_custom_fields (id, label, field_type, options, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [randomUUID(), input.label, input.type, JSON.stringify(options), count]
      )
    }
    return this.listCustomFieldRows()
  }

  async deleteCustomField(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    await this.db.query("DELETE FROM crm_custom_fields WHERE id = $1", [id])
    return this.listCustomFieldRows()
  }

  // ---- Saved views (shared by the whole sales team) ----

  async listViews(actor: AuthenticatedActor, page: CrmViewPage): Promise<CrmSavedView[]> {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<{
      id: string
      name: string
      page: CrmViewPage
      definition: Record<string, unknown> | null
      created_by_user_id: string | null
      created_at: string | Date
    }>("SELECT * FROM crm_saved_views WHERE page = $1 ORDER BY created_at", [page])
    const people = await this.people(rows.rows.map((row) => row.created_by_user_id))
    return rows.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      page: row.page,
      definition: row.definition ?? {},
      createdBy: row.created_by_user_id
        ? (people.get(String(row.created_by_user_id)) ?? null)
        : null,
      createdAt: iso(row.created_at) as string,
    }))
  }

  async saveView(
    actor: AuthenticatedActor,
    input: { name: string; page: CrmViewPage; definition: Record<string, unknown> }
  ) {
    requirePlatformPermission(actor, "crm:manage")
    await this.db.query(
      `INSERT INTO crm_saved_views (id, name, page, definition, created_by_user_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [randomUUID(), input.name, input.page, JSON.stringify(input.definition), actor.userId]
    )
    return this.listViews(actor, input.page)
  }

  async deleteView(actor: AuthenticatedActor, id: string) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<{ page: CrmViewPage }>(
      "SELECT page FROM crm_saved_views WHERE id = $1",
      [id]
    )
    const page = rows.rows[0]?.page
    if (!page) throw ERRORS.notFound("View")
    await this.db.query("DELETE FROM crm_saved_views WHERE id = $1", [id])
    return this.listViews(actor, page)
  }

  async changeStage(
    actor: AuthenticatedActor,
    id: string,
    stage: CrmStage,
    lostReason?: string | null
  ): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.leadRow(id)
    await requireStage(this.db, stage)
    await setStage(this.db, { id, stage: row.stage }, stage, {
      actorUserId: actor.userId,
      lostReason,
    })
    return this.getLead(actor, id)
  }

  async logActivity(
    actor: AuthenticatedActor,
    id: string,
    input: { kind: CrmLoggableActivity; body: string }
  ): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    const row = await this.leadRow(id)
    await addActivity(this.db, {
      leadId: id,
      kind: input.kind,
      body: input.body,
      actorUserId: actor.userId,
    })
    await this.db.query("UPDATE crm_leads SET updated_at = now() WHERE id = $1", [id])
    // Reaching out to a brand-new lead means it's been contacted.
    if (input.kind !== "note" && row.stage === "new") {
      await setStage(this.db, { id, stage: row.stage }, "contacted", { actorUserId: actor.userId })
    }
    return this.getLead(actor, id)
  }

  async deleteLead(actor: AuthenticatedActor, id: string): Promise<void> {
    requirePlatformPermission(actor, "crm:manage")
    await this.leadRow(id)
    const paid = await this.db.query(
      "SELECT id FROM crm_invoices WHERE lead_id = $1 AND status = 'paid'",
      [id]
    )
    if (paid.rows.length > 0) {
      throw ERRORS.validation({ lead: "A lead with paid invoices can't be deleted." })
    }
    await this.db.query("DELETE FROM crm_activities WHERE lead_id = $1", [id])
    await this.db.query("DELETE FROM crm_tasks WHERE lead_id = $1", [id])
    await this.db.query("DELETE FROM crm_leads WHERE id = $1", [id])
  }

  // ---- Follow-ups ----

  async createTask(
    actor: AuthenticatedActor,
    leadId: string,
    input: { title: string; dueAt: string; assigneeUserId?: string | null }
  ): Promise<CrmLeadDetail> {
    requirePlatformPermission(actor, "crm:manage")
    await this.leadRow(leadId)
    await this.db.query(
      `INSERT INTO crm_tasks (id, lead_id, title, due_at, assignee_user_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        leadId,
        input.title,
        input.dueAt,
        input.assigneeUserId === undefined ? actor.userId : input.assigneeUserId,
        actor.userId,
      ]
    )
    return this.getLead(actor, leadId)
  }

  async setTaskDone(actor: AuthenticatedActor, taskId: string, done: boolean) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<TaskRow>("SELECT * FROM crm_tasks WHERE id = $1", [taskId])
    const task = rows.rows[0]
    if (!task) throw ERRORS.notFound("Task")
    await this.db.query("UPDATE crm_tasks SET done_at = $2, done_by_user_id = $3 WHERE id = $1", [
      taskId,
      done ? new Date().toISOString() : null,
      done ? actor.userId : null,
    ])
    if (done && !task.done_at) {
      await addActivity(this.db, {
        leadId: String(task.lead_id),
        kind: "task",
        body: task.title,
        actorUserId: actor.userId,
      })
    }
    return this.getLead(actor, String(task.lead_id))
  }

  async deleteTask(actor: AuthenticatedActor, taskId: string) {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<TaskRow>("SELECT * FROM crm_tasks WHERE id = $1", [taskId])
    const task = rows.rows[0]
    if (!task) throw ERRORS.notFound("Task")
    await this.db.query("DELETE FROM crm_tasks WHERE id = $1", [taskId])
    return this.getLead(actor, String(task.lead_id))
  }

  // Open follow-ups across leads: the caller's own ("mine") or everyone's.
  async listTasks(
    actor: AuthenticatedActor,
    filters: {
      scope: "mine" | "all"
      status: "open" | "overdue" | "done"
      // A range on the due date.
      from?: string
      to?: string
    }
  ): Promise<CrmTaskView[]> {
    requirePlatformPermission(actor, "crm:manage")
    const rows = await this.db.query<TaskRow>("SELECT * FROM crm_tasks ORDER BY due_at LIMIT 2000")
    const now = Date.now()
    const matching = rows.rows.filter((task) => {
      if (filters.scope === "mine" && String(task.assignee_user_id) !== actor.userId) return false
      if (!withinDays(task.due_at, filters.from, filters.to)) return false
      if (filters.status === "done") return Boolean(task.done_at)
      if (task.done_at) return false
      return filters.status === "overdue" ? new Date(task.due_at).getTime() < now : true
    })
    const leadIds = [...new Set(matching.map((task) => String(task.lead_id)))]
    const wantedLeads = new Set(leadIds)
    const leads = leadIds.length
      ? await this.db.query<{ id: string; company_name: string }>(
          "SELECT id, company_name FROM crm_leads"
        )
      : { rows: [] }
    const names = new Map(
      leads.rows
        .filter((lead) => wantedLeads.has(String(lead.id)))
        .map((lead) => [String(lead.id), lead.company_name])
    )
    const people = await this.people(matching.map((task) => task.assignee_user_id))
    const ordered = filters.status === "done" ? [...matching].reverse() : matching
    return ordered.map((task) =>
      this.taskView(task, names.get(String(task.lead_id)) ?? "—", people)
    )
  }

  // ---- The sales dashboard ----

  async dashboard(actor: AuthenticatedActor, rangeDays: number): Promise<CrmDashboard> {
    requirePlatformPermission(actor, "crm:manage")
    const [leadRows, meetingRows, taskRows] = await Promise.all([
      this.db.query<LeadRow>("SELECT * FROM crm_leads"),
      this.db.query<{ created_at: string | Date }>(
        "SELECT lead_id, created_at FROM crm_activities WHERE kind = 'meeting'"
      ),
      this.db.query<{ due_at: string | Date; done_at: string | Date | null }>(
        "SELECT due_at, done_at FROM crm_tasks WHERE done_at IS NULL"
      ),
    ])
    const stages = await listStages(this.db)
    const now = Date.now()
    const day = 86_400_000
    const from = now - rangeDays * day
    const previousFrom = from - rangeDays * day
    const within = (value: string | Date | null, start: number, end = now) => {
      if (!value) return false
      const time = new Date(value).getTime()
      return time >= start && time < end
    }
    const leads = leadRows.rows
    const wonInRange = leads.filter((lead) => lead.stage === "won" && within(lead.won_at, from))
    const lostInRange = leads.filter(
      (lead) => lead.stage === "lost" && within(lead.stage_changed_at, from)
    )
    const closed = wonInRange.length + lostInRange.length

    const daily: CrmDashboard["daily"] = []
    for (let index = rangeDays - 1; index >= 0; index -= 1) {
      const date = new Date(now - index * day).toISOString().slice(0, 10)
      daily.push({
        date,
        created: leads.filter((lead) => iso(lead.created_at)?.slice(0, 10) === date).length,
        won: wonInRange.filter((lead) => iso(lead.won_at)?.slice(0, 10) === date).length,
      })
    }

    return {
      rangeDays,
      newLeads: leads.filter((lead) => within(lead.created_at, from)).length,
      newLeadsPrevious: leads.filter((lead) => within(lead.created_at, previousFrom, from)).length,
      meetingsBooked: meetingRows.rows.filter((row) => within(row.created_at, from)).length,
      won: wonInRange.length,
      wonValue: wonInRange.reduce((sum, lead) => sum + (sar(lead.won_value_halalas) ?? 0), 0),
      lost: lostInRange.length,
      winRate: closed > 0 ? Math.round((wonInRange.length / closed) * 100) : null,
      openLeads: leads.filter((lead) => !CLOSED_STAGES.includes(lead.stage)).length,
      overdueTasks: taskRows.rows.filter((task) => new Date(task.due_at).getTime() < now).length,
      byCampaign: campaignBreakdown(
        leads.filter((lead) => within(lead.created_at, from)),
        new Set(meetingRows.rows.map((row) => String((row as { lead_id?: string }).lead_id)))
      ),
      bySource: CRM_SOURCES.map((source) => ({
        source,
        count: leads.filter((lead) => lead.source === source && within(lead.created_at, from))
          .length,
      })),
      byStage: stages.map((stage) => ({
        stage: stage.key,
        label: stage.label,
        color: stage.color,
        count: leads.filter((lead) => lead.stage === stage.key).length,
      })),
      daily,
    }
  }
}
