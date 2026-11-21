// The customer's own side of a business's booking page, and who is told what.
//
// An account belongs to the browser it was made on: the first booking (or waiting-list request)
// from a phone makes one and hands that browser its secret, and everything booked from there
// afterwards is listed under it. A phone number that was merely typed opens nothing -- there is
// no message sent to prove whose number it is, so the secret is the only key.
//
// The same events feed two places: the staff's notification bell (a booking made online, a
// customer cancelling, someone joining the waiting list) and the customer's account (a booking
// confirmed, moved or cancelled by the business, a place found from the waiting list).

import { randomBytes, randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { notify } from "../notifications/service"
import { BOOKING_ERRORS, type BookingEvent, type BookingService } from "./service"

type Row = Record<string, unknown>

export type AccountNoticeKind =
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "waitlist_booked"
  | "waitlist_removed"

const RIYADH_OFFSET_MS = 3 * 60 * 60_000
// How long after a waiting-list entry is marked booked the booking made for it is looked for.
const WAITLIST_LINK_WINDOW_MS = 30 * 60_000

// A time as the bell shows it: day/month and the 24-hour clock, on the business's clock.
const when = (instant: string) => {
  const local = new Date(new Date(instant).getTime() + RIYADH_OFFSET_MS).toISOString()
  return `${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11, 16)}`
}
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
const day = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

export class BookingAccounts {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly bookings: BookingService,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ---- Accounts ----

  // The account behind a browser's secret on this business's page, or a new one.
  private async ensure(
    organizationId: string,
    token: string | null | undefined,
    person: { name: string; phone: string | null }
  ): Promise<{ id: string; token: string }> {
    if (token) {
      const found = await this.db.query<Row>(
        `SELECT id, token FROM booking_accounts WHERE token = $1 AND organization_id = $2`,
        [token, organizationId]
      )
      if (found.rows[0]) {
        await this.db.query(
          `UPDATE booking_accounts SET name = $2, phone = $3, last_seen_at = $4 WHERE id = $1`,
          [found.rows[0].id, person.name, person.phone, this.now()]
        )
        return { id: String(found.rows[0].id), token: String(found.rows[0].token) }
      }
    }
    const id = randomUUID()
    const secret = randomBytes(24).toString("hex")
    await this.db.query(
      `INSERT INTO booking_accounts (id, organization_id, token, name, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, organizationId, secret, person.name, person.phone]
    )
    return { id, token: secret }
  }

  // A booking made from the public page, put under the browser's account.
  async book(
    slug: string,
    input: Parameters<BookingService["publicCreate"]>[1] & { accountToken?: string | null }
  ) {
    const { accountToken, ...booking } = input
    const made = await this.bookings.publicCreate(slug, booking)
    const row = await this.db.query<Row>(
      `SELECT id, organization_id FROM bookings WHERE public_token = $1`,
      [made.token]
    )
    if (!row.rows[0]) return { ...made, accountToken: null }
    const account = await this.ensure(String(row.rows[0].organization_id), accountToken, {
      name: input.customerName,
      phone: input.customerPhone,
    })
    await this.db.query(`UPDATE bookings SET account_id = $2 WHERE id = $1`, [
      row.rows[0].id,
      account.id,
    ])
    return { ...made, accountToken: account.token }
  }

  // A waiting-list request from the public page, put under the browser's account. A request
  // that was already there for that phone stays with whoever made it first.
  async joinWaitlist(
    slug: string,
    input: Parameters<BookingService["publicJoinWaitlist"]>[1] & { accountToken?: string | null }
  ) {
    const { accountToken, ...request } = input
    const made = await this.bookings.publicJoinWaitlist(slug, request)
    const row = await this.db.query<Row>(
      `SELECT id, organization_id, account_id FROM booking_waitlist WHERE id = $1`,
      [made.id]
    )
    if (!row.rows[0]) return { ...made, accountToken: null }
    const account = await this.ensure(String(row.rows[0].organization_id), accountToken, {
      name: input.customerName,
      phone: input.customerPhone,
    })
    if (!row.rows[0].account_id) {
      await this.db.query(`UPDATE booking_waitlist SET account_id = $2 WHERE id = $1`, [
        made.id,
        account.id,
      ])
    }
    return { ...made, accountToken: account.token }
  }

  private async accountRow(slug: string, token: string): Promise<Row> {
    const found = await this.db.query<Row>(
      `SELECT a.* FROM booking_accounts a
         JOIN booking_settings s ON s.organization_id = a.organization_id
        WHERE a.token = $1 AND s.slug = $2`,
      [token, slug.trim().toLowerCase()]
    )
    if (!found.rows[0]) throw BOOKING_ERRORS.notFound("Account")
    return found.rows[0]
  }

  private async notices(accountId: string) {
    const result = await this.db.query<Row>(
      `SELECT * FROM booking_account_notices WHERE account_id = $1
        ORDER BY created_at DESC LIMIT 30`,
      [accountId]
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      kind: String(row.kind) as AccountNoticeKind,
      params: (typeof row.params === "string" ? JSON.parse(row.params) : (row.params ?? {})) as {
        serviceName?: string
        startsAt?: string | null
        date?: string | null
      },
      read: row.read_at !== null && row.read_at !== undefined,
      createdAt: iso(row.created_at),
    }))
  }

  // What the page's header needs: who this browser is, and whether anything is unread.
  async brief(slug: string, token: string) {
    const account = await this.accountRow(slug, token)
    const notices = await this.notices(String(account.id))
    return {
      name: String(account.name),
      phone: account.phone ? String(account.phone) : null,
      unread: notices.filter((notice) => !notice.read).length,
    }
  }

  // The customer's account: their bookings, their waiting-list requests and what they were told.
  async account(slug: string, token: string) {
    const account = await this.accountRow(slug, token)
    const accountId = String(account.id)
    const organizationId = String(account.organization_id)
    const [booked, waiting, services, notices] = await Promise.all([
      this.db.query<Row>(
        `SELECT public_token FROM bookings WHERE account_id = $1
          ORDER BY starts_at DESC LIMIT 40`,
        [accountId]
      ),
      this.db.query<Row>(
        `SELECT * FROM booking_waitlist WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [accountId]
      ),
      this.bookings.listServices(organizationId),
      this.notices(accountId),
    ])
    const bookings = []
    for (const row of booked.rows) {
      const view = await this.bookings.publicBooking(String(row.public_token))
      bookings.push({
        token: String(row.public_token),
        number: view.number,
        status: view.status,
        serviceName: view.serviceName,
        providerName: view.providerName,
        startsAt: view.startsAt,
        endsAt: view.endsAt,
        price: view.price,
        needsPayment: view.payment !== null,
        canCancel: view.canCancel,
        canReview: view.canReview && view.review === null,
      })
    }
    const nowMs = this.now().getTime()
    const open = (status: string) => status === "pending" || status === "confirmed"
    return {
      name: String(account.name),
      phone: account.phone ? String(account.phone) : null,
      upcoming: bookings
        .filter((entry) => open(entry.status) && new Date(entry.endsAt).getTime() >= nowMs)
        .reverse(),
      past: bookings.filter(
        (entry) => !(open(entry.status) && new Date(entry.endsAt).getTime() >= nowMs)
      ),
      waitlist: waiting.rows.map((row) => ({
        id: String(row.id),
        serviceName: services.find((service) => service.id === String(row.service_id))?.name ?? "",
        preferredDate: day(row.preferred_date),
        status: String(row.status) as "waiting" | "booked" | "removed",
        createdAt: iso(row.created_at),
      })),
      notices,
      unread: notices.filter((notice) => !notice.read).length,
    }
  }

  async markRead(slug: string, token: string): Promise<void> {
    const account = await this.accountRow(slug, token)
    await this.db.query(
      `UPDATE booking_account_notices SET read_at = $2 WHERE account_id = $1 AND read_at IS NULL`,
      [account.id, this.now()]
    )
  }

  // ---- Who is told what ----

  private async tellCustomer(
    accountId: unknown,
    kind: AccountNoticeKind,
    bookingId: string | null,
    params: Record<string, unknown>
  ) {
    if (!accountId) return
    await this.db.query(
      `INSERT INTO booking_account_notices (id, account_id, kind, booking_id, params)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), accountId, kind, bookingId, JSON.stringify(params)]
    )
  }

  private async bookingFacts(organizationId: string, bookingId: string) {
    const [view, row] = await Promise.all([
      this.bookings.getBooking(organizationId, bookingId),
      this.db.query<Row>(`SELECT account_id FROM bookings WHERE id = $1`, [bookingId]),
    ])
    return { view, accountId: row.rows[0]?.account_id ?? null }
  }

  // Set as the booking service's event hook where the server is put together.
  async handle(event: BookingEvent): Promise<void> {
    const organizationId = event.organizationId
    if (event.kind === "created") {
      if (event.source !== "online") return
      const { view } = await this.bookingFacts(organizationId, event.bookingId)
      await notify(this.db, {
        organizationId,
        type: "booking_new",
        audience: "booking:view",
        params: {
          customerName: view.customerName,
          serviceName: view.serviceName,
          when: when(view.startsAt),
        },
        link: "/booking/list",
        dedupeKey: `booking_new:${event.bookingId}`,
      })
      return
    }
    if (event.kind === "status") {
      const { view, accountId } = await this.bookingFacts(organizationId, event.bookingId)
      const params = { serviceName: view.serviceName, startsAt: view.startsAt }
      if (event.to === "cancelled" && event.by === "customer") {
        await notify(this.db, {
          organizationId,
          type: "booking_cancelled",
          audience: "booking:view",
          params: {
            customerName: view.customerName,
            serviceName: view.serviceName,
            when: when(view.startsAt),
          },
          link: "/booking/list",
          dedupeKey: `booking_cancelled:${event.bookingId}:${this.now().getTime()}`,
        })
        return
      }
      if (event.to === "confirmed") {
        await this.tellCustomer(accountId, "confirmed", event.bookingId, params)
      } else if (event.to === "cancelled") {
        await this.tellCustomer(accountId, "cancelled", event.bookingId, params)
      } else if (event.to === "completed") {
        await this.tellCustomer(accountId, "completed", event.bookingId, params)
      }
      return
    }
    if (event.kind === "rescheduled") {
      const { view, accountId } = await this.bookingFacts(organizationId, event.bookingId)
      await this.tellCustomer(accountId, "rescheduled", event.bookingId, {
        serviceName: view.serviceName,
        startsAt: view.startsAt,
      })
      return
    }
    const entry = (
      await this.db.query<Row>(
        `SELECT * FROM booking_waitlist WHERE organization_id = $1 AND id = $2`,
        [organizationId, event.entryId]
      )
    ).rows[0]
    if (!entry) return
    const service = (await this.bookings.listServices(organizationId)).find(
      (candidate) => candidate.id === String(entry.service_id)
    )
    const serviceName = service?.name ?? ""
    if (event.kind === "waitlisted") {
      if (event.source !== "online") return
      await notify(this.db, {
        organizationId,
        type: "booking_waitlist",
        audience: "booking:view",
        params: {
          customerName: String(entry.customer_name),
          serviceName,
          when: day(entry.preferred_date),
        },
        link: "/booking/waitlist",
        dedupeKey: `booking_waitlist:${event.entryId}`,
      })
      return
    }
    if (!entry.account_id) return
    if (event.status === "removed") {
      await this.tellCustomer(entry.account_id, "waitlist_removed", null, {
        serviceName,
        date: day(entry.preferred_date),
      })
      return
    }
    // The staff book the visit themselves and then mark the request booked: the booking they
    // just made for that phone and service joins the customer's account, so it shows there.
    const since = new Date(this.now().getTime() - WAITLIST_LINK_WINDOW_MS)
    const recent = entry.customer_phone
      ? await this.db.query<Row>(
          `SELECT id, starts_at, created_at FROM bookings
            WHERE organization_id = $1 AND service_id = $2 AND customer_phone = $3
              AND account_id IS NULL
            ORDER BY created_at DESC LIMIT 5`,
          [organizationId, entry.service_id, entry.customer_phone]
        )
      : { rows: [] as Row[] }
    const made = recent.rows.find((row) => new Date(iso(row.created_at)) >= since)
    if (made) {
      await this.db.query(`UPDATE bookings SET account_id = $2 WHERE id = $1`, [
        made.id,
        entry.account_id,
      ])
    }
    await this.tellCustomer(entry.account_id, "waitlist_booked", made ? String(made.id) : null, {
      serviceName,
      startsAt: made ? iso(made.starts_at) : null,
      date: day(entry.preferred_date),
    })
  }
}
