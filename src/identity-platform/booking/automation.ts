import { randomBytes, randomUUID } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PosInvoicesService } from "../pos/invoices-service"
import type { PosPaymentMethodsService } from "../pos/payment-methods-service"
import type { TaxRatesService } from "../tax/tax-rates-service"
import { invoiceLinkToken } from "../whatsapp/invoice-links"
import type { WhatsAppMerchantConnectionService } from "../whatsapp/merchant-connection"
import { sendTemplateMessage, type TemplateDefinition } from "../whatsapp/messaging"
import { toWhatsAppNumber } from "../whatsapp/phone"
import type { WhatsAppPlatformService, WhatsAppSendingContext } from "../whatsapp/platform-config"
import {
  BOOKING_CONFIRMATION_TEMPLATE,
  BOOKING_REMINDER_TEMPLATE,
  type WhatsAppTemplatesService,
} from "../whatsapp/templates"
import { type BookingService, type BookingView, dayOf } from "./service"

// What the Booking app does on its own, once a business switches it on in its booking settings:
//   - WhatsApp: a confirmation when a booking is confirmed, and a reminder some hours before it.
//   - An invoice: a simplified tax invoice (through the POS invoices, so it is numbered, carries
//     the QR and is reported to ZATCA like any sale) when a visit is finished.
//   - A calendar feed: the bookings as calendar events, for Google, Apple or Outlook calendars.
// None of it may fail a booking: every send and every invoice is tried, logged and left.

type Row = Record<string, unknown>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
// The same ceiling the POS invoice messages keep, counted across everything Madar's own number
// sends for one organization in a day.
const DAILY_MESSAGES_PER_ORGANIZATION = 200

const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.madar.my").replace(
    /\/$/,
    ""
  )

// A template value can be neither empty nor hold a line break, and is kept short.
function param(value: string, max = 60): string {
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return "—"
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean
}

const riyadh = (instant: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
    timeZone: "Asia/Riyadh",
    ...options,
  }).format(new Date(instant))

// ---- WhatsApp ----

type MessageKind = "booking_confirmation" | "booking_reminder"

export class BookingMessenger {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly bookings: BookingService,
    private readonly platform: WhatsAppPlatformService,
    private readonly templates: WhatsAppTemplatesService,
    private readonly merchantConnections: WhatsAppMerchantConnectionService | null
  ) {}

  // The number a message goes from: the business's own, when it has connected one and the
  // template is approved there; otherwise Madar's (with the business named in the message).
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

  private async businessName(organizationId: string): Promise<string> {
    const settings = await this.bookings.getSettings(organizationId)
    if (settings.displayName) return settings.displayName
    const result = await this.db.query<Row>(`SELECT name FROM organizations WHERE id = $1`, [
      organizationId,
    ])
    return String(result.rows[0]?.name ?? "")
  }

  // Sends one message about one booking and records it. Returns why it was not sent, if not.
  private async send(
    organizationId: string,
    booking: BookingView,
    kind: MessageKind
  ): Promise<"sent" | "no_phone" | "limit" | "failed"> {
    const to = booking.customerPhone ? toWhatsAppNumber(booking.customerPhone) : null
    if (!to) return "no_phone"
    const template =
      kind === "booking_confirmation" ? BOOKING_CONFIRMATION_TEMPLATE : BOOKING_REMINDER_TEMPLATE
    let wamid: string | null = null
    let error: string | null = null
    try {
      const { context, own } = await this.sender(organizationId, template)
      if (!own) {
        const sent = await this.db.query<Row>(
          `SELECT id FROM whatsapp_messages WHERE organization_id = $1 AND created_at > $2`,
          [organizationId, new Date(Date.now() - 24 * HOUR).toISOString()]
        )
        if (sent.rows.length >= DAILY_MESSAGES_PER_ORGANIZATION) return "limit"
      }
      wamid = await sendTemplateMessage(context.auth, context.phoneNumberId, {
        to,
        templateName: template.name,
        language: template.language,
        bodyParameters: [
          param(booking.customerName, 40),
          param(await this.businessName(organizationId), 50),
          param(booking.serviceName, 50),
          param(riyadh(booking.startsAt, { weekday: "long", day: "numeric", month: "long" }), 40),
          param(riyadh(booking.startsAt, { hour: "numeric", minute: "2-digit", hour12: true }), 20),
          `${appUrl()}/bk/${booking.publicToken}`,
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
          kind,
          booking.id,
          to,
          template.name,
          wamid,
          wamid ? "sent" : "failed",
          error,
        ]
      )
      .catch((logError: unknown) => console.error("booking.message_log_failed", logError))
    if (!wamid) console.error("booking.message_failed", { kind, bookingId: booking.id, error })
    return wamid ? "sent" : "failed"
  }

  // A confirmed booking's confirmation, sent once. Claimed before sending, so two requests (or
  // two server tasks) never send it twice.
  async confirm(organizationId: string, bookingId: string): Promise<void> {
    const settings = await this.bookings.getSettings(organizationId)
    if (!settings.whatsappConfirmation) return
    const claimed = await this.db.query(
      `UPDATE bookings SET confirmation_sent_at = now()
        WHERE organization_id = $1 AND id = $2 AND confirmation_sent_at IS NULL
          AND status = 'confirmed' RETURNING id`,
      [organizationId, bookingId]
    )
    if (claimed.rows.length === 0) return
    const booking = await this.bookings.getBooking(organizationId, bookingId)
    // A booking already under way or past needs no confirmation.
    if (new Date(booking.startsAt).getTime() <= Date.now()) return
    await this.send(organizationId, booking, "booking_confirmation")
  }

  // The reminders that have come due: confirmed bookings whose start is inside the business's
  // reminder window, and that were made before that window opened (one made inside it has just
  // had its confirmation). Run every few minutes by the server.
  async runDue(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
    const businesses = await this.db.query<Row>(
      `SELECT organization_id, reminder_hours_before FROM booking_settings
        WHERE whatsapp_reminder = true`
    )
    let sent = 0
    let skipped = 0
    for (const business of businesses.rows) {
      const organizationId = String(business.organization_id)
      const window = Number(business.reminder_hours_before) * HOUR
      try {
        const due = await this.db.query<Row>(
          `SELECT id, created_at, starts_at FROM bookings
            WHERE organization_id = $1 AND status = 'confirmed' AND reminder_sent_at IS NULL
              AND starts_at > $2 AND starts_at <= $3`,
          [
            organizationId,
            // Nothing that starts within the next quarter of an hour: too late to be of use.
            new Date(now.getTime() + 15 * MINUTE).toISOString(),
            new Date(now.getTime() + window).toISOString(),
          ]
        )
        for (const row of due.rows) {
          const claimed = await this.db.query(
            `UPDATE bookings SET reminder_sent_at = now()
              WHERE id = $1 AND reminder_sent_at IS NULL RETURNING id`,
            [row.id]
          )
          if (claimed.rows.length === 0) continue
          const madeAt = new Date(String(row.created_at)).getTime()
          const startsAt = new Date(String(row.starts_at)).getTime()
          if (madeAt > startsAt - window) {
            skipped += 1
            continue
          }
          const booking = await this.bookings.getBooking(organizationId, String(row.id))
          const outcome = await this.send(organizationId, booking, "booking_reminder")
          if (outcome === "sent") sent += 1
          else skipped += 1
        }
      } catch (error) {
        console.error("booking.reminder_pass_failed", { organizationId, error })
      }
    }
    return { sent, skipped }
  }
}

let registeredMessenger: BookingMessenger | null = null
export const registerBookingMessenger = (messenger: BookingMessenger | null) => {
  registeredMessenger = messenger
}
export const registeredBookingMessenger = () => registeredMessenger

// ---- The invoice for a finished visit ----

export class BookingInvoicer {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly bookings: BookingService,
    private readonly invoices: PosInvoicesService,
    private readonly paymentMethods: PosPaymentMethodsService,
    private readonly taxRates: TaxRatesService
  ) {}

  // The branch the invoice is issued from: the booking's, else the organization's first.
  private async workspaceOf(organizationId: string, row: Row): Promise<string | null> {
    if (row.workspace_id) return String(row.workspace_id)
    const first = await this.db.query<Row>(
      `SELECT id FROM workspaces WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    )
    return first.rows[0] ? String(first.rows[0].id) : null
  }

  // Issues the visit's tax invoice, once. The booking's prices are what the customer pays, tax
  // included, so the line goes in at its price before tax and the invoice's total comes back to
  // the same figure. A visit covered by a package has nothing to invoice here (the package was
  // paid for when it was bought), and neither has one that cost nothing.
  async issue(organizationId: string, bookingId: string, userId: string | null) {
    const row = (
      await this.db.query<Row>(`SELECT * FROM bookings WHERE organization_id = $1 AND id = $2`, [
        organizationId,
        bookingId,
      ])
    ).rows[0]
    if (!row) throw new IdentityError("BOOKING_NOT_FOUND", 404, "business", "Booking not found.")
    const refuse = (code: string, message: string) =>
      new IdentityError(code, 409, "business", message)
    if (row.invoice_id) return this.bookings.getBooking(organizationId, bookingId)
    if (row.status !== "completed") {
      throw refuse("BOOKING_INVOICE_NOT_FINISHED", "Only a finished visit can be invoiced.")
    }
    const booking = await this.bookings.getBooking(organizationId, bookingId)
    // What the visit was sold for: a gift card is a way of paying, not a discount.
    const total =
      Math.round((booking.subtotal - booking.discount - booking.loyaltyDiscount) * 100) / 100
    if (booking.customerPlanId || total <= 0) {
      throw refuse("BOOKING_INVOICE_NOTHING", "This visit has nothing to invoice.")
    }
    const workspaceId = await this.workspaceOf(organizationId, row)
    if (!workspaceId) {
      throw refuse("BOOKING_INVOICE_NO_BRANCH", "The organization has no branch to invoice from.")
    }

    const organization = await this.db.query<Row>(
      `SELECT settings FROM organizations WHERE id = $1`,
      [organizationId]
    )
    const raw = organization.rows[0]?.settings
    const settings = (typeof raw === "string" ? JSON.parse(raw) : (raw ?? {})) as Row
    // The organization's tax rate as a fraction (0.15), the unit the invoices themselves use.
    const rate =
      settings.taxAutoApplyToProducts === false
        ? 0
        : await this.taxRates.getDefaultRatePercent(organizationId)

    const methods = (await this.paymentMethods.list(organizationId, workspaceId)).filter(
      (method) => method.enabled
    )
    // The way it was paid, when the staff recorded one the branch accepts; otherwise cash, or
    // the branch's first ordinary method. Credit and wallet need an account, so never those.
    const ordinary = methods.filter(
      (method) => !["customer_credit", "customer_wallet"].includes(method.code)
    )
    const method =
      ordinary.find((entry) => entry.code === booking.paymentMethod) ??
      ordinary.find((entry) => entry.code === "cash") ??
      ordinary[0]
    if (!method) {
      throw refuse("BOOKING_INVOICE_NO_PAYMENT_METHOD", "The branch has no payment method.")
    }

    const invoice = await this.invoices.create({
      organizationId,
      workspaceId,
      cashierUserId: userId,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      customerId: booking.customerId,
      payments: [{ paymentMethodCode: method.code, amount: total }],
      discountAmount: 0,
      notes: `حجز رقم ${booking.number}`,
      notesLines: null,
      items: [
        {
          productId: null,
          productName: [
            booking.serviceName,
            booking.optionName,
            booking.partySize > 1 ? `× ${booking.partySize}` : null,
          ]
            .filter(Boolean)
            .join(" - ")
            .slice(0, 200),
          unitPrice: total / (1 + rate),
          quantity: 1,
        },
      ],
      // One invoice per booking, however many times this is asked for.
      idempotencyKey: `booking:${booking.id}`,
    })
    await this.db.query(
      `UPDATE bookings SET invoice_id = $3, invoice_number = $4, payment_status = 'paid',
              payment_method = $5, updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, bookingId, invoice.id, invoice.invoiceNumber, method.code]
    )
    return this.bookings.getBooking(organizationId, bookingId)
  }

  // The invoice's own link (its PDF), for the staff to open or send.
  linkFor(invoiceId: string): string {
    return `${appUrl()}/i/${invoiceLinkToken(invoiceId)}`
  }
}

// ---- The calendar feed ----

const stamp = (instant: string | Date) =>
  new Date(instant)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (match) => `\\${match}`)

// The address of a business's calendar feed: made the first time it is asked for, and made anew
// (which closes the old address) when asked to.
export async function bookingCalendarToken(
  db: PostgresDatabase,
  bookings: BookingService,
  organizationId: string,
  renew = false
): Promise<string> {
  const settings = await bookings.getSettings(organizationId)
  if (settings.calendarToken && !renew) return settings.calendarToken
  const token = randomBytes(24).toString("base64url")
  await db.query(`UPDATE booking_settings SET calendar_token = $2 WHERE organization_id = $1`, [
    organizationId,
    token,
  ])
  return token
}

// The feed itself: bookings from a month back to half a year ahead, cancelled ones left out,
// for the whole business or one provider.
export async function bookingCalendarFeed(
  db: PostgresDatabase,
  bookings: BookingService,
  token: string,
  providerId: string | null,
  now: Date = new Date()
): Promise<string | null> {
  const found = await db.query<Row>(
    `SELECT organization_id, display_name FROM booking_settings WHERE calendar_token = $1`,
    [token]
  )
  const row = found.rows[0]
  if (!row) return null
  const organizationId = String(row.organization_id)
  const list = await bookings.listBookings(organizationId, {
    from: dayOf(now.getTime() - 30 * 24 * HOUR),
    to: dayOf(now.getTime() + 180 * 24 * HOUR),
    providerId: providerId ?? undefined,
  })
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Madar//Booking//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(String(row.display_name ?? "الحجوزات"))}`,
    "X-PUBLISHED-TTL:PT15M",
  ]
  for (const booking of list) {
    if (booking.status === "cancelled") continue
    lines.push(
      "BEGIN:VEVENT",
      `UID:${booking.id}@madar.my`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(booking.startsAt)}`,
      `DTEND:${stamp(booking.endsAt)}`,
      `SUMMARY:${escapeText(`${booking.customerName} - ${booking.serviceName}`)}`,
      `DESCRIPTION:${escapeText(
        [
          booking.providerName,
          booking.customerPhone,
          booking.optionName,
          booking.notes,
          `#${booking.number}`,
        ]
          .filter(Boolean)
          .join("\n")
      )}`,
      `STATUS:${booking.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT"
    )
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}
