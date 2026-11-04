import { randomUUID } from "node:crypto"

import type { EmailGateway } from "../application/ports"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

export interface SalesLeadInput {
  companyName: string
  phone: string
  email: string | null
}

// Stores a "talk to sales" request from madar.my and emails it to Madar's sales inbox. The lead is
// kept even if the email can't be sent.
export class SalesLeadService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly emailGateway: EmailGateway,
    private readonly notifyEmail: string
  ) {}

  // Returns the new lead's id, so the meeting booked next can be attached to it.
  async submit(
    input: SalesLeadInput,
    context: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<string> {
    const id = randomUUID()
    const submittedAt = new Date().toISOString()
    await this.db.query(
      `INSERT INTO sales_leads (id, company_name, phone, email, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.companyName,
        input.phone,
        input.email,
        context.ipAddress ?? null,
        context.userAgent?.slice(0, 500) ?? null,
        submittedAt,
      ]
    )
    try {
      await this.emailGateway.sendSalesLeadEmail({ to: this.notifyEmail, ...input, submittedAt })
    } catch (error) {
      console.error("sales_leads.notify_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return id
  }

  // The lead booked a demo on Cal.com. Recorded once: a later call can't move it.
  async recordMeeting(leadId: string, meeting: { startTime: string; uid: string | null }) {
    await this.db.query(
      `UPDATE sales_leads SET meeting_at = $2, meeting_uid = $3, meeting_booked_at = now()
        WHERE id = $1 AND meeting_at IS NULL`,
      [leadId, meeting.startTime, meeting.uid]
    )
  }
}
