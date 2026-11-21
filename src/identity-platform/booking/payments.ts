import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { decryptSecret, encryptSecret } from "../whatsapp/platform-config"
import type { BookingService } from "./service"

// Paying for a booking online, through the business's own Moyasar account.
//
// The customer books on the public page and the booking waits, holding its time for a quarter
// of an hour. They pay on Moyasar's own form (the card never passes through Madar), and
// Moyasar sends them back with the payment's id. That id is only a claim: the payment is
// looked up at Moyasar with the business's secret key, and counts only if Moyasar itself says
// it is paid, in riyals, for at least what was due, and made for this very booking. Then the
// booking stands.
//
// A payment that arrives after the time was let go and taken by someone else is given back at
// once. The staff can give back any online payment from the booking.

type Row = Record<string, unknown>

const MOYASAR_API = "https://api.moyasar.com/v1"
interface MoyasarPayment {
  id?: string
  status?: string
  amount?: number
  currency?: string
  refunded?: number
  metadata?: Record<string, unknown> | null
  message?: string
}

const refuse = (code: string, message: string, status = 409) =>
  new IdentityError(code, status, "business", message)
const halalas = (amount: number) => Math.round(amount * 100)

export class BookingPayments {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly bookings: BookingService,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  private async call(
    secretKey: string,
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<{ status: number; body: MoyasarPayment }> {
    const response = await this.fetchFn(`${MOYASAR_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        // Moyasar's own way in: the secret key as the user name, with no password.
        authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
    const body = (await response.json().catch(() => ({}))) as MoyasarPayment
    return { status: response.status, body }
  }

  private async secretOf(organizationId: string): Promise<string> {
    const result = await this.db.query<Row>(
      `SELECT moyasar_secret_encrypted FROM booking_settings WHERE organization_id = $1`,
      [organizationId]
    )
    const stored = result.rows[0]?.moyasar_secret_encrypted
    if (!stored) throw refuse("BOOKING_PAYMENT_NOT_SET_UP", "Online payment is not set up.")
    return decryptSecret(String(stored))
  }

  // Saves the business's secret key, once Moyasar has accepted it. An empty key removes it,
  // which also switches online payment off.
  async saveSecretKey(organizationId: string, secretKey: string | null): Promise<void> {
    await this.bookings.getSettings(organizationId)
    const key = secretKey?.trim() ?? ""
    if (!key) {
      await this.db.query(
        `UPDATE booking_settings SET moyasar_secret_encrypted = NULL, payment_mode = 'off'
          WHERE organization_id = $1`,
        [organizationId]
      )
      return
    }
    if (!/^sk_(test|live)_/.test(key)) {
      throw refuse("BOOKING_PAYMENT_KEY_INVALID", "That is not a Moyasar secret key.", 422)
    }
    const check = await this.call(key, "/payments?per=1").catch(() => null)
    // Only a plain refusal counts against the key; Moyasar being out of reach does not.
    if (check && (check.status === 401 || check.status === 403)) {
      throw refuse("BOOKING_PAYMENT_KEY_REFUSED", "Moyasar did not accept that secret key.", 422)
    }
    await this.db.query(
      `UPDATE booking_settings SET moyasar_secret_encrypted = $2 WHERE organization_id = $1`,
      [organizationId, encryptSecret(key)]
    )
  }

  private async rowByToken(token: string): Promise<Row> {
    const result = await this.db.query<Row>(`SELECT * FROM bookings WHERE public_token = $1`, [
      token,
    ])
    if (!result.rows[0]) {
      throw new IdentityError("BOOKING_NOT_FOUND", 404, "business", "Booking not found.")
    }
    return result.rows[0]
  }

  private async giveBack(secretKey: string, paymentId: string, amount: number) {
    const refund = await this.call(secretKey, `/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: "POST",
      body: { amount: halalas(amount) },
    })
    if (refund.status >= 400) {
      throw refuse(
        "BOOKING_REFUND_REFUSED",
        String(refund.body.message ?? "Moyasar refused the refund.").slice(0, 300),
        422
      )
    }
  }

  // The customer is back from Moyasar's form with a payment id.
  async confirm(token: string, paymentId: string): Promise<{ outcome: "paid" | "refunded" }> {
    // Reading the booking first lets go of any booking whose time to pay has run out -- this
    // one included -- so a time given to someone else in the meantime is seen below.
    await this.bookings.publicBooking(token)
    const row = await this.rowByToken(token)
    const organizationId = String(row.organization_id)
    const bookingId = String(row.id)
    // Told twice about the same payment (a page reloaded): nothing more to do.
    if (row.moyasar_payment_id === paymentId) {
      return { outcome: Number(row.refunded_online) > 0 ? "refunded" : "paid" }
    }
    const due = Number(row.payment_due ?? 0)
    if (due <= 0 || Number(row.paid_online ?? 0) > 0) {
      throw refuse("BOOKING_PAYMENT_NOT_DUE", "This booking has nothing to pay online.")
    }
    const used = await this.db.query(`SELECT id FROM bookings WHERE moyasar_payment_id = $1`, [
      paymentId,
    ])
    if (used.rows.length > 0) {
      throw refuse("BOOKING_PAYMENT_INVALID", "That payment belongs to another booking.", 422)
    }

    const secretKey = await this.secretOf(organizationId)
    const { status, body: payment } = await this.call(
      secretKey,
      `/payments/${encodeURIComponent(paymentId)}`
    )
    const forThis = String(payment.metadata?.booking_id ?? "") === bookingId
    if (
      status !== 200 ||
      payment.status !== "paid" ||
      payment.currency !== "SAR" ||
      !forThis ||
      Number(payment.amount ?? 0) < halalas(due)
    ) {
      throw refuse("BOOKING_PAYMENT_INVALID", "The payment could not be confirmed.", 422)
    }
    const paid = Number(payment.amount) / 100

    // Its time was let go while the customer was paying. It is taken back if still free; if
    // someone else has it by now, the money goes straight back.
    if (row.status === "cancelled") {
      try {
        await this.bookings.setStatus(organizationId, bookingId, "pending", { by: "staff" })
      } catch {
        await this.giveBack(secretKey, paymentId, paid)
        await this.db.query(
          `UPDATE bookings SET moyasar_payment_id = $2, paid_online = $3, refunded_online = $3,
                  payment_expires_at = NULL, updated_at = now()
            WHERE id = $1`,
          [bookingId, paymentId, paid]
        )
        return { outcome: "refunded" }
      }
    }

    await this.db.query(
      `UPDATE bookings SET moyasar_payment_id = $2, paid_online = $3, payment_expires_at = NULL,
              payment_status = $4, payment_method = 'online', updated_at = now()
        WHERE id = $1`,
      [bookingId, paymentId, paid, paid >= Number(row.price) ? "paid" : "unpaid"]
    )
    // Paid for, the booking stands -- at once where the business confirms by itself.
    const settings = await this.bookings.getSettings(organizationId)
    if (settings.autoConfirm) {
      await this.bookings.setStatus(organizationId, bookingId, "confirmed", { by: "staff" })
    }
    return { outcome: "paid" }
  }

  // Gives back what a booking was paid online (the staff, from the booking).
  async refund(organizationId: string, bookingId: string) {
    const row = (
      await this.db.query<Row>(`SELECT * FROM bookings WHERE organization_id = $1 AND id = $2`, [
        organizationId,
        bookingId,
      ])
    ).rows[0]
    if (!row) throw new IdentityError("BOOKING_NOT_FOUND", 404, "business", "Booking not found.")
    const left = Math.round((Number(row.paid_online) - Number(row.refunded_online)) * 100) / 100
    if (!row.moyasar_payment_id || left <= 0) {
      throw refuse("BOOKING_REFUND_NOTHING", "Nothing was paid online for this booking.")
    }
    await this.giveBack(await this.secretOf(organizationId), String(row.moyasar_payment_id), left)
    await this.db.query(
      `UPDATE bookings SET refunded_online = paid_online, payment_status = 'unpaid',
              updated_at = now()
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, bookingId]
    )
    return this.bookings.getBooking(organizationId, bookingId)
  }
}
