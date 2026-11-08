import { randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { renderInvoicePdf } from "../pdf/invoice-pdf"
import type { InvoiceView, PosInvoicesService } from "../pos/invoices-service"
import type { PosPaymentMethodsService } from "../pos/payment-methods-service"
import type { PosSettingsService } from "../pos/pos-settings-service"
import { sendTemplateMessage, uploadMedia } from "./messaging"
import type { WhatsAppPlatformService } from "./platform-config"
import { POS_INVOICE_TEMPLATE, type WhatsAppTemplatesService } from "./templates"

// Sends a POS sale's receipt to the customer on WhatsApp, as a PDF, from Madar's own number (with
// the store's name in the message) until merchants connect their own numbers. Every send is kept
// in whatsapp_messages; Meta's webhook then moves it to delivered / read / failed.

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed"

export interface WhatsAppMessageView {
  id: string
  toPhone: string
  status: WhatsAppMessageStatus
  error: string | null
  createdAt: string
  updatedAt: string
}

// Madar pays for these messages and its number has a daily cap, so one store can't use it all.
export const DAILY_INVOICE_MESSAGES_PER_ORGANIZATION = 200

const STATUS_RANK: Record<WhatsAppMessageStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
}

// A phone number in the international form WhatsApp wants (digits only, country code first).
// Saudi local forms (05XXXXXXXX, 5XXXXXXXX) become 9665XXXXXXXX. Null when it can't be one.
export function toWhatsAppNumber(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`
  if (digits.startsWith("9660")) digits = `966${digits.slice(4)}`
  if (digits.startsWith("966") && !/^9665\d{8}$/.test(digits)) return null
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

const toIso = (value: Date | string) =>
  (value instanceof Date ? value : new Date(value)).toISOString()

export class WhatsAppInvoiceSender {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly invoices: PosInvoicesService,
    private readonly paymentMethods: PosPaymentMethodsService,
    // Optional: the receipt title/description printed on the receipt (POS settings).
    private readonly posSettings: PosSettingsService | null = null
  ) {}

  // The store's current logo, as on the printed receipt -- PNG or JPEG only (what a PDF embeds);
  // anything else, or a slow or failed download, just leaves the logo out.
  private async logo(
    organizationId: string
  ): Promise<{ bytes: Buffer; format: "PNG" | "JPEG" } | null> {
    const result = await this.database.query<{ logo_url: string | null }>(
      "SELECT logo_url FROM organizations WHERE id = $1",
      [organizationId]
    )
    const url = result.rows[0]?.logo_url
    if (!url || !/^https:\/\//.test(url)) return null
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return null
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 5_000_000) return null
      if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return { bytes, format: "PNG" }
      }
      if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, format: "JPEG" }
      return null
    } catch {
      return null
    }
  }

  // The sale's receipt as a PDF, laid out exactly like the printed POS receipt.
  async renderPdf(
    organizationId: string,
    invoice: InvoiceView
  ): Promise<{ pdf: Buffer; filename: string; storeName: string }> {
    const methods = await this.paymentMethods.list(organizationId, invoice.workspaceId)
    const methodName = new Map(methods.map((method) => [method.code, method.name]))
    const storeName = invoice.sellerName?.trim() || "متجرنا"
    const settings = this.posSettings
      ? await this.posSettings.get(organizationId, invoice.workspaceId).catch(() => null)
      : null
    const pdf = renderInvoicePdf({
      logo: await this.logo(organizationId),
      receiptTitleLines: settings?.showReceiptTitle ? settings.receiptTitleLines : null,
      receiptDescriptionLines: settings?.showReceiptTitle ? settings.receiptDescriptionLines : null,
      notesLines: invoice.notesLines,
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
      createdAt: invoice.createdAt,
      sellerName: invoice.sellerName,
      sellerVatNumber: invoice.sellerVatNumber,
      sellerAddress: invoice.sellerAddress,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      customerVatNumber: invoice.customerVatNumber,
      salesPersonName: invoice.salesPersonName,
      items: invoice.items.map((item) => ({
        productName: item.productName,
        promotionName: item.promotionName,
        quantity: item.quantity,
        netAmount: item.netAmount,
        taxAmount: item.taxAmount,
      })),
      subtotalAmount: invoice.subtotalAmount,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      payments: invoice.payments.map((payment) => ({
        label: methodName.get(payment.paymentMethodCode) ?? payment.paymentMethodCode,
        amount: payment.amount,
      })),
      qrCode: invoice.qrCode,
      notes: invoice.notes,
    })
    return { pdf, filename: `${invoice.invoiceNumber}.pdf`, storeName }
  }

  // The same PDF for an invoice found by id alone (the public link checks its signature first).
  async renderPdfById(invoiceId: string): Promise<{ pdf: Buffer; filename: string } | null> {
    const owner = await this.database.query<{ organization_id: string }>(
      "SELECT organization_id FROM pos_invoices WHERE id = $1",
      [invoiceId]
    )
    const organizationId = owner.rows[0]?.organization_id
    if (!organizationId) return null
    const invoice = await this.invoices.get(organizationId, invoiceId)
    if (!invoice) return null
    const { pdf, filename } = await this.renderPdf(organizationId, invoice)
    return { pdf, filename }
  }

  async listSends(organizationId: string, invoiceId: string): Promise<WhatsAppMessageView[]> {
    const result = await this.database.query<{
      id: string
      to_phone: string
      status: WhatsAppMessageStatus
      error: string | null
      created_at: Date | string
      updated_at: Date | string
    }>(
      `SELECT id, to_phone, status, error, created_at, updated_at FROM whatsapp_messages
        WHERE organization_id = $1 AND kind = 'pos_invoice' AND reference_id = $2
        ORDER BY created_at DESC`,
      [organizationId, invoiceId]
    )
    return result.rows.map((row) => ({
      id: row.id,
      toPhone: row.to_phone,
      status: row.status,
      error: row.error,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }))
  }

  async sendInvoice(input: {
    organizationId: string
    invoiceId: string
    phone: string
    actorUserId: string | null
  }): Promise<WhatsAppMessageView> {
    const to = toWhatsAppNumber(input.phone)
    if (!to) {
      throw new IdentityError(
        "WHATSAPP_INVALID_PHONE",
        400,
        "validation",
        "Enter a valid mobile number, e.g. 05XXXXXXXX or +9665XXXXXXXX."
      )
    }
    const invoice = await this.invoices.get(input.organizationId, input.invoiceId)
    if (!invoice)
      throw new IdentityError("POS_INVOICE_NOT_FOUND", 404, "business", "Invoice not found.")

    const since = new Date(Date.now() - 24 * 60 * 60_000)
    const sentToday = await this.database.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM whatsapp_messages
        WHERE organization_id = $1 AND created_at > $2`,
      [input.organizationId, since]
    )
    if (Number(sentToday.rows[0]?.count ?? 0) >= DAILY_INVOICE_MESSAGES_PER_ORGANIZATION) {
      throw new IdentityError(
        "WHATSAPP_DAILY_LIMIT",
        429,
        "business",
        `WhatsApp invoices are limited to ${DAILY_INVOICE_MESSAGES_PER_ORGANIZATION} a day per store.`
      )
    }

    await this.templates.requireApproved(POS_INVOICE_TEMPLATE)
    const context = await this.platform.sendingContext()

    const { pdf, filename, storeName } = await this.renderPdf(input.organizationId, invoice)

    const id = randomUUID()
    let waMessageId: string | null = null
    let error: string | null = null
    try {
      const mediaId = await uploadMedia(context.auth, context.phoneNumberId, {
        bytes: pdf,
        mimeType: "application/pdf",
        filename,
      })
      waMessageId = await sendTemplateMessage(context.auth, context.phoneNumberId, {
        to,
        templateName: POS_INVOICE_TEMPLATE.name,
        language: POS_INVOICE_TEMPLATE.language,
        document: { mediaId, filename },
        bodyParameters: [
          invoice.customerName?.trim() || "عميلنا العزيز",
          storeName,
          invoice.invoiceNumber,
          `${invoice.totalAmount.toFixed(2)} ر.س`,
        ],
      })
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }

    await this.database.query(
      `INSERT INTO whatsapp_messages
         (id, organization_id, kind, reference_id, to_phone, template_name, wa_message_id, status,
          error, created_by)
       VALUES ($1, $2, 'pos_invoice', $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        input.organizationId,
        input.invoiceId,
        to,
        POS_INVOICE_TEMPLATE.name,
        waMessageId,
        waMessageId ? "sent" : "failed",
        error,
        input.actorUserId,
      ]
    )
    if (!waMessageId) {
      throw new IdentityError("WHATSAPP_REJECTED", 422, "business", error ?? "Not sent.")
    }
    const [view] = (await this.listSends(input.organizationId, input.invoiceId)).filter(
      (message) => message.id === id
    )
    return view
  }
}

// Meta's webhook statuses (sent / delivered / read / failed) onto the messages Madar sent. A status
// only moves forward (a late "delivered" never undoes "read"); "failed" keeps Meta's reason.
export async function applyWhatsAppStatuses(
  database: PostgresDatabase,
  payload: unknown
): Promise<number> {
  const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> })?.entry
  let updated = 0
  for (const entry of entries ?? []) {
    for (const change of entry.changes ?? []) {
      const statuses = (
        change.value as {
          statuses?: Array<{
            id?: string
            status?: string
            errors?: Array<{ title?: string; message?: string; error_data?: { details?: string } }>
          }>
        }
      )?.statuses
      for (const status of statuses ?? []) {
        if (!status.id || !status.status || !(status.status in STATUS_RANK)) continue
        const next = status.status as WhatsAppMessageStatus
        const current = await database.query<{ status: WhatsAppMessageStatus }>(
          "SELECT status FROM whatsapp_messages WHERE wa_message_id = $1",
          [status.id]
        )
        const row = current.rows[0]
        if (!row || STATUS_RANK[next] <= STATUS_RANK[row.status]) continue
        const reason =
          next === "failed"
            ? (status.errors?.[0]?.error_data?.details ??
              status.errors?.[0]?.message ??
              status.errors?.[0]?.title ??
              "Not delivered.")
            : null
        await database.query(
          `UPDATE whatsapp_messages SET status = $2, error = COALESCE($3, error), updated_at = now()
            WHERE wa_message_id = $1`,
          [status.id, next, reason]
        )
        updated += 1
      }
    }
  }
  return updated
}
