// @vitest-environment node

// Paying for a booking online through the business's own Moyasar account (booking/payments.ts):
// what is asked for, that a payment only counts once Moyasar itself confirms it, what happens
// when the time to pay runs out, and giving money back.
import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BookingPayments } from "../booking/payments"
import { BookingService } from "../booking/service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

const ORG = "20000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"
const HOUR = 3600_000

interface Payment {
  status: string
  amount: number
  currency: string
  metadata: Record<string, string>
}

// Moyasar stood in for: the payments it knows, and the refunds it was asked for.
function fakeMoyasar() {
  const payments = new Map<string, Payment>()
  const refunds: Array<{ id: string; amount: number }> = []
  const seen: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const auth = new Headers(init?.headers).get("authorization") ?? ""
    const key = Buffer.from(auth.replace("Basic ", ""), "base64").toString("utf8").replace(":", "")
    seen.push(key)
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
    if (key !== "sk_test_good") return json({ message: "Invalid credentials" }, 401)
    const refund = url.pathname.match(/\/payments\/([^/]+)\/refund$/)
    if (refund) {
      refunds.push({ id: refund[1], amount: JSON.parse(String(init?.body)).amount })
      return json({ id: refund[1], status: "refunded" })
    }
    const one = url.pathname.match(/\/payments\/([^/]+)$/)
    if (one) {
      const payment = payments.get(one[1])
      return payment ? json({ id: one[1], ...payment }) : json({ message: "not found" }, 404)
    }
    return json({ payments: [] })
  }) as typeof fetch
  return { payments, refunds, seen, fetchImpl }
}

describe("paying for a booking online", () => {
  let database: PostgresDatabase
  let now: number
  let bookings: BookingService
  let payments: BookingPayments
  let moyasar: ReturnType<typeof fakeMoyasar>
  let serviceId: string
  let providerId: string

  beforeEach(async () => {
    process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
    await runIdentityMigrations(database, process.cwd())
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'o@x.com', 'h', 'Owner', now())`,
      [USER]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, settings)
       values ($1, 'صالون', $2, '{"bookingEnabled": true}'::jsonb)`,
      [ORG, USER]
    )
    now = Date.now()
    bookings = new BookingService(database, () => new Date(now))
    moyasar = fakeMoyasar()
    payments = new BookingPayments(database, bookings, moyasar.fetchImpl)
    serviceId = (
      await bookings.createService(ORG, {
        name: "مساج",
        durationMinutes: 60,
        price: 200,
        bufferMinutes: 0,
        capacity: 1,
        visibility: "published",
        isActive: true,
        options: [],
        addons: [],
        bundleServiceIds: [],
        resourceIds: [],
      })
    ).id
    providerId = (
      await bookings.createProvider(ORG, null, {
        name: "نورة",
        isActive: true,
        commissionRate: 0,
        serviceIds: [serviceId],
        // Every hour of every day, so any time in these tests is a working one.
        hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 0,
          endMinute: 1440,
        })),
      })
    ).id
    await bookings.updateSettings(ORG, { slug: "pay-spa", onlineEnabled: true, leadTimeMinutes: 0 })
  })

  afterEach(async () => {
    await database.end()
  })

  // A whole hour, a day or more ahead.
  const hourAhead = (hours: number) =>
    new Date(Math.ceil((now + hours * HOUR) / HOUR) * HOUR).toISOString()
  const bookOnline = (startsAt: string, phone = "0500000001") =>
    bookings.publicCreate("pay-spa", {
      serviceId,
      providerId,
      startsAt,
      customerName: "ريم",
      customerPhone: phone,
      partySize: 1,
    })
  const setUp = async (mode: "deposit" | "full") => {
    await payments.saveSecretKey(ORG, "sk_test_good")
    await bookings.updateSettings(ORG, {
      paymentMode: mode,
      depositPercent: 25,
      moyasarPublishableKey: "pk_test_abc123",
    })
  }
  const paid = (id: string, bookingId: string, amount: number, extra: Partial<Payment> = {}) =>
    moyasar.payments.set(id, {
      status: "paid",
      amount,
      currency: "SAR",
      metadata: { booking_id: bookingId },
      ...extra,
    })

  it("asks for payment only once both keys are in, and keeps the secret to itself", async () => {
    await expect(
      bookings.updateSettings(ORG, { paymentMode: "full", moyasarPublishableKey: "pk_test_abc123" })
    ).rejects.toMatchObject({ code: "BOOKING_PAYMENT_KEYS_REQUIRED" })
    await expect(payments.saveSecretKey(ORG, "not-a-key")).rejects.toMatchObject({
      code: "BOOKING_PAYMENT_KEY_INVALID",
    })
    // Moyasar itself refuses a key that is not real.
    await expect(payments.saveSecretKey(ORG, "sk_test_wrong")).rejects.toMatchObject({
      code: "BOOKING_PAYMENT_KEY_REFUSED",
    })
    await setUp("full")
    const settings = await bookings.getSettings(ORG)
    expect(settings).toMatchObject({ paymentMode: "full", moyasarSecretSet: true })
    expect(JSON.stringify(settings)).not.toContain("sk_test_good")
    const stored = await database.query<{ moyasar_secret_encrypted: string }>(
      `select moyasar_secret_encrypted from booking_settings where organization_id = $1`,
      [ORG]
    )
    expect(stored.rows[0].moyasar_secret_encrypted).not.toContain("sk_test_good")
    // Removing the key switches payment off.
    await payments.saveSecretKey(ORG, null)
    expect(await bookings.getSettings(ORG)).toMatchObject({
      paymentMode: "off",
      moyasarSecretSet: false,
    })
  })

  it("holds an online booking until it is paid, and counts only what Moyasar confirms", async () => {
    await setUp("deposit")
    const made = await bookOnline(hourAhead(30))
    // A quarter of the price is due; until then the booking waits and holds its time.
    expect(made.booking).toMatchObject({ status: "pending" })
    expect(made.booking.payment).toMatchObject({
      amount: 50,
      publishableKey: "pk_test_abc123",
      full: false,
    })
    const token = made.token
    const bookingId = made.booking.payment?.bookingId ?? ""
    await expect(bookOnline(hourAhead(30), "0500000002")).rejects.toMatchObject({
      code: "BOOKING_TIME_TAKEN",
    })

    // An id Moyasar does not know, a payment that failed, one too small, one made for another
    // booking, one in another currency: none of them counts.
    paid("pay_failed", bookingId, 5000, { status: "failed" })
    paid("pay_small", bookingId, 4000)
    paid("pay_other", "another-booking", 5000)
    paid("pay_usd", bookingId, 5000, { currency: "USD" })
    for (const id of ["pay_unknown", "pay_failed", "pay_small", "pay_other", "pay_usd"]) {
      await expect(payments.confirm(token, id)).rejects.toMatchObject({
        code: "BOOKING_PAYMENT_INVALID",
      })
    }
    expect((await bookings.publicBooking(token)).status).toBe("pending")

    paid("pay_good", bookingId, 5000)
    expect(await payments.confirm(token, "pay_good")).toEqual({ outcome: "paid" })
    // Told again (the page reloaded): the same answer, nothing done twice.
    expect(await payments.confirm(token, "pay_good")).toEqual({ outcome: "paid" })
    const after = await bookings.publicBooking(token)
    expect(after).toMatchObject({ status: "confirmed", payment: null, paidOnline: 50 })
    const staff = await bookings.getBooking(ORG, bookingId)
    // A deposit: confirmed, with the rest still to collect.
    expect(staff).toMatchObject({ paidOnline: 50, paymentStatus: "unpaid", price: 200 })
    // The same payment cannot pay for a second booking.
    const second = await bookOnline(hourAhead(40), "0500000003")
    await expect(payments.confirm(second.token, "pay_good")).rejects.toMatchObject({
      code: "BOOKING_PAYMENT_INVALID",
    })

    // The staff give the deposit back.
    const refunded = await payments.refund(ORG, bookingId)
    expect(refunded).toMatchObject({ refundedOnline: 50 })
    expect(moyasar.refunds).toEqual([{ id: "pay_good", amount: 5000 }])
    await expect(payments.refund(ORG, bookingId)).rejects.toMatchObject({
      code: "BOOKING_REFUND_NOTHING",
    })
  })

  it("lets go of an unpaid booking after its hold, and refunds a payment that comes too late", async () => {
    await setUp("full")
    // The same time for both, settled before the clock moves (moving it can cross an hour).
    const slot = hourAhead(30)
    const slow = await bookOnline(slot)
    const slowId = slow.booking.payment?.bookingId ?? ""
    expect(slow.booking.payment).toMatchObject({ amount: 200, full: true })

    // Sixteen minutes on: the time is free again and someone else takes and pays for it.
    now += 16 * 60_000
    const quick = await bookOnline(slot, "0500000002")
    expect((await bookings.getBooking(ORG, slowId)).status).toBe("cancelled")
    paid("pay_quick", quick.booking.payment?.bookingId ?? "", 20000)
    expect(await payments.confirm(quick.token, "pay_quick")).toEqual({ outcome: "paid" })
    expect((await bookings.publicBooking(quick.token)).status).toBe("confirmed")

    // The first customer's payment now arrives: the time is gone, so the money goes back.
    paid("pay_late", slowId, 20000)
    expect(await payments.confirm(slow.token, "pay_late")).toEqual({ outcome: "refunded" })
    expect(moyasar.refunds).toEqual([{ id: "pay_late", amount: 20000 }])
    expect(await bookings.getBooking(ORG, slowId)).toMatchObject({
      status: "cancelled",
      paidOnline: 200,
      refundedOnline: 200,
    })

    // A late payment whose time is still free brings the booking back instead.
    const alone = await bookOnline(hourAhead(50), "0500000004")
    const aloneId = alone.booking.payment?.bookingId ?? ""
    now += 16 * 60_000
    paid("pay_alone", aloneId, 20000)
    expect(await payments.confirm(alone.token, "pay_alone")).toEqual({ outcome: "paid" })
    expect(await bookings.getBooking(ORG, aloneId)).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
    })
  })

  it("asks nothing online of a booking the staff take, or of one that costs nothing", async () => {
    await setUp("full")
    const byStaff = await bookings.createBooking(
      ORG,
      {
        serviceId,
        providerId,
        startsAt: hourAhead(30),
        customerName: "هند",
        partySize: 1,
        force: false,
        addonIds: [],
      },
      { source: "staff", userId: null, workspaceId: null }
    )
    expect(byStaff).toMatchObject({ status: "confirmed", paymentDue: 0 })
    // A gift card that covers the whole price leaves nothing to pay.
    const gift = await bookings.extras.createGiftCard(ORG, { amount: 500 })
    const covered = await bookings.publicCreate("pay-spa", {
      serviceId,
      providerId,
      startsAt: hourAhead(40),
      customerName: "سارة",
      customerPhone: "0500000005",
      partySize: 1,
      giftCode: gift.code,
    })
    expect(covered.booking).toMatchObject({ status: "confirmed", payment: null })
  })
})
