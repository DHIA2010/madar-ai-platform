import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LeadAttribution } from "../schemas"
import { sendTemplateMessage, type TemplateDefinition } from "./messaging"
import type { WhatsAppPlatformService } from "./platform-config"
import {
  FIRST_LEAD_ALERT_TEMPLATE,
  LEAD_ALERT_TEMPLATE,
  type WhatsAppTemplatesService,
} from "./templates"

// A WhatsApp alert to Madar's own team whenever a new lead arrives: a "talk to sales" request
// from madar.my, or a brand-new account. Sent from Madar's number with the approved
// "madar_account_alert" template to the numbers set in Madar Admin -> settings -> WhatsApp.
// Nothing is sent while no number is set or Meta hasn't approved a template yet.

export interface LeadAlert {
  kind: "website" | "signup"
  name: string
  phone?: string | null
  email?: string | null
  attribution?: LeadAttribution | null
}

const KIND_LABEL: Record<LeadAlert["kind"], string> = {
  website: "طلب تواصل مع المبيعات",
  signup: "تسجيل حساب جديد",
}

// A template parameter can't be empty or hold a line break, and is kept short.
function param(value: string | null | undefined): string {
  const clean = (value ?? "").replace(/\s+/g, " ").trim()
  if (!clean) return "—"
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean
}

// Where the lead came from, as the alert shows it: the last touch's source and campaign.
export function sourceLabel(attribution: LeadAttribution | null | undefined): string {
  const touch = attribution?.last ?? attribution?.first
  if (!touch?.source) return "مباشر"
  return touch.campaign ? `${touch.source} / ${touch.campaign}` : touch.source
}

// The template's five body parameters, in order.
export function leadAlertParameters(lead: LeadAlert): string[] {
  return [
    KIND_LABEL[lead.kind],
    param(lead.name),
    param(lead.phone),
    param(lead.email),
    param(sourceLabel(lead.attribution)),
  ]
}

export class WhatsAppLeadAlertsService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService
  ) {}

  // Never throws and is never awaited by the request that made the lead: an alert that can't be
  // sent must not cost Madar the lead or slow the visitor down.
  async notify(lead: LeadAlert): Promise<void> {
    try {
      const phones = await this.platform.leadAlertPhones()
      if (phones.length > 0) await this.send(phones, leadAlertParameters(lead))
    } catch (error) {
      console.error("whatsapp.lead_alert_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Madar Admin's "send a test alert": the same message with sample values, errors surfaced.
  async sendTest(): Promise<{ sent: number; failed: number }> {
    const phones = await this.platform.leadAlertPhones()
    if (phones.length === 0) {
      throw new IdentityError(
        "LEAD_ALERT_NO_NUMBERS",
        400,
        "validation",
        "Save at least one number to alert first."
      )
    }
    return this.send(phones, [
      "رسالة تجريبية",
      "مؤسسة تجريبية",
      "0500000000",
      "test@example.com",
      "تجربة",
    ])
  }

  // The template to send with: the current one once Meta has approved it, and until then the
  // first version (which Meta caps per recipient), so the alerts don't stop in between.
  private async template(): Promise<TemplateDefinition> {
    try {
      await this.templates.requireApproved(LEAD_ALERT_TEMPLATE)
      return LEAD_ALERT_TEMPLATE
    } catch (notReady) {
      if (!(notReady instanceof IdentityError) || notReady.code !== "WHATSAPP_TEMPLATE_NOT_READY") {
        throw notReady
      }
      try {
        await this.templates.requireApproved(FIRST_LEAD_ALERT_TEMPLATE)
      } catch {
        throw notReady
      }
      return FIRST_LEAD_ALERT_TEMPLATE
    }
  }

  // Each send is kept in whatsapp_messages (no organization: it's Madar's own message).
  private async send(
    phones: string[],
    parameters: string[]
  ): Promise<{ sent: number; failed: number }> {
    const template = await this.template()
    const context = await this.platform.sendingContext()
    let sent = 0
    let failed = 0
    for (const phone of phones) {
      let waMessageId: string | null = null
      let error: string | null = null
      try {
        waMessageId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
          to: phone,
          templateName: template.name,
          language: template.language,
          bodyParameters: parameters,
        })
        sent += 1
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught)
        failed += 1
      }
      await this.db.query(
        `INSERT INTO whatsapp_messages
           (id, organization_id, kind, reference_id, to_phone, template_name, wa_message_id, status,
            error)
         VALUES ($1, NULL, 'lead_alert', NULL, $2, $3, $4, $5, $6)`,
        [randomUUID(), phone, template.name, waMessageId, waMessageId ? "sent" : "failed", error]
      )
    }
    return { sent, failed }
  }
}
