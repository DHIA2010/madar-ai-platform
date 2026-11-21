// The customer's own side of a business's booking page, and who is told what.
//
// An account starts with the browser it was made on: the first booking (or waiting-list request)
// from a phone makes one and hands that browser its secret, and everything booked from there
// afterwards is listed under it. A phone number that was merely typed opens nothing.
//
// Signing in by phone proves the number: a code goes to it on WhatsApp, and typing the code back
// gives the browser a proved account. A proved account shows every booking made for its number
// at this business -- from any device, and the ones the staff made too.
//
// The same events feed two places: the staff's notification bell (a booking made online, a
// customer cancelling, someone joining the waiting list) and the customer's account (a booking
// confirmed, moved or cancelled by the business, a place found from the waiting list).

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"

import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { notify } from "../notifications/service"
import { toWhatsAppNumber } from "../whatsapp/phone"
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

// Whatever sends the sign-in code (booking/automation.ts on the server, a stand-in in tests).
export interface SignInCodeSender {
  ready(organizationId: string): Promise<boolean>
  send(organizationId: string, to: string, code: string): Promise<void>
}

// A code lasts ten minutes and five wrong tries; a number gets one a minute and five an hour;
// a business's page sends a hundred a day at most.
const CODE_LIFE_MS = 10 * 60_000
const CODE_TRIES = 5
const CODE_GAP_MS = 60_000
const CODES_PER_HOUR = 5
const CODES_PER_DAY_PER_BUSINESS = 100

const SIGN_IN_ERRORS = {
  phone: () =>
    new IdentityError("BOOKING_PHONE_INVALID", 422, "business", "That phone number is not valid."),
  unavailable: () =>
    new IdentityError(
      "BOOKING_SIGN_IN_UNAVAILABLE",
      409,
      "business",
      "Signing in by phone is not available right now."
    ),
  wait: () =>
    new IdentityError(
      "BOOKING_CODE_WAIT",
      429,
      "business",
      "A code was sent a moment ago. Wait a little before asking for another."
    ),
  wrong: () =>
    new IdentityError("BOOKING_CODE_WRONG", 422, "business", "That code is wrong or has expired."),
}

// The ways one number is written in the bookings (staff type it as they like): the forms it is
// looked up by. A number saved with spaces or dashes in it is not found.
const phoneForms = (key: string): string[] => {
  const forms = [key, `+${key}`, `00${key}`]
  if (/^9665\d{8}$/.test(key)) forms.push(`0${key.slice(3)}`, key.slice(3))
  return forms
}
const marks = (count: number, from: number) =>
  Array.from({ length: count }, (_, index) => `$${from + index}`).join(", ")
const hashCode = (id: string, code: string) =>
  createHash("sha256").update(`${id}:${code}`).digest("hex")

export class BookingAccounts {
  // Set where the server is put together. Without it nobody can sign in by phone.
  codeSender: SignInCodeSender | null = null

  constructor(
    private readonly db: PostgresDatabase,
    private readonly bookings: BookingService,
    private readonly now: () => Date = () => new Date()
  ) {}

  // ---- Signing in by phone ----

  private async businessOf(slug: string): Promise<string> {
    const found = await this.db.query<Row>(
      `SELECT organization_id FROM booking_settings WHERE slug = $1`,
      [slug.trim().toLowerCase()]
    )
    if (!found.rows[0]) throw BOOKING_ERRORS.notFound("Page")
    return String(found.rows[0].organization_id)
  }

  // Whether this business has ever seen the number: a booking, a waiting-list request or an
  // account. A code is only sent to a number it knows, so the page cannot be used to message
  // strangers.
  private async known(organizationId: string, key: string): Promise<boolean> {
    const forms = phoneForms(key)
    const [booked, waiting, accounts] = await Promise.all([
      this.db.query<Row>(
        `SELECT id FROM bookings
          WHERE organization_id = $1 AND customer_phone IN (${marks(forms.length, 2)}) LIMIT 1`,
        [organizationId, ...forms]
      ),
      this.db.query<Row>(
        `SELECT id FROM booking_waitlist
          WHERE organization_id = $1 AND customer_phone IN (${marks(forms.length, 2)}) LIMIT 1`,
        [organizationId, ...forms]
      ),
      this.db.query<Row>(
        `SELECT id FROM booking_accounts WHERE organization_id = $1 AND phone_key = $2 LIMIT 1`,
        [organizationId, key]
      ),
    ])
    return booked.rows.length + waiting.rows.length + accounts.rows.length > 0
  }

  // Whether the page offers signing in by phone at all.
  async signInOffered(slug: string): Promise<boolean> {
    if (!this.codeSender) return false
    return this.codeSender.ready(await this.businessOf(slug))
  }

  // Sends a code to the number, if this business knows it. The answer is the same either way,
  // so the page does not tell anyone whose numbers have booked here.
  async startSignIn(
    slug: string,
    phone: string
  ): Promise<{ sent: true; expiresInMinutes: number }> {
    const organizationId = await this.businessOf(slug)
    const key = toWhatsAppNumber(phone)
    if (!key) throw SIGN_IN_ERRORS.phone()
    if (!this.codeSender || !(await this.codeSender.ready(organizationId))) {
      throw SIGN_IN_ERRORS.unavailable()
    }
    const answer = { sent: true as const, expiresInMinutes: CODE_LIFE_MS / 60_000 }
    const nowMs = this.now().getTime()
    const recent = await this.db.query<Row>(
      `SELECT phone_key, created_at FROM booking_sign_in_codes
        WHERE organization_id = $1 AND created_at > $2`,
      [organizationId, new Date(nowMs - 24 * 60 * 60_000)]
    )
    const mine = recent.rows
      .filter((row) => String(row.phone_key) === key)
      .map((row) => new Date(iso(row.created_at)).getTime())
    if (mine.some((at) => nowMs - at < CODE_GAP_MS)) throw SIGN_IN_ERRORS.wait()
    if (mine.filter((at) => nowMs - at < 60 * 60_000).length >= CODES_PER_HOUR) {
      throw SIGN_IN_ERRORS.wait()
    }
    if (recent.rows.length >= CODES_PER_DAY_PER_BUSINESS) throw SIGN_IN_ERRORS.unavailable()
    if (!(await this.known(organizationId, key))) return answer

    const id = randomUUID()
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
    await this.db.query(
      `INSERT INTO booking_sign_in_codes
         (id, organization_id, phone_key, code_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, organizationId, key, hashCode(id, code), new Date(nowMs + CODE_LIFE_MS), this.now()]
    )
    try {
      await this.codeSender.send(organizationId, key, code)
    } catch (error) {
      // A number that is not on WhatsApp, say. The page is told the same as ever.
      console.error("booking.sign_in_code_failed", error)
    }
    return answer
  }

  // The code typed back. Right: the browser gets a proved account for that number -- its own
  // account if it already has one for the number, the number's proved account if there is one,
  // or a new one.
  async finishSignIn(
    slug: string,
    input: { phone: string; code: string; accountToken?: string | null }
  ): Promise<{ accountToken: string }> {
    const organizationId = await this.businessOf(slug)
    const key = toWhatsAppNumber(input.phone)
    if (!key) throw SIGN_IN_ERRORS.phone()
    const codes = await this.db.query<Row>(
      `SELECT * FROM booking_sign_in_codes
        WHERE organization_id = $1 AND phone_key = $2 AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [organizationId, key]
    )
    const sent = codes.rows[0]
    if (
      !sent ||
      new Date(iso(sent.expires_at)).getTime() < this.now().getTime() ||
      Number(sent.attempts) >= CODE_TRIES
    ) {
      throw SIGN_IN_ERRORS.wrong()
    }
    const given = Buffer.from(hashCode(String(sent.id), input.code.trim()))
    const kept = Buffer.from(String(sent.code_hash))
    if (given.length !== kept.length || !timingSafeEqual(given, kept)) {
      await this.db.query(
        `UPDATE booking_sign_in_codes SET attempts = attempts + $2 WHERE id = $1`,
        [sent.id, 1]
      )
      throw SIGN_IN_ERRORS.wrong()
    }
    await this.db.query(`UPDATE booking_sign_in_codes SET used_at = $2 WHERE id = $1`, [
      sent.id,
      this.now(),
    ])

    // This browser's own account, when it is for the same number: it becomes the proved one.
    if (input.accountToken) {
      const own = await this.db.query<Row>(
        `SELECT id, token, phone FROM booking_accounts WHERE token = $1 AND organization_id = $2`,
        [input.accountToken, organizationId]
      )
      const row = own.rows[0]
      if (row && row.phone && toWhatsAppNumber(String(row.phone)) === key) {
        await this.db.query(
          `UPDATE booking_accounts SET phone_key = $2, verified_at = $3, last_seen_at = $3
            WHERE id = $1`,
          [row.id, key, this.now()]
        )
        return { accountToken: String(row.token) }
      }
    }
    const proved = await this.db.query<Row>(
      `SELECT id, token FROM booking_accounts
        WHERE organization_id = $1 AND phone_key = $2 AND verified_at IS NOT NULL
        ORDER BY created_at LIMIT 1`,
      [organizationId, key]
    )
    if (proved.rows[0]) {
      await this.db.query(`UPDATE booking_accounts SET last_seen_at = $2 WHERE id = $1`, [
        proved.rows[0].id,
        this.now(),
      ])
      return { accountToken: String(proved.rows[0].token) }
    }
    // A new proved account, named as the number's latest booking has it.
    const forms = phoneForms(key)
    const named = await this.db.query<Row>(
      `SELECT customer_name, customer_phone FROM bookings
        WHERE organization_id = $1 AND customer_phone IN (${marks(forms.length, 2)})
        ORDER BY created_at DESC LIMIT 1`,
      [organizationId, ...forms]
    )
    const id = randomUUID()
    const secret = randomBytes(24).toString("hex")
    await this.db.query(
      `INSERT INTO booking_accounts
         (id, organization_id, token, name, phone, phone_key, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        organizationId,
        secret,
        String(named.rows[0]?.customer_name ?? `+${key}`),
        String(named.rows[0]?.customer_phone ?? `+${key}`),
        key,
        this.now(),
      ]
    )
    return { accountToken: secret }
  }

  // The proved accounts for a number at a business: they are told about its bookings too.
  private async provedFor(organizationId: string, phone: unknown): Promise<string[]> {
    const key = phone ? toWhatsAppNumber(String(phone)) : null
    if (!key) return []
    const found = await this.db.query<Row>(
      `SELECT id FROM booking_accounts
        WHERE organization_id = $1 AND phone_key = $2 AND verified_at IS NOT NULL`,
      [organizationId, key]
    )
    return found.rows.map((row) => String(row.id))
  }

  // ---- Accounts ----

  // The account behind a browser's secret on this business's page, or a new one.
  private async ensure(
    organizationId: string,
    token: string | null | undefined,
    person: { name: string; phone: string | null }
  ): Promise<{ id: string; token: string }> {
    if (token) {
      const found = await this.db.query<Row>(
        `SELECT id, token, name, phone, verified_at FROM booking_accounts
          WHERE token = $1 AND organization_id = $2`,
        [token, organizationId]
      )
      if (found.rows[0]) {
        // A proved account keeps its own name and number: a booking made from it for someone
        // else does not rename it.
        const proved = Boolean(found.rows[0].verified_at)
        await this.db.query(
          `UPDATE booking_accounts SET name = $2, phone = $3, last_seen_at = $4 WHERE id = $1`,
          [
            found.rows[0].id,
            proved ? found.rows[0].name : person.name,
            proved ? found.rows[0].phone : person.phone,
            this.now(),
          ]
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
      verified: Boolean(account.verified_at),
      unread: notices.filter((notice) => !notice.read).length,
    }
  }

  // The customer's account: their bookings, their waiting-list requests and what they were told.
  async account(slug: string, token: string) {
    const account = await this.accountRow(slug, token)
    const accountId = String(account.id)
    const organizationId = String(account.organization_id)
    // A proved account also lists whatever was booked for its number elsewhere: on another
    // device, or by the staff.
    const forms =
      account.verified_at && account.phone_key ? phoneForms(String(account.phone_key)) : []
    const none = { rows: [] as Row[] }
    const [booked, bookedByPhone, waiting, waitingByPhone, services, notices] = await Promise.all([
      this.db.query<Row>(
        `SELECT id, public_token, starts_at FROM bookings WHERE account_id = $1
          ORDER BY starts_at DESC LIMIT 40`,
        [accountId]
      ),
      forms.length > 0
        ? this.db.query<Row>(
            `SELECT id, public_token, starts_at FROM bookings
              WHERE organization_id = $1 AND customer_phone IN (${marks(forms.length, 2)})
              ORDER BY starts_at DESC LIMIT 40`,
            [organizationId, ...forms]
          )
        : none,
      this.db.query<Row>(
        `SELECT * FROM booking_waitlist WHERE account_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [accountId]
      ),
      forms.length > 0
        ? this.db.query<Row>(
            `SELECT * FROM booking_waitlist
              WHERE organization_id = $1 AND customer_phone IN (${marks(forms.length, 2)})
              ORDER BY created_at DESC LIMIT 20`,
            [organizationId, ...forms]
          )
        : none,
      this.bookings.listServices(organizationId),
      this.notices(accountId),
    ])
    const together = (rows: Row[], stamp: string, limit: number) =>
      [...new Map(rows.map((row) => [String(row.id), row])).values()]
        .sort((a, b) => iso(b[stamp]).localeCompare(iso(a[stamp])))
        .slice(0, limit)
    const bookedRows = together([...booked.rows, ...bookedByPhone.rows], "starts_at", 40)
    const waitingRows = together([...waiting.rows, ...waitingByPhone.rows], "created_at", 20)
    const bookings = []
    for (const row of bookedRows) {
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
      verified: Boolean(account.verified_at),
      upcoming: bookings
        .filter((entry) => open(entry.status) && new Date(entry.endsAt).getTime() >= nowMs)
        .reverse(),
      past: bookings.filter(
        (entry) => !(open(entry.status) && new Date(entry.endsAt).getTime() >= nowMs)
      ),
      waitlist: waitingRows.map((row) => ({
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

  // `accounts`: the account the booking was made from, and the proved accounts for its number.
  private async tellCustomer(
    accounts: unknown[],
    kind: AccountNoticeKind,
    bookingId: string | null,
    params: Record<string, unknown>
  ) {
    for (const accountId of new Set(accounts.filter(Boolean).map(String))) {
      await this.db.query(
        `INSERT INTO booking_account_notices (id, account_id, kind, booking_id, params)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [randomUUID(), accountId, kind, bookingId, JSON.stringify(params)]
      )
    }
  }

  private async bookingFacts(organizationId: string, bookingId: string) {
    const [view, row] = await Promise.all([
      this.bookings.getBooking(organizationId, bookingId),
      this.db.query<Row>(`SELECT account_id FROM bookings WHERE id = $1`, [bookingId]),
    ])
    return {
      view,
      accounts: [
        row.rows[0]?.account_id ?? null,
        ...(await this.provedFor(organizationId, view.customerPhone)),
      ] as unknown[],
    }
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
      const { view, accounts } = await this.bookingFacts(organizationId, event.bookingId)
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
        await this.tellCustomer(accounts, "confirmed", event.bookingId, params)
      } else if (event.to === "cancelled") {
        await this.tellCustomer(accounts, "cancelled", event.bookingId, params)
      } else if (event.to === "completed") {
        await this.tellCustomer(accounts, "completed", event.bookingId, params)
      }
      return
    }
    if (event.kind === "rescheduled") {
      const { view, accounts } = await this.bookingFacts(organizationId, event.bookingId)
      await this.tellCustomer(accounts, "rescheduled", event.bookingId, {
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
    const waiters: unknown[] = [
      entry.account_id,
      ...(await this.provedFor(organizationId, entry.customer_phone)),
    ]
    if (!waiters.some(Boolean)) return
    if (event.status === "removed") {
      await this.tellCustomer(waiters, "waitlist_removed", null, {
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
    if (made && entry.account_id) {
      await this.db.query(`UPDATE bookings SET account_id = $2 WHERE id = $1`, [
        made.id,
        entry.account_id,
      ])
    }
    await this.tellCustomer(waiters, "waitlist_booked", made ? String(made.id) : null, {
      serviceName,
      startsAt: made ? iso(made.starts_at) : null,
      date: day(entry.preferred_date),
    })
  }
}

// The one made where the server is put together, for whoever needs to reach it afterwards.
let registeredAccounts: BookingAccounts | null = null
export const registerBookingAccounts = (accounts: BookingAccounts | null) => {
  registeredAccounts = accounts
}
export const registeredBookingAccounts = () => registeredAccounts
