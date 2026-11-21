// @vitest-environment node
//
// The Booking app (migration 171): when a provider's time is free, taking and following a
// booking, the public booking page and its rules, and the app's subscription gate.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Booking Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Booking Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  await mergeOrgSettings(actor.organizationId, { bookingEnabled: true })

  return { token: login.session.accessToken, actor }
}

// pg-mem's jsonb `||` doesn't handle a cast parameter -- read, merge in JS and overwrite.
async function mergeOrgSettings(organizationId: string, patch: Record<string, unknown>) {
  const existing = await database.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1",
    [organizationId]
  )
  const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
  await database.query("update organizations set settings = $2::jsonb where id = $1", [
    organizationId,
    JSON.stringify(merged),
  ])
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bodies are asserted field by field
async function call<T = any>(method: string, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: token ? authHeaders(token) : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as T }
}

// A day three days from now on the business's clock (Riyadh), its weekday, and a time on it.
const DAY = new Date(Date.now() + 3 * 24 * 3600_000).toLocaleDateString("en-CA", {
  timeZone: "Asia/Riyadh",
})
const WEEKDAY = new Date(`${DAY}T00:00:00Z`).getUTCDay()
const at = (time: string, day = DAY) => new Date(`${day}T${time}:00+03:00`).toISOString()
const times = (slots: Array<{ time: string }>) => slots.map((slot) => slot.time)

// A salon: a 60-minute haircut with 15 free minutes after it, a 30-minute beard trim, and two
// providers working 10:00-13:00 that day (the first also 16:00-18:00).
async function salon(token: string) {
  const haircut = (
    await call("POST", "/v1/booking/services", token, {
      name: "قص شعر",
      durationMinutes: 60,
      price: 80,
      bufferMinutes: 15,
    })
  ).body
  const beard = (
    await call("POST", "/v1/booking/services", token, {
      name: "تحديد لحية",
      durationMinutes: 30,
      price: 30,
    })
  ).body
  const provider = async (name: string, serviceIds: string[], hours: number[][]) =>
    (
      await call("POST", "/v1/booking/providers", token, {
        name,
        serviceIds,
        hours: hours.map(([startMinute, endMinute]) => ({
          weekday: WEEKDAY,
          startMinute,
          endMinute,
        })),
      })
    ).body
  const sami = await provider(
    "سامي",
    [haircut.id, beard.id],
    [
      [600, 780],
      [960, 1080],
    ]
  )
  const fahad = await provider("فهد", [haircut.id], [[600, 780]])
  return { haircut, beard, sami, fahad }
}

const book = (token: string, input: Record<string, unknown>) =>
  call("POST", "/v1/booking/bookings", token, { customerName: "عميل", ...input })

describe("the Booking app", () => {
  it("offers the times a provider is free, and never the same time twice", async () => {
    const { token } = await signIn("booking@madar.test", "Salon")
    const { haircut, beard, sami, fahad } = await salon(token)
    const slots = async (serviceId: string, providerId?: string) =>
      (
        await call(
          "GET",
          `/v1/booking/availability?serviceId=${serviceId}&date=${DAY}${providerId ? `&providerId=${providerId}` : ""}`,
          token
        )
      ).body.slots

    // Every half hour that leaves room for the whole hour inside a working period.
    expect(times(await slots(haircut.id, sami.id))).toEqual([
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "16:00",
      "16:30",
      "17:00",
    ])
    expect((await slots(haircut.id))[0].providerIds.sort()).toEqual([sami.id, fahad.id].sort())

    const first = await book(token, {
      serviceId: haircut.id,
      providerId: sami.id,
      startsAt: at("10:30"),
      customerPhone: "0500000001",
    })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({
      number: 1,
      status: "confirmed",
      source: "staff",
      price: 80,
      providerName: "سامي",
      serviceName: "قص شعر",
      endsAt: at("11:30"),
    })
    // The hour and its 15 free minutes are gone for him: nothing that touches 10:30-11:45.
    expect(times(await slots(haircut.id, sami.id))).toEqual(["12:00", "16:00", "16:30", "17:00"])
    // A short service fits before it but not into the free minutes after it.
    expect(times(await slots(beard.id, sami.id)).slice(0, 3)).toEqual(["10:00", "12:00", "12:30"])
    // The other provider is untouched, and "anyone" still offers the time through him.
    expect(times(await slots(haircut.id))).toContain("10:30")

    // The same time with the same provider is refused; with no provider named it goes to the
    // free one.
    const clash = await book(token, {
      serviceId: haircut.id,
      providerId: sami.id,
      startsAt: at("11:00"),
    })
    expect(clash.status).toBe(409)
    expect(clash.body.code).toBe("BOOKING_TIME_TAKEN")
    const anyone = await book(token, { serviceId: haircut.id, startsAt: at("10:30") })
    expect(anyone.body.providerName).toBe("فهد")
    expect(anyone.body.number).toBe(2)

    // Outside working hours is refused too, unless the staff insist.
    const late = { serviceId: haircut.id, providerId: fahad.id, startsAt: at("20:00") }
    expect((await book(token, late)).status).toBe(409)
    expect((await book(token, { ...late, force: true })).status).toBe(201)
    // A provider who does not do the service cannot be given it.
    expect(
      (await book(token, { serviceId: beard.id, providerId: fahad.id, startsAt: at("10:00") })).body
        .code
    ).toBe("BOOKING_PROVIDER_NOT_FOR_SERVICE")
  })

  it("keeps time off free of bookings, and lets a group session fill up", async () => {
    const { token } = await signIn("booking-off@madar.test", "Studio")
    const { haircut, sami } = await salon(token)
    await call("POST", "/v1/booking/time-off", token, {
      providerId: sami.id,
      startsAt: at("10:00"),
      endsAt: at("12:00"),
      kind: "break",
    })
    const sams = (
      await call(
        "GET",
        `/v1/booking/availability?serviceId=${haircut.id}&date=${DAY}&providerId=${sami.id}`,
        token
      )
    ).body.slots
    expect(times(sams)).toEqual(["12:00", "16:00", "16:30", "17:00"])

    // A class of three places with one provider.
    const yoga = (
      await call("POST", "/v1/booking/services", token, {
        name: "يوغا",
        durationMinutes: 60,
        price: 50,
        capacity: 3,
      })
    ).body
    await call("PUT", `/v1/booking/providers/${sami.id}`, token, {
      name: "سامي",
      serviceIds: [haircut.id, yoga.id],
      hours: [{ weekday: WEEKDAY, startMinute: 960, endMinute: 1080 }],
    })
    const two = await book(token, { serviceId: yoga.id, startsAt: at("16:00"), partySize: 2 })
    expect(two.body.price).toBe(100)
    const left = (
      await call("GET", `/v1/booking/availability?serviceId=${yoga.id}&date=${DAY}`, token)
    ).body.slots
    expect(left[0]).toMatchObject({ time: "16:00", remaining: 1 })
    expect(
      (await book(token, { serviceId: yoga.id, startsAt: at("16:00"), partySize: 2 })).status
    ).toBe(409)
    expect((await book(token, { serviceId: yoga.id, startsAt: at("16:00") })).status).toBe(201)
    // Full now, and a haircut cannot share the class's time either.
    expect(
      (await call("GET", `/v1/booking/availability?serviceId=${yoga.id}&date=${DAY}`, token)).body
        .slots[0].time
    ).not.toBe("16:00")
    expect(
      (await book(token, { serviceId: haircut.id, providerId: sami.id, startsAt: at("16:00") }))
        .status
    ).toBe(409)
  })

  it("follows a booking: move it, cancel it, bring it back, finish and collect", async () => {
    const { token, actor } = await signIn("booking-life@madar.test", "Clinic")
    const { haircut, sami } = await salon(token)
    const a = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("10:00"),
        customerName: "نورة",
        customerPhone: "0555000111",
      })
    ).body
    const b = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("12:00"),
        customerName: "نورة",
        customerPhone: "0555000111",
      })
    ).body
    // The customer went into the customers list once, and both bookings point at her.
    const customers = await database.query(
      `select id from customers where organization_id = $1 and phone = '0555000111'`,
      [actor.organizationId]
    )
    expect(customers.rows).toHaveLength(1)
    expect(a.customerId).toBe(b.customerId)

    // Moving onto the other booking is refused; moving to a free time works and its own old
    // time does not stand in its way.
    expect(
      (
        await call("POST", `/v1/booking/bookings/${a.id}/reschedule`, token, {
          startsAt: at("11:30"),
        })
      ).status
    ).toBe(409)
    const moved = await call("POST", `/v1/booking/bookings/${a.id}/reschedule`, token, {
      startsAt: at("10:30"),
    })
    expect(moved.body).toMatchObject({ startsAt: at("10:30"), endsAt: at("11:30") })

    // Cancelled frees the time; taken by someone else, it cannot come back.
    await call("POST", `/v1/booking/bookings/${a.id}/status`, token, {
      status: "cancelled",
      reason: "طلب العميل",
    })
    const other = await book(token, {
      serviceId: haircut.id,
      providerId: sami.id,
      startsAt: at("10:30"),
    })
    expect(other.status).toBe(201)
    const back = await call("POST", `/v1/booking/bookings/${a.id}/status`, token, {
      status: "confirmed",
    })
    expect(back.body.code).toBe("BOOKING_TIME_TAKEN")

    await call("POST", `/v1/booking/bookings/${b.id}/status`, token, { status: "completed" })
    const paid = await call("POST", `/v1/booking/bookings/${b.id}/payment`, token, {
      paid: true,
      method: "cash",
    })
    expect(paid.body).toMatchObject({ status: "completed", paymentStatus: "paid" })
    await call("POST", `/v1/booking/bookings/${other.body.id}/status`, token, { status: "no_show" })

    const overview = (await call("GET", `/v1/booking/overview?from=${DAY}&to=${DAY}`, token)).body
    expect(overview.totals).toMatchObject({
      bookings: 3,
      completed: 1,
      cancelled: 1,
      noShow: 1,
      revenue: 80,
      collected: 80,
    })
    expect(overview.services[0]).toMatchObject({ name: "قص شعر", bookings: 2 })
    expect(overview.hours[12]).toBe(1)

    const found = await call(
      "GET",
      `/v1/booking/bookings?search=0555000111&status=completed`,
      token
    )
    expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([b.id])
    // A provider with a booking still to come cannot be removed.
    await book(token, { serviceId: haircut.id, providerId: sami.id, startsAt: at("16:30") })
    expect((await call("DELETE", `/v1/booking/providers/${sami.id}`, token)).body.code).toBe(
      "BOOKING_PROVIDER_HAS_BOOKINGS"
    )
  })

  it("takes bookings on the public page under the business's rules", async () => {
    const { token, actor } = await signIn("booking-public@madar.test", "Spa")
    const { haircut, sami } = await salon(token)
    const internal = (
      await call("POST", "/v1/booking/services", token, {
        name: "خدمة داخلية",
        durationMinutes: 30,
        price: 10,
        visibility: "internal",
      })
    ).body
    await call("PUT", `/v1/booking/providers/${sami.id}`, token, {
      name: "سامي",
      serviceIds: [haircut.id, internal.id],
      hours: [{ weekday: WEEKDAY, startMinute: 600, endMinute: 780 }],
    })

    // Closed until it has an address and is switched on.
    expect((await call("GET", "/v1/public/booking/pages/my-spa")).status).toBe(404)
    expect(
      (await call("PUT", "/v1/booking/settings", token, { onlineEnabled: true })).body.code
    ).toBe("BOOKING_SLUG_REQUIRED")
    const settings = await call("PUT", "/v1/booking/settings", token, {
      slug: "My-Spa",
      onlineEnabled: true,
      displayName: "سبا الهدوء",
      autoConfirm: false,
      cancellationDeadlineMinutes: 60,
    })
    expect(settings.body.slug).toBe("my-spa")

    const page = (await call("GET", "/v1/public/booking/pages/my-spa")).body
    expect(page.name).toBe("سبا الهدوء")
    // Only what customers may book themselves, and only services someone provides.
    expect(page.services.map((service: { name: string }) => service.name)).toEqual(["قص شعر"])
    expect(page.providers.map((provider: { name: string }) => provider.name)).toContain("سامي")

    const open = (
      await call(
        "GET",
        `/v1/public/booking/pages/my-spa/availability?serviceId=${haircut.id}&date=${DAY}`
      )
    ).body.slots
    expect(times(open)).toContain("10:00")
    // The staff-only service is not there for the public at all.
    expect(
      (
        await call(
          "GET",
          `/v1/public/booking/pages/my-spa/availability?serviceId=${internal.id}&date=${DAY}`
        )
      ).status
    ).toBe(404)

    const request = {
      serviceId: haircut.id,
      providerId: sami.id,
      startsAt: at("10:00"),
      customerName: "سارة",
      customerPhone: "0544000222",
      notes: "أول زيارة",
    }
    // The trap field filled in: answered as if it worked, nothing kept.
    const bot = await call("POST", "/v1/public/booking/pages/my-spa/bookings", undefined, {
      ...request,
      website: "http://spam",
    })
    expect(bot.body.token).toBeNull()
    const made = await call("POST", "/v1/public/booking/pages/my-spa/bookings", undefined, request)
    expect(made.status).toBe(201)
    // Waits for the staff, since this business confirms by hand.
    expect(made.body.booking).toMatchObject({
      status: "pending",
      serviceName: "قص شعر",
      canCancel: true,
    })
    expect(
      (await call("POST", "/v1/public/booking/pages/my-spa/bookings", undefined, request)).body.code
    ).toBe("BOOKING_TIME_TAKEN")

    // It shows in the staff's list as an online booking with the customer's note.
    const listed = (await call("GET", `/v1/booking/bookings?from=${DAY}&to=${DAY}`, token)).body
      .items
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ source: "online", customerNotes: "أول زيارة", number: 1 })

    // The customer's own link shows it and cancels it; the time opens again.
    const mine = await call("GET", `/v1/public/booking/manage/${made.body.token}`)
    expect(mine.body).toMatchObject({ customerName: "سارة", status: "pending" })
    expect((await call("GET", "/v1/public/booking/manage/not-a-token")).status).toBe(404)
    const cancelled = await call("POST", `/v1/public/booking/manage/${made.body.token}/cancel`)
    expect(cancelled.body).toMatchObject({ status: "cancelled", canCancel: false })
    expect(
      (await call("POST", "/v1/public/booking/pages/my-spa/bookings", undefined, request)).status
    ).toBe(201)

    // Another business cannot take the same address.
    const second = await signIn("booking-second@madar.test", "Second")
    expect(
      (await call("PUT", "/v1/booking/settings", second.token, { slug: "my-spa" })).body.code
    ).toBe("BOOKING_SLUG_TAKEN")

    // A lapsed subscription closes the page and the app.
    await mergeOrgSettings(actor.organizationId, { bookingEnabled: false })
    expect((await call("GET", "/v1/public/booking/pages/my-spa")).status).toBe(404)
    expect((await call("GET", "/v1/booking/services", token)).status).toBe(403)
  })
})

describe("the Booking app: what a booking costs and what follows it", () => {
  it("prices options and add-ons, and makes the slot as long as they need", async () => {
    const { token } = await signIn("booking-options@madar.test", "Options")
    const hair = (
      await call("POST", "/v1/booking/services", token, {
        name: "صبغة",
        durationMinutes: 60,
        price: 100,
        options: [
          { name: "شعر قصير", durationMinutes: 60, price: 150 },
          { name: "شعر طويل", durationMinutes: 120, price: 250 },
        ],
        addons: [{ name: "علاج", price: 40, extraMinutes: 30 }],
      })
    ).body
    const [short, long] = hair.options
    const [treatment] = hair.addons
    expect(short.id).toBeTruthy()
    await call("POST", "/v1/booking/providers", token, {
      name: "هيا",
      serviceIds: [hair.id],
      hours: [{ weekday: WEEKDAY, startMinute: 600, endMinute: 780 }],
    })
    // Three hours of work: the long option plus the add-on only fits at the very start.
    const slots = (
      await call(
        "GET",
        `/v1/booking/availability?serviceId=${hair.id}&date=${DAY}&optionId=${long.id}&addonIds=${treatment.id}`,
        token
      )
    ).body.slots
    expect(times(slots)).toEqual(["10:00", "10:30"])

    // A service with options is booked as one of them.
    expect((await book(token, { serviceId: hair.id, startsAt: at("10:00") })).body.code).toBe(
      "BOOKING_OPTION_REQUIRED"
    )
    const made = await book(token, {
      serviceId: hair.id,
      startsAt: at("10:00"),
      optionId: long.id,
      addonIds: [treatment.id],
    })
    expect(made.body).toMatchObject({
      optionName: "شعر طويل",
      subtotal: 290,
      price: 290,
      endsAt: at("12:30"),
    })
    expect(made.body.addons).toEqual([{ id: treatment.id, name: "علاج", price: 40 }])
    // Editing the service keeps the options' ids, so that booking still names its option.
    const edited = await call("PUT", `/v1/booking/services/${hair.id}`, token, {
      name: "صبغة",
      durationMinutes: 60,
      price: 100,
      options: [{ ...short, price: 160 }, long],
      addons: [treatment],
    })
    expect(edited.body.options.map((option: { id: string }) => option.id)).toEqual([
      short.id,
      long.id,
    ])
  })

  it("takes a coupon, a gift card and points off the price, and gives them back on cancel", async () => {
    const { token, actor } = await signIn("booking-codes@madar.test", "Codes")
    const { haircut, sami } = await salon(token)
    // Points are kept by the Loyalty app, which the booking app earns into and spends from.
    await mergeOrgSettings(actor.organizationId, { loyaltyEnabled: true })
    await call("PUT", "/v1/loyalty/program", token, {
      isActive: true,
      pointsPerSar: 1,
      pointValue: 0.1,
    })
    const coupon = await call("POST", "/v1/booking/coupons", token, {
      code: "welcome",
      kind: "percent",
      value: 25,
      perCustomerLimit: 1,
    })
    expect(coupon.body.code).toBe("WELCOME")
    expect(
      (
        await call("POST", "/v1/booking/coupons", token, {
          code: "WELCOME",
          kind: "fixed",
          value: 5,
        })
      ).body.code
    ).toBe("BOOKING_CODE_TAKEN")
    const gift = (await call("POST", "/v1/booking/gift-cards", token, { amount: 50 })).body
    expect(gift.code).toMatch(/^GIFT-/)

    const customer = { customerName: "منى", customerPhone: "0500000777" }
    const quote = await call("POST", "/v1/booking/quote", token, {
      serviceId: haircut.id,
      couponCode: "Welcome",
      giftCode: gift.code,
    })
    // 80, a quarter off, then the gift card pays 50 of the 60 left.
    expect(quote.body).toMatchObject({ subtotal: 80, discount: 20, giftAmount: 50, total: 10 })
    expect(
      (
        await call("POST", "/v1/booking/quote", token, {
          serviceId: haircut.id,
          couponCode: "NOPE",
        })
      ).body.code
    ).toBe("BOOKING_COUPON_INVALID")

    const first = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("10:00"),
        couponCode: "welcome",
        giftCode: gift.code,
        ...customer,
      })
    ).body
    expect(first).toMatchObject({ price: 10, discount: 20, giftAmount: 50, couponCode: "WELCOME" })
    const cards = async () => (await call("GET", "/v1/booking/gift-cards", token)).body.items[0]
    expect((await cards()).balance).toBe(0)
    // Once per customer.
    expect(
      (
        await book(token, {
          serviceId: haircut.id,
          providerId: sami.id,
          startsAt: at("12:00"),
          couponCode: "welcome",
          ...customer,
        })
      ).body
    ).toMatchObject({ code: "BOOKING_COUPON_INVALID", details: { reason: "customer" } })

    // Finishing it earns points on what was paid; they then pay for part of the next visit.
    await call("POST", `/v1/booking/bookings/${first.id}/status`, token, { status: "completed" })
    const known = (await call("GET", "/v1/booking/customers/lookup?phone=0500000777", token)).body
    expect(known).toMatchObject({ name: "منى", points: 10 })
    const second = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("12:00"),
        redeemPoints: 10,
        ...customer,
      })
    ).body
    expect(second).toMatchObject({ loyaltyPoints: 10, loyaltyDiscount: 1, price: 79 })
    const points = async () =>
      (await call("GET", "/v1/booking/customers/lookup?phone=0500000777", token)).body.points
    expect(await points()).toBe(0)
    expect(
      (
        await book(token, {
          serviceId: haircut.id,
          providerId: sami.id,
          startsAt: at("16:00"),
          redeemPoints: 5,
          ...customer,
        })
      ).body.code
    ).toBe("BOOKING_POINTS_INVALID")

    // Cancelling gives back the points spent; un-finishing the first takes back what it earned.
    await call("POST", `/v1/booking/bookings/${second.id}/status`, token, { status: "cancelled" })
    expect(await points()).toBe(10)
    await call("POST", `/v1/booking/bookings/${first.id}/status`, token, { status: "cancelled" })
    expect(await points()).toBe(0)
    expect((await cards()).balance).toBe(50)
    expect((await call("GET", "/v1/booking/coupons", token)).body.items[0].usedCount).toBe(0)
  })

  it("sells a package, spends its visits and refuses it once they are gone", async () => {
    const { token } = await signIn("booking-plans@madar.test", "Plans")
    const { haircut, beard, sami } = await salon(token)
    const plan = (
      await call("POST", "/v1/booking/plans", token, {
        kind: "package",
        name: "باقة قصتين",
        price: 140,
        uses: 2,
        validityDays: 60,
        serviceIds: [haircut.id],
      })
    ).body
    const held = (
      await call("POST", "/v1/booking/customer-plans", token, {
        planId: plan.id,
        customerName: "خالد",
        customerPhone: "0500000888",
      })
    ).body
    expect(held).toMatchObject({ usesLeft: 2, usable: true, pricePaid: 140 })

    const visit = (time: string, serviceId = haircut.id) =>
      book(token, {
        serviceId,
        providerId: sami.id,
        startsAt: at(time),
        customerPlanId: held.id,
        customerName: "خالد",
        customerPhone: "0500000888",
      })
    const one = (await visit("10:00")).body
    // Covered whole: nothing owed, and it counts as paid.
    expect(one).toMatchObject({ price: 0, subtotal: 80, paymentStatus: "paid" })
    // Not for a service the package does not cover.
    expect((await visit("12:00", beard.id)).body.code).toBe("BOOKING_PLAN_INVALID")
    expect((await visit("12:00")).status).toBe(201)
    expect((await visit("16:00")).body.code).toBe("BOOKING_PLAN_INVALID")
    const lookup = async () =>
      (await call("GET", "/v1/booking/customers/lookup?phone=0500000888", token)).body.plans
    expect(await lookup()).toEqual([])
    // A cancelled visit goes back on the package.
    await call("POST", `/v1/booking/bookings/${one.id}/status`, token, { status: "cancelled" })
    expect((await lookup())[0]).toMatchObject({ usesLeft: 1 })

    // A membership has no count.
    const membership = (
      await call("POST", "/v1/booking/plans", token, {
        kind: "membership",
        name: "عضوية شهرية",
        price: 300,
        validityDays: 30,
      })
    ).body
    expect(membership.uses).toBeNull()
  })

  it("works out a provider's commission, and takes and shows a customer's review", async () => {
    const { token } = await signIn("booking-after@madar.test", "After")
    const { haircut, sami } = await salon(token)
    await call("PUT", `/v1/booking/providers/${sami.id}`, token, {
      name: "سامي",
      commissionRate: 30,
      serviceIds: [haircut.id],
      hours: [{ weekday: WEEKDAY, startMinute: 600, endMinute: 780 }],
    })
    await call("POST", "/v1/booking/coupons", token, { code: "TEN", kind: "fixed", value: 10 })
    await call("PUT", "/v1/booking/settings", token, { slug: "after-spa", onlineEnabled: true })
    const booking = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("10:00"),
        couponCode: "TEN",
        customerName: "سلمان الدوسري",
      })
    ).body

    // A review waits for the visit to be finished.
    const review = (rating: number, comment?: string) =>
      call("POST", `/v1/public/booking/manage/${booking.publicToken}/review`, undefined, {
        rating,
        comment,
      })
    expect((await review(5)).body.code).toBe("BOOKING_REVIEW_CLOSED")
    const done = await call("POST", `/v1/booking/bookings/${booking.id}/status`, token, {
      status: "completed",
    })
    // 30% of the 70 it was sold for.
    expect(done.body.commissionAmount).toBe(21)
    const overview = (await call("GET", `/v1/booking/overview?from=${DAY}&to=${DAY}`, token)).body
    expect(overview.totals).toMatchObject({ commissions: 21, discounts: 10 })
    expect(overview.providers[0]).toMatchObject({ name: "سامي", commission: 21 })

    expect((await review(4, "خدمة ممتازة")).body).toMatchObject({
      canReview: true,
      review: { rating: 4, comment: "خدمة ممتازة" },
    })
    // Writing again changes it rather than adding a second one.
    await review(5, "خدمة ممتازة")
    const listed = (await call("GET", "/v1/booking/reviews", token)).body.items
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ rating: 5, providerName: "سامي", isPublished: true })

    const page = (await call("GET", "/v1/public/booking/pages/after-spa")).body
    expect(page.reviews).toMatchObject({ average: 5, count: 1 })
    // First name only in public.
    expect(page.reviews.latest[0]).toMatchObject({ customerName: "سلمان", comment: "خدمة ممتازة" })
    await call("POST", `/v1/booking/reviews/${listed[0].id}/publish`, token, { isPublished: false })
    expect((await call("GET", "/v1/public/booking/pages/after-spa")).body.reviews.count).toBe(0)
  })
})

describe("the Booking app: what happens on its own", () => {
  it("issues one tax invoice for a finished visit, at the price the customer paid", async () => {
    const { token, actor } = await signIn("booking-invoice@madar.test", "Invoice")
    const { haircut, sami } = await salon(token)
    await call("PUT", "/v1/booking/settings", token, { invoiceOnCompletion: true })
    await call("POST", "/v1/booking/coupons", token, { code: "FIVE", kind: "fixed", value: 5 })
    const booking = (
      await book(token, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("10:00"),
        couponCode: "FIVE",
        customerName: "ريم",
        customerPhone: "0500000999",
      })
    ).body
    // Not before the visit is finished.
    expect(
      (await call("POST", `/v1/booking/bookings/${booking.id}/invoice`, token)).body.code
    ).toBe("BOOKING_INVOICE_NOT_FINISHED")

    const done = (
      await call("POST", `/v1/booking/bookings/${booking.id}/status`, token, {
        status: "completed",
      })
    ).body
    expect(done.invoiceNumber).toMatch(/^INV-/)
    expect(done.paymentStatus).toBe("paid")
    const invoices = await database.query<{
      id: string
      total_amount: string
      tax_amount: string
      notes: string
    }>(`select id, total_amount, tax_amount, notes from pos_invoices where organization_id = $1`, [
      actor.organizationId,
    ])
    expect(invoices.rows).toHaveLength(1)
    // 80 less the coupon's 5, tax inside it.
    expect(Number(invoices.rows[0].total_amount)).toBe(75)
    expect(Number(invoices.rows[0].tax_amount)).toBeCloseTo(75 - 75 / 1.15, 2)
    expect(invoices.rows[0].notes).toBe(`حجز رقم ${booking.number}`)

    // Asked for again, it is the same invoice.
    const again = await call("POST", `/v1/booking/bookings/${booking.id}/invoice`, token)
    expect(again.body.invoiceNumber).toBe(done.invoiceNumber)
    expect(again.body.invoiceUrl).toContain("/i/")
    const after = await database.query(`select id from pos_invoices where organization_id = $1`, [
      actor.organizationId,
    ])
    expect(after.rows).toHaveLength(1)
  })

  it("gives the bookings as a calendar feed under a secret address", async () => {
    const { token } = await signIn("booking-feed@madar.test", "Feed")
    const { haircut, sami, fahad } = await salon(token)
    await book(token, {
      serviceId: haircut.id,
      providerId: sami.id,
      startsAt: at("10:00"),
      customerName: "هدى، العلي",
    })
    const gone = (
      await book(token, { serviceId: haircut.id, providerId: fahad.id, startsAt: at("10:00") })
    ).body
    await call("POST", `/v1/booking/bookings/${gone.id}/status`, token, { status: "cancelled" })

    const feedToken = (await call("GET", "/v1/booking/calendar-feed", token)).body.token
    expect((await call("GET", "/v1/booking/calendar-feed", token)).body.token).toBe(feedToken)
    const response = await fetch(`${baseUrl}/v1/public/booking/calendar/${feedToken}.ics`)
    expect(response.headers.get("content-type")).toContain("text/calendar")
    const feed = await response.text()
    expect(feed.startsWith("BEGIN:VCALENDAR")).toBe(true)
    // One event: the cancelled booking is left out. The comma in the name is escaped.
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(feed).toContain("SUMMARY:هدى\\، العلي - قص شعر".replace("\\،", "،"))
    expect(feed).toContain(`DTSTART:${at("10:00").replace(/[-:]/g, "").replace(".000", "")}`)
    // One provider's own feed.
    const other = await fetch(
      `${baseUrl}/v1/public/booking/calendar/${feedToken}.ics?provider=${fahad.id}`
    )
    expect(await other.text()).not.toContain("BEGIN:VEVENT")

    // A new address closes the old one.
    const renewed = (await call("POST", "/v1/booking/calendar-feed", token)).body.token
    expect(renewed).not.toBe(feedToken)
    expect((await fetch(`${baseUrl}/v1/public/booking/calendar/${feedToken}.ics`)).status).toBe(404)
  })
})

describe("the Booking app: rooms, repeating bookings and the waiting list", () => {
  it("keeps a room for one booking at a time, whoever provides it", async () => {
    const { token } = await signIn("booking-rooms@madar.test", "Rooms")
    const { haircut, beard, sami, fahad } = await salon(token)
    const room = (
      await call("POST", "/v1/booking/resources", token, { name: "غرفة 1", kind: "room" })
    ).body
    expect(room).toMatchObject({ quantity: 1, isActive: true })
    const withRoom = await call("PUT", `/v1/booking/services/${haircut.id}`, token, {
      name: "قص شعر",
      durationMinutes: 60,
      price: 80,
      bufferMinutes: 15,
      resourceIds: [room.id],
    })
    expect(withRoom.body.resourceIds).toEqual([room.id])

    expect(
      (await book(token, { serviceId: haircut.id, providerId: sami.id, startsAt: at("10:00") }))
        .status
    ).toBe(201)
    // The other provider is free, but the only room is not -- until the first is out of it.
    const fahads = (
      await call(
        "GET",
        `/v1/booking/availability?serviceId=${haircut.id}&date=${DAY}&providerId=${fahad.id}`,
        token
      )
    ).body.slots
    expect(times(fahads)).toEqual(["11:30", "12:00"])
    expect(
      (await book(token, { serviceId: haircut.id, providerId: fahad.id, startsAt: at("10:30") }))
        .body.code
    ).toBe("BOOKING_TIME_TAKEN")
    // A service that needs no room is not held back by it.
    await call("POST", "/v1/booking/time-off", token, {
      providerId: fahad.id,
      startsAt: at("12:30"),
      endsAt: at("13:00"),
      kind: "break",
    })
    expect(
      (await book(token, { serviceId: beard.id, providerId: sami.id, startsAt: at("12:00") }))
        .status
    ).toBe(201)

    // A second room opens the time; removing the room frees the service of it altogether.
    await call("PUT", `/v1/booking/resources/${room.id}`, token, {
      name: "غرفة",
      kind: "room",
      quantity: 2,
    })
    expect(
      (await book(token, { serviceId: haircut.id, providerId: fahad.id, startsAt: at("10:30") }))
        .status
    ).toBe(201)
    await call("DELETE", `/v1/booking/resources/${room.id}`, token)
    expect((await call("GET", "/v1/booking/services", token)).body.items[0].resourceIds).toEqual([])
  })

  it("repeats a booking weekly, leaving out a week that is taken, and cancels what is left", async () => {
    const { token } = await signIn("booking-series@madar.test", "Series")
    const haircut = (
      await call("POST", "/v1/booking/services", token, {
        name: "جلسة علاج",
        durationMinutes: 60,
        price: 100,
      })
    ).body
    const sami = (
      await call("POST", "/v1/booking/providers", token, {
        name: "سامي",
        serviceIds: [haircut.id],
        hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startMinute: 600,
          endMinute: 780,
        })),
      })
    ).body
    const week = (count: number) =>
      new Date(new Date(at("10:00")).getTime() + count * 7 * 24 * 3600_000).toISOString()
    // Someone already has the third week's time.
    await book(token, { serviceId: haircut.id, providerId: sami.id, startsAt: week(2) })
    await call("POST", "/v1/booking/coupons", token, { code: "ONCE", kind: "fixed", value: 30 })

    const series = await book(token, {
      serviceId: haircut.id,
      startsAt: at("10:00"),
      customerName: "ليلى",
      customerPhone: "0500000444",
      couponCode: "ONCE",
      repeat: { everyWeeks: 1, count: 4 },
    })
    expect(series.status).toBe(201)
    expect(series.body.created.map((booking: { startsAt: string }) => booking.startsAt)).toEqual([
      at("10:00"),
      week(1),
      week(3),
    ])
    expect(series.body.skipped).toEqual([{ startsAt: week(2), code: "BOOKING_TIME_TAKEN" }])
    // One series, one provider, and the coupon on the first visit only.
    const [first, second] = series.body.created
    expect(first.seriesId).toBe(series.body.seriesId)
    expect(second.providerId).toBe(first.providerId)
    expect([first.price, second.price]).toEqual([70, 100])

    await call("POST", `/v1/booking/bookings/${first.id}/status`, token, { status: "completed" })
    const cancelled = await call("POST", `/v1/booking/series/${series.body.seriesId}/cancel`, token)
    // The finished visit stays; the two still to come go.
    expect(cancelled.body).toEqual({ cancelled: 2 })
    expect((await call("GET", `/v1/booking/bookings/${first.id}`, token)).body.status).toBe(
      "completed"
    )
  })

  it("keeps a waiting list for a full day and shows when a time has opened", async () => {
    const { token } = await signIn("booking-wait@madar.test", "Wait")
    const haircut = (
      await call("POST", "/v1/booking/services", token, {
        name: "قص شعر",
        durationMinutes: 60,
        price: 80,
      })
    ).body
    const sami = (
      await call("POST", "/v1/booking/providers", token, {
        name: "سامي",
        serviceIds: [haircut.id],
        hours: [{ weekday: WEEKDAY, startMinute: 600, endMinute: 660 }],
      })
    ).body
    await call("PUT", "/v1/booking/settings", token, { slug: "wait-spa", onlineEnabled: true })
    // The day's only hour is taken.
    const taken = (
      await book(token, { serviceId: haircut.id, providerId: sami.id, startsAt: at("10:00") })
    ).body

    const join = (body: Record<string, unknown>) =>
      call("POST", "/v1/public/booking/pages/wait-spa/waitlist", undefined, {
        serviceId: haircut.id,
        preferredDate: DAY,
        customerName: "عبير",
        customerPhone: "0500000321",
        ...body,
      })
    expect((await join({})).status).toBe(201)
    // Asking twice keeps one place; a filled trap field keeps none.
    await join({})
    expect((await join({ customerPhone: "0500000999", website: "x" })).body.id).toBeNull()
    await call("POST", "/v1/booking/waitlist", token, {
      serviceId: haircut.id,
      preferredDate: DAY,
      customerName: "منار",
    })

    const list = async () => (await call("GET", "/v1/booking/waitlist", token)).body.items
    const waiting = await list()
    expect(waiting.map((entry: { customerName: string }) => entry.customerName)).toEqual([
      "عبير",
      "منار",
    ])
    expect(waiting[0]).toMatchObject({ source: "online", openTime: null, serviceName: "قص شعر" })

    // The booking is cancelled: the time shows as open to both.
    await call("POST", `/v1/booking/bookings/${taken.id}/status`, token, { status: "cancelled" })
    expect((await list()).map((entry: { openTime: string }) => entry.openTime)).toEqual([
      at("10:00"),
      at("10:00"),
    ])
    // Given a booking, the first leaves the list.
    await call("POST", `/v1/booking/waitlist/${waiting[0].id}/close`, token, { status: "booked" })
    expect(await list()).toHaveLength(1)
  })

  it("shows a storefront, keeps a customer's account and tells staff and customer what happens", async () => {
    const { token } = await signIn("booking-store@madar.test", "Store")
    const { haircut, sami } = await salon(token)
    await call("PUT", `/v1/booking/services/${haircut.id}`, token, {
      name: "قص شعر",
      durationMinutes: 60,
      price: 80,
      bufferMinutes: 15,
      description: "قص وتصفيف",
      imageUrl: "https://files.example.test/haircut.jpg",
    })
    await call("PUT", "/v1/booking/settings", token, {
      slug: "the-store",
      onlineEnabled: true,
      autoConfirm: false,
      coverUrl: "https://files.example.test/cover.jpg",
      tagline: "صالون رجالي",
      accentColor: "#0e7490",
      gallery: ["https://files.example.test/1.jpg"],
    })
    const page = "/v1/public/booking/pages/the-store"
    const shown = (await call("GET", page)).body
    expect(shown).toMatchObject({
      coverUrl: "https://files.example.test/cover.jpg",
      tagline: "صالون رجالي",
      accentColor: "#0e7490",
      gallery: ["https://files.example.test/1.jpg"],
    })
    expect(shown.services[0].imageUrl).toBe("https://files.example.test/haircut.jpg")
    // Only a web address is taken for a picture.
    expect(
      (await call("PUT", "/v1/booking/settings", token, { coverUrl: "javascript:alert(1)" })).status
    ).toBe(400)

    // What is told goes out after the answer, so it is waited for.
    const until = async <T>(read: () => Promise<T>, ready: (value: T) => boolean) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const value = await read()
        if (ready(value)) return value
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      return read()
    }
    const bell = () =>
      call("GET", "/v1/notifications", token).then(
        (response) =>
          response.body.items as Array<{ type: string; params: { customerName: string } }>
      )

    // The first booking from a browser gives it an account; the next one joins it.
    const first = (
      await call("POST", `${page}/bookings`, undefined, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("10:00"),
        customerName: "ماجد",
        customerPhone: "0500000009",
        partySize: 1,
      })
    ).body
    expect(first.accountToken).toMatch(/^[0-9a-f]{48}$/)
    const second = (
      await call("POST", `${page}/bookings`, undefined, {
        serviceId: haircut.id,
        providerId: sami.id,
        startsAt: at("16:00"),
        customerName: "ماجد",
        customerPhone: "0500000009",
        partySize: 1,
        accountToken: first.accountToken,
      })
    ).body
    expect(second.accountToken).toBe(first.accountToken)
    const accountPath = `${page}/account/${first.accountToken}`
    const mine = (await call("GET", accountPath)).body
    expect(mine).toMatchObject({ name: "ماجد", unread: 0 })
    expect(mine.upcoming.map((entry: { status: string }) => entry.status)).toEqual([
      "pending",
      "pending",
    ])
    // Another browser typing the same phone gets an account of its own, with nothing in it.
    const other = (
      await call("POST", `${page}/waitlist`, undefined, {
        serviceId: haircut.id,
        preferredDate: DAY,
        customerName: "شخص آخر",
        customerPhone: "0500000009",
      })
    ).body
    expect(other.accountToken).not.toBe(first.accountToken)
    expect((await call("GET", `${page}/account/${other.accountToken}`)).body.upcoming).toEqual([])
    expect((await call("GET", `${page}/account/nope`)).status).toBe(404)

    // The staff are told of the online bookings and the waiting-list request.
    const told = await until(bell, (items) => items.length >= 3)
    expect(told.map((item) => item.type).sort()).toEqual([
      "booking_new",
      "booking_new",
      "booking_waitlist",
    ])

    // The staff confirm one and move it: the customer is told both, and reads them.
    const bookings = (await call("GET", `/v1/booking/bookings?from=${DAY}&to=${DAY}`, token)).body
      .items as Array<{ id: string; startsAt: string }>
    const morning = bookings.find((entry) => entry.startsAt === at("10:00"))!
    await call("POST", `/v1/booking/bookings/${morning.id}/status`, token, { status: "confirmed" })
    await call("POST", `/v1/booking/bookings/${morning.id}/reschedule`, token, {
      startsAt: at("11:15"),
    })
    const noticed = await until(
      () => call("GET", `${accountPath}?brief=1`).then((response) => response.body),
      (brief) => brief.unread >= 2
    )
    expect(noticed.unread).toBe(2)
    const after = (await call("GET", accountPath)).body
    expect(after.notices.map((notice: { kind: string }) => notice.kind).sort()).toEqual([
      "confirmed",
      "rescheduled",
    ])
    await call("POST", `${accountPath}/read`)
    expect((await call("GET", `${accountPath}?brief=1`)).body.unread).toBe(0)

    // The customer cancels the other: the staff are told.
    await call("POST", `/v1/public/booking/manage/${second.token}/cancel`)
    const cancelled = await until(bell, (items) =>
      items.some((item) => item.type === "booking_cancelled")
    )
    expect(cancelled.some((item) => item.type === "booking_cancelled")).toBe(true)
    const final = (await call("GET", accountPath)).body
    expect(final.upcoming).toHaveLength(1)
    expect(final.past[0].status).toBe("cancelled")
  })
})
