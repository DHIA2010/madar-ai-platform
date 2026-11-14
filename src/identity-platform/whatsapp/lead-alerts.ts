import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { LeadAttribution } from "../schemas"
import { sendDirectMessage, sendTemplateMessage, type TemplateDefinition } from "./messaging"
import { toWhatsAppNumber } from "./phone"
import type { WhatsAppPlatformService } from "./platform-config"
import {
  LEAD_ALERT_TEMPLATE,
  SIGNUP_ALERT_TEMPLATE,
  type WhatsAppTemplatesService,
} from "./templates"

// A WhatsApp alert to Madar's own team whenever a new lead arrives: a "talk to sales" request
// from madar.my ("madar_new_lead"), or a brand-new account ("madar_account_alert"). Sent from
// Madar's number to the numbers set in Madar Admin -> settings -> WhatsApp. Nothing is sent while
// no number is set or Meta hasn't approved the template yet.
//
// Meta filed both templates under marketing, and it caps marketing messages per recipient, so some
// alerts never arrived (error 131049). The way around it: for 24 hours after a team number last
// wrote to Madar's number, Meta lets Madar message it directly -- no template, no cap. So while
// those 24 hours last, the alert goes out as a direct message with a "received" button; a tap on
// it counts as writing, and the 24 hours start again. A number that hasn't written in that time
// gets the template, as before. Before the 24 hours run out the number is asked, once, to tap
// again (remindDue).

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

const HOUR_MS = 60 * 60_000
// Meta's window is 24 hours from the recipient's last message; half an hour is kept in hand.
const DIRECT_WINDOW_MS = 23.5 * HOUR_MS
// How long after a number last wrote it is asked to tap again. With the night's 8 quiet hours on
// top it still comes before the window closes.
const REMIND_AFTER_MS = 14 * HOUR_MS
// What whatsapp_messages.template_name holds for a message sent without a template.
const DIRECT = "direct"
const RECEIVED_BUTTON = { id: "lead_alert_received", title: "تم الاستلام" }
const KEEP_BUTTON = { id: "lead_alert_keep", title: "استمرار التنبيهات" }

// No reminder between 23:00 and 07:00 in Riyadh (always UTC+3).
const isQuietHour = (now: Date) => {
  const hour = new Date(now.getTime() + 3 * HOUR_MS).getUTCHours()
  return hour >= 23 || hour < 7
}

// A template's text with its values filled in: what the direct message says.
const filledBody = (template: TemplateDefinition, parameters: string[]) =>
  template.body.replace(
    /\{\{(\d+)\}\}/g,
    (_, index: string) => parameters[Number(index) - 1] ?? "—"
  )

interface InboundMessage {
  phoneNumberId: string
  from: string
  at: Date | null
  buttonId: string | null
}

// The messages people sent in one webhook event from Meta (a tap on a reply button is one too).
function inboundMessages(payload: unknown): InboundMessage[] {
  const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> })?.entry
  const found: InboundMessage[] = []
  for (const entry of entries ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value as
        | {
            metadata?: { phone_number_id?: string }
            messages?: Array<{
              from?: string
              timestamp?: string
              interactive?: { button_reply?: { id?: string } }
            }>
          }
        | undefined
      const phoneNumberId = value?.metadata?.phone_number_id
      if (!phoneNumberId) continue
      for (const message of value?.messages ?? []) {
        if (!message.from) continue
        const seconds = Number(message.timestamp)
        found.push({
          phoneNumberId,
          from: toWhatsAppNumber(message.from) ?? message.from,
          at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null,
          buttonId: message.interactive?.button_reply?.id ?? null,
        })
      }
    }
  }
  return found
}

export interface LeadAlertSendResult {
  sent: number
  failed: number
  // How many of the sent ones went as a direct message (no cap) rather than with a template.
  direct: number
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
      if (phones.length > 0) await this.send(phones, leadAlertParameters(lead), lead.kind)
    } catch (error) {
      console.error("whatsapp.lead_alert_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Madar Admin's "send a test alert": both alerts with sample values, errors surfaced.
  async sendTest(): Promise<LeadAlertSendResult> {
    const phones = await this.platform.leadAlertPhones()
    if (phones.length === 0) {
      throw new IdentityError(
        "LEAD_ALERT_NO_NUMBERS",
        400,
        "validation",
        "Save at least one number to alert first."
      )
    }
    const sample = ["مؤسسة تجريبية", "0500000000", "test@example.com", "تجربة"]
    const lead = await this.send(phones, ["رسالة تجريبية", ...sample], "website")
    const signup = await this.send(phones, ["رسالة تجريبية: حساب جديد", ...sample], "signup")
    return {
      sent: lead.sent + signup.sent,
      failed: lead.failed + signup.failed,
      direct: lead.direct + signup.direct,
    }
  }

  // Madar Admin: for each saved number, until when its alerts go out directly (null: with the
  // template, which Meta may hold back).
  async status(now = new Date()): Promise<{
    numbers: Array<{ phone: string; directUntil: string | null }>
  }> {
    const open = await this.openWindows(now)
    return {
      numbers: (await this.platform.leadAlertPhones()).map((phone) => {
        const lastReply = open.get(phone)
        return {
          phone,
          directUntil: lastReply
            ? new Date(lastReply.getTime() + DIRECT_WINDOW_MS).toISOString()
            : null,
        }
      }),
    }
  }

  // Meta's webhook: a team number wrote to Madar's number (or tapped a button), so it can be
  // messaged directly for the next 24 hours. Never throws -- the webhook must still answer Meta.
  async recordReplies(payload: unknown, now = new Date()): Promise<number> {
    const inbound = inboundMessages(payload)
    if (inbound.length === 0) return 0
    try {
      const phones = new Set(await this.platform.leadAlertPhones())
      if (phones.size === 0) return 0
      const context = await this.platform.sendingContext()
      let recorded = 0
      for (const message of inbound) {
        // Merchants' own numbers report to the same webhook; only Madar's number counts.
        if (message.phoneNumberId !== context.phoneNumberId || !phones.has(message.from)) continue
        // Meta counts from when the message was sent, and may deliver an event late.
        const at = message.at && message.at < now ? message.at : now
        const previous = await this.db.query<{ last_reply_at: Date | string }>(
          "SELECT last_reply_at FROM whatsapp_lead_alert_replies WHERE phone = $1",
          [message.from]
        )
        const before = previous.rows[0] ? new Date(previous.rows[0].last_reply_at) : null
        if (before && before >= at) continue
        await this.db.query(
          `INSERT INTO whatsapp_lead_alert_replies (phone, last_reply_at) VALUES ($1, $2::timestamptz)
           ON CONFLICT (phone) DO UPDATE SET last_reply_at = EXCLUDED.last_reply_at`,
          [message.from, at.toISOString()]
        )
        recorded += 1
        if (now.getTime() - at.getTime() >= DIRECT_WINDOW_MS) continue
        const wasOpen = before !== null && now.getTime() - before.getTime() < DIRECT_WINDOW_MS
        // Tells the number its tap or message worked; a tap on an alert's own button needs no
        // answer.
        const answer = !wasOpen
          ? "✅ تم تفعيل التنبيهات الفورية على هذا الرقم لمدة 24 ساعة.\nاضغط «تم الاستلام» على أي تنبيه يصلك لتجديدها."
          : message.buttonId === KEEP_BUTTON.id
            ? "✅ تم. التنبيهات الفورية مستمرة لمدة 24 ساعة."
            : null
        if (answer) {
          await sendDirectMessage(context.auth, context.phoneNumberId, {
            to: message.from,
            body: answer,
          }).catch((error: unknown) =>
            console.error("whatsapp.lead_alert_answer_failed", {
              message: error instanceof Error ? error.message : String(error),
            })
          )
        }
      }
      return recorded
    } catch (error) {
      console.error("whatsapp.lead_alert_reply_failed", {
        message: error instanceof Error ? error.message : String(error),
      })
      return 0
    }
  }

  // Every few minutes (server.ts): asks each number whose 24 hours are running out to tap a
  // button, once per window and never at night, so its alerts keep going out directly. Safe from
  // several tasks at once -- the reminder is claimed before it is sent.
  async remindDue(now = new Date()): Promise<number> {
    if (isQuietHour(now)) return 0
    const phones = new Set(await this.platform.leadAlertPhones())
    if (phones.size === 0) return 0
    const due = await this.db.query<{ phone: string }>(
      `SELECT phone FROM whatsapp_lead_alert_replies
        WHERE last_reply_at > $1::timestamptz AND last_reply_at <= $2::timestamptz
          AND (reminded_at IS NULL OR reminded_at < last_reply_at)`,
      [
        new Date(now.getTime() - DIRECT_WINDOW_MS).toISOString(),
        new Date(now.getTime() - REMIND_AFTER_MS).toISOString(),
      ]
    )
    let reminded = 0
    for (const { phone } of due.rows) {
      if (!phones.has(phone)) continue
      const claimed = await this.db.query<{ phone: string }>(
        `UPDATE whatsapp_lead_alert_replies SET reminded_at = $2::timestamptz
          WHERE phone = $1 AND (reminded_at IS NULL OR reminded_at < last_reply_at)
          RETURNING phone`,
        [phone, now.toISOString()]
      )
      if (claimed.rows.length === 0) continue
      const context = await this.platform.sendingContext()
      let waMessageId: string | null = null
      let error: string | null = null
      try {
        waMessageId = await sendDirectMessage(context.auth, context.phoneNumberId, {
          to: phone,
          body: "🔔 *تنبيهات مدار*\nاضغط الزر لتستمر تنبيهات العملاء الجدد بالوصول إليك فوراً خلال الـ24 ساعة القادمة.",
          button: KEEP_BUTTON,
        })
        reminded += 1
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught)
      }
      await this.record("lead_alert_reminder", phone, DIRECT, waMessageId, error)
    }
    return reminded
  }

  // The numbers that wrote to Madar's number recently enough to be messaged directly, and when.
  private async openWindows(now: Date): Promise<Map<string, Date>> {
    const result = await this.db.query<{ phone: string; last_reply_at: Date | string }>(
      "SELECT phone, last_reply_at FROM whatsapp_lead_alert_replies WHERE last_reply_at > $1::timestamptz",
      [new Date(now.getTime() - DIRECT_WINDOW_MS).toISOString()]
    )
    return new Map(result.rows.map((row) => [row.phone, new Date(row.last_reply_at)]))
  }

  // The template to send with. A sales request always goes out with the lead alert. A new account
  // has its own message; until Meta approves that one it goes out with the lead alert, as it did
  // before it had one, so the alerts don't stop in between.
  private async template(kind: LeadAlert["kind"]): Promise<TemplateDefinition> {
    if (kind === "signup") {
      try {
        await this.templates.requireApproved(SIGNUP_ALERT_TEMPLATE)
        return SIGNUP_ALERT_TEMPLATE
      } catch (notReady) {
        if (
          !(notReady instanceof IdentityError) ||
          notReady.code !== "WHATSAPP_TEMPLATE_NOT_READY"
        ) {
          throw notReady
        }
      }
    }
    await this.templates.requireApproved(LEAD_ALERT_TEMPLATE)
    return LEAD_ALERT_TEMPLATE
  }

  // A number that can be messaged directly gets the alert that way; the rest, and any direct send
  // Meta refuses, get the template. Each send is kept in whatsapp_messages (no organization: it's
  // Madar's own message).
  private async send(
    phones: string[],
    parameters: string[],
    kind: LeadAlert["kind"]
  ): Promise<LeadAlertSendResult> {
    const context = await this.platform.sendingContext()
    const open = await this.openWindows(new Date())
    const text = filledBody(
      kind === "signup" ? SIGNUP_ALERT_TEMPLATE : LEAD_ALERT_TEMPLATE,
      parameters
    )
    // Direct ones first: they need no template, so one Meta hasn't approved can't hold them up.
    const ordered = [
      ...phones.filter((phone) => open.has(phone)),
      ...phones.filter((phone) => !open.has(phone)),
    ]
    let template: TemplateDefinition | null = null
    const result: LeadAlertSendResult = { sent: 0, failed: 0, direct: 0 }
    for (const phone of ordered) {
      let waMessageId: string | null = null
      let error: string | null = null
      let sentWith = DIRECT
      if (open.has(phone)) {
        try {
          waMessageId = await sendDirectMessage(context.auth, context.phoneNumberId, {
            to: phone,
            body: text,
            button: RECEIVED_BUTTON,
          })
          result.direct += 1
        } catch {
          // Falls back to the template below.
        }
      }
      if (!waMessageId) {
        template ??= await this.template(kind)
        sentWith = template.name
        try {
          waMessageId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
            to: phone,
            templateName: template.name,
            language: template.language,
            bodyParameters: parameters,
          })
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught)
        }
      }
      if (waMessageId) result.sent += 1
      else result.failed += 1
      await this.record("lead_alert", phone, sentWith, waMessageId, error)
    }
    return result
  }

  private async record(
    kind: "lead_alert" | "lead_alert_reminder",
    phone: string,
    sentWith: string,
    waMessageId: string | null,
    error: string | null
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO whatsapp_messages
         (id, organization_id, kind, reference_id, to_phone, template_name, wa_message_id, status,
          error)
       VALUES ($1, NULL, $2, NULL, $3, $4, $5, $6, $7)`,
      [randomUUID(), kind, phone, sentWith, waMessageId, waMessageId ? "sent" : "failed", error]
    )
  }
}

// The instance the API server built, for the reminder timer in server.ts (see the daily report's
// registry for why).
let registered: WhatsAppLeadAlertsService | null = null
export const registerLeadAlertsService = (service: WhatsAppLeadAlertsService | null) => {
  registered = service
}
export const registeredLeadAlertsService = () => registered
