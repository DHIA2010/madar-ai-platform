import { randomUUID } from "node:crypto"

import type { EmailGateway, SalesLeadEmail } from "../application/ports"
import {
  crmCallRequested,
  crmFromWebsiteLead,
  crmMeetingBooked,
  crmWebsiteInterests,
} from "../crm/service"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LeadAttribution, SalesLeadBusinessType } from "../schemas"
import { sourceLabel, type WhatsAppLeadAlertsService } from "../whatsapp/lead-alerts"

export interface SalesLeadInput {
  companyName: string
  phone: string
  email: string | null
  // Where they came from (UTM tags...), if the site knew.
  attribution?: LeadAttribution | null
  // The kind of business they said they run.
  businessType?: SalesLeadBusinessType | null
}

// As the team reads it, on the lead and in the WhatsApp alert.
export const BUSINESS_TYPE_LABEL: Record<SalesLeadBusinessType, string> = {
  retail: "محل تجزئة",
  restaurant: "مطعم أو مقهى",
  services: "خدمات",
  ecommerce: "متجر إلكتروني",
  other: "نشاط آخر",
}

// Stores a "talk to sales" request from madar.my, emails it to Madar's sales inboxes and alerts
// Madar's team on WhatsApp. The lead is kept even if neither can be sent. A brand-new account is
// announced the same way (notifySignup).
export class SalesLeadService {
  private readonly notifyEmails: string[]

  constructor(
    private readonly db: PostgresDatabase,
    private readonly emailGateway: EmailGateway,
    // One address, or several separated by commas.
    notifyEmail: string,
    private readonly leadAlerts: WhatsAppLeadAlertsService | null = null
  ) {
    this.notifyEmails = notifyEmail
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean)
  }

  // Each inbox on its own, so one that bounces doesn't cost the others the email.
  private async emailTeam(email: Omit<SalesLeadEmail, "to">) {
    for (const to of this.notifyEmails) {
      try {
        await this.emailGateway.sendSalesLeadEmail({ ...email, to })
      } catch (error) {
        console.error("sales_leads.notify_failed", {
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  // A new account was created (not someone joining by invitation). Never throws; callers don't
  // wait for it.
  async notifySignup(input: {
    name: string
    email: string | null
    phone?: string | null
    attribution?: LeadAttribution | null
  }): Promise<void> {
    void this.leadAlerts?.notify({ kind: "signup", ...input })
    await this.emailTeam({
      leadKind: "signup",
      companyName: input.name,
      phone: input.phone ?? null,
      email: input.email,
      source: sourceLabel(input.attribution),
      submittedAt: new Date().toISOString(),
    })
  }

  // Returns the new lead's id, so the meeting booked next can be attached to it.
  async submit(
    input: SalesLeadInput,
    context: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<string> {
    const id = randomUUID()
    const submittedAt = new Date().toISOString()
    await this.db.query(
      `INSERT INTO sales_leads (id, company_name, phone, email, ip_address, user_agent, created_at,
         attribution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        input.companyName,
        input.phone,
        input.email,
        context.ipAddress ?? null,
        context.userAgent?.slice(0, 500) ?? null,
        submittedAt,
        input.attribution ? JSON.stringify(input.attribution) : null,
      ]
    )
    await crmFromWebsiteLead(this.db, {
      salesLeadId: id,
      companyName: input.companyName,
      phone: input.phone,
      email: input.email,
      attribution: input.attribution ?? null,
      businessTypeLabel: input.businessType ? BUSINESS_TYPE_LABEL[input.businessType] : null,
    })
    // Not awaited: the form doesn't wait for WhatsApp.
    void this.leadAlerts?.notify({
      kind: "website",
      name: input.businessType
        ? `${input.companyName} (${BUSINESS_TYPE_LABEL[input.businessType]})`
        : input.companyName,
      phone: input.phone,
      email: input.email,
      attribution: input.attribution ?? null,
    })
    await this.emailTeam({
      companyName: input.companyName,
      phone: input.phone,
      email: input.email,
      source: sourceLabel(input.attribution),
      submittedAt,
    })
    return id
  }

  // The lead booked a demo on Cal.com. Recorded once: a later call can't move it.
  async recordMeeting(leadId: string, meeting: { startTime: string; uid: string | null }) {
    const updated = await this.db.query(
      `UPDATE sales_leads SET meeting_at = $2, meeting_uid = $3, meeting_booked_at = now()
        WHERE id = $1 AND meeting_at IS NULL`,
      [leadId, meeting.startTime, meeting.uid]
    )
    // Only the first booking counts (see above) -- don't log it on the CRM lead twice.
    if (updated.rowCount) {
      await crmMeetingBooked(this.db, { salesLeadId: leadId, startTime: meeting.startTime })
      void this.alertAppointment(leadId, { type: "meeting", at: meeting.startTime })
    }
  }

  // The team is told the time on WhatsApp too, so nobody has to open Madar Admin to find it.
  // Never throws, and isn't waited for.
  private async alertAppointment(
    leadId: string,
    appointment: { type: "call" | "meeting"; at: string }
  ): Promise<void> {
    try {
      const found = await this.db.query<{
        company_name: string
        phone: string | null
        email: string | null
        attribution: LeadAttribution | string | null
      }>("SELECT company_name, phone, email, attribution FROM sales_leads WHERE id = $1", [leadId])
      const lead = found.rows[0]
      if (!lead) return
      const attribution =
        typeof lead.attribution === "string"
          ? (JSON.parse(lead.attribution) as LeadAttribution)
          : lead.attribution
      await this.leadAlerts?.notify({
        kind: "website",
        name: lead.company_name,
        phone: lead.phone,
        email: lead.email,
        attribution,
        appointment,
      })
    } catch (error) {
      console.error("sales_leads.appointment_alert_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // What the lead is interested in, from the form's last step.
  async recordInterests(leadId: string, input: { interests: string[]; other: string | null }) {
    await crmWebsiteInterests(this.db, { salesLeadId: leadId, ...input })
  }

  // Instead of a meeting, the lead asked to be called at a time it picked (once).
  async recordCallRequest(leadId: string, callAt: string) {
    const updated = await this.db.query(
      `UPDATE sales_leads SET call_at = $2, call_requested_at = now()
        WHERE id = $1 AND call_at IS NULL`,
      [leadId, callAt]
    )
    if (updated.rowCount) {
      await crmCallRequested(this.db, { salesLeadId: leadId, callAt })
      void this.alertAppointment(leadId, { type: "call", at: callAt })
    }
  }
}
