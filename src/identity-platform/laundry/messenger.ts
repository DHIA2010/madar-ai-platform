import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { WhatsAppMerchantConnectionService } from "../whatsapp/merchant-connection"
import { sendTemplateMessage, type TemplateDefinition } from "../whatsapp/messaging"
import { toWhatsAppNumber } from "../whatsapp/phone"
import type { WhatsAppPlatformService, WhatsAppSendingContext } from "../whatsapp/platform-config"
import {
  LAUNDRY_READY_TEMPLATE,
  LAUNDRY_REMINDER_TEMPLATE,
  type WhatsAppTemplatesService,
} from "../whatsapp/templates"
import type { LaundryMessengerPort, LaundryOrderDetail } from "./service"

type Row = Record<string, unknown>

// The same ceiling the POS invoice and booking messages keep, counted across everything Madar's
// own number sends for one organization in a day.
const DAILY_MESSAGES_PER_ORGANIZATION = 200

// A template value can be neither empty nor hold a line break, and is kept short.
function param(value: string, max = 60): string {
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return "—"
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean
}

// Sends a laundry customer "your order is ready" and "still waiting to be collected" on
// WhatsApp: from the business's own number when it has connected one with the template
// approved, else from Madar's. Never fails the action that asked for it.
export class LaundryMessenger implements LaundryMessengerPort {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly merchantConnections: WhatsAppMerchantConnectionService | null
  ) {}

  private async sender(
    organizationId: string,
    template: TemplateDefinition
  ): Promise<{ context: WhatsAppSendingContext; own: boolean }> {
    const own = (await this.merchantConnections?.sendingContext(organizationId)) ?? null
    if (own) {
      try {
        await this.templates.requireApproved(template, own)
        return { context: own, own: true }
      } catch {
        // Not approved on the business's own number: Madar's number carries it instead.
      }
    }
    const context = await this.platform.sendingContext()
    await this.templates.requireApproved(template, context)
    return { context, own: false }
  }

  async send(
    organizationId: string,
    kind: "ready" | "reminder",
    order: LaundryOrderDetail
  ): Promise<"sent" | "no_phone" | "limit" | "failed"> {
    const to = order.customerPhone ? toWhatsAppNumber(order.customerPhone) : null
    if (!to) return "no_phone"
    const template = kind === "ready" ? LAUNDRY_READY_TEMPLATE : LAUNDRY_REMINDER_TEMPLATE
    let wamid: string | null = null
    let error: string | null = null
    try {
      const { context, own } = await this.sender(organizationId, template)
      if (!own) {
        const sent = await this.db.query<Row>(
          `SELECT id FROM whatsapp_messages WHERE organization_id = $1 AND created_at > $2`,
          [organizationId, new Date(Date.now() - 86_400_000).toISOString()]
        )
        if (sent.rows.length >= DAILY_MESSAGES_PER_ORGANIZATION) return "limit"
      }
      const business = await this.db.query<Row>(`SELECT name FROM organizations WHERE id = $1`, [
        organizationId,
      ])
      const due = order.due > 0 ? `${order.due.toFixed(2)} ر.س` : "لا يوجد"
      const days = order.readyAt
        ? Math.max(1, Math.floor((Date.now() - new Date(order.readyAt).getTime()) / 86_400_000))
        : 1
      wamid = await sendTemplateMessage(context.auth, context.phoneNumberId, {
        to,
        templateName: template.name,
        language: template.language,
        bodyParameters:
          kind === "ready"
            ? [
                param(order.customerName ?? "عميلنا", 40),
                param(order.orderNumber, 20),
                param(String(business.rows[0]?.name ?? ""), 50),
                String(order.pieces),
                param(due, 20),
              ]
            : [
                param(order.customerName ?? "عميلنا", 40),
                param(order.orderNumber, 20),
                param(String(business.rows[0]?.name ?? ""), 50),
                String(days),
                param(due, 20),
              ],
      })
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 500) : String(caught)
    }
    await this.db
      .query(
        `INSERT INTO whatsapp_messages
           (id, organization_id, kind, reference_id, to_phone, template_name, wa_message_id,
            status, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          organizationId,
          kind === "ready" ? "laundry_ready" : "laundry_reminder",
          order.id,
          to,
          template.name,
          wamid,
          wamid ? "sent" : "failed",
          error,
        ]
      )
      .catch((logError: unknown) => console.error("laundry.message_log_failed", logError))
    return wamid ? "sent" : "failed"
  }
}
