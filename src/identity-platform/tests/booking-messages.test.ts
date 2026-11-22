// @vitest-environment node

// The Booking app's WhatsApp messages (booking/automation.ts): a confirmation once, and a
// reminder when a booking comes inside the business's reminder window.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BookingMessenger } from "../booking/automation"
import { BookingService } from "../booking/service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { WhatsAppPlatformService } from "../whatsapp/platform-config"
import { WhatsAppTemplatesService } from "../whatsapp/templates"

const ORG = "20000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"
const HOUR = 3600_000

interface Sent {
  to: string
  template: string
  values: string[]
}

// Meta's Graph API: every template approved, every send accepted.
function stubMeta() {
  const sent: Sent[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })
    if (url.pathname.endsWith("/message_templates")) {
      return json({
        data: ["madar_booking_confirmation", "madar_booking_reminder", "madar_gift_card"].map(
          (name) => ({
            name,
            language: "ar",
            status: "APPROVED",
          })
        ),
      })
    }
    if (url.pathname.endsWith("/messages")) {
      const body = JSON.parse(String(init?.body)) as {
        to: string
        template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> }
      }
      sent.push({
        to: body.to,
        template: body.template.name,
        values: body.template.components[0].parameters.map((entry) => entry.text),
      })
      return json({ messages: [{ id: `wamid.${sent.length}` }] })
    }
    return json({})
  })
  return sent
}

describe("booking WhatsApp messages", () => {
  let database: PostgresDatabase
  let bookings: BookingService
  let messenger: BookingMessenger
  let serviceId: string
  let providerId: string

  beforeEach(async () => {
    process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.madar.test"
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
    await runIdentityMigrations(database, process.cwd())
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'o@x.com', 'h', 'Owner', now())`,
      [USER]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id) values ($1, 'صالون', $2)`,
      [ORG, USER]
    )
    bookings = new BookingService(database)
    const platform = new WhatsAppPlatformService(database, {
      load: async () => ({
        appId: "1592",
        appSecret: "secret",
        accessToken: "EAAG-token",
        wabaId: "4569",
        phoneNumberId: "1390",
        apiVersion: "v26.0",
      }),
    })
    messenger = new BookingMessenger(
      database,
      bookings,
      platform,
      new WhatsAppTemplatesService(platform),
      null
    )
    serviceId = (
      await bookings.createService(ORG, {
        name: "قص شعر",
        durationMinutes: 30,
        price: 80,
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
        hours: [],
      })
    ).id
    await bookings.updateSettings(ORG, {
      displayName: "صالون نور",
      whatsappConfirmation: true,
      whatsappReminder: true,
      reminderHoursBefore: 24,
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await database.end()
  })

  // A booking some hours from now; `madeHoursAgo` moves its creation back in time.
  const make = async (
    startsInHours: number,
    madeHoursAgo = 0,
    phone: string | null = "0501234567"
  ) => {
    const booking = await bookings.createBooking(
      ORG,
      {
        serviceId,
        providerId,
        startsAt: new Date(Date.now() + startsInHours * HOUR).toISOString(),
        customerName: "ريم",
        customerPhone: phone,
        partySize: 1,
        force: true,
        addonIds: [],
      },
      { source: "staff", userId: null, workspaceId: null }
    )
    if (madeHoursAgo) {
      await database.query(`update bookings set created_at = $2 where id = $1`, [
        booking.id,
        new Date(Date.now() - madeHoursAgo * HOUR).toISOString(),
      ])
    }
    return booking
  }

  it("confirms a booking once, with its details and the customer's own link", async () => {
    const sent = stubMeta()
    const booking = await make(48)
    await messenger.confirm(ORG, booking.id)
    await messenger.confirm(ORG, booking.id)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: "966501234567", template: "madar_booking_confirmation" })
    expect(sent[0].values[0]).toBe("ريم")
    expect(sent[0].values[1]).toBe("صالون نور")
    expect(sent[0].values[2]).toBe("قص شعر")
    expect(sent[0].values[5]).toBe(`https://app.madar.test/bk/${booking.publicToken}`)
    const logged = await database.query<{ kind: string; status: string }>(
      `select kind, status from whatsapp_messages where reference_id = $1`,
      [booking.id]
    )
    expect(logged.rows).toEqual([{ kind: "booking_confirmation", status: "sent" }])

    // Switched off, nothing goes; and a booking with no usable number is passed over.
    await bookings.updateSettings(ORG, { whatsappConfirmation: false })
    await messenger.confirm(ORG, (await make(50)).id)
    await bookings.updateSettings(ORG, { whatsappConfirmation: true })
    await messenger.confirm(ORG, (await make(52, 0, null)).id)
    expect(sent).toHaveLength(1)
  })

  it("sends a gift card to the person it is for, with who it is from and its link", async () => {
    const sent = stubMeta()
    const card = await bookings.extras.createGiftCard(ORG, {
      amount: 300,
      purchaserName: "سارة",
      recipientName: "نورة",
      recipientPhone: "0501234567",
    })
    expect(await messenger.gift(ORG, card)).toBe("sent")
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: "966501234567", template: "madar_gift_card" })
    expect(sent[0].values).toEqual([
      "نورة",
      "صالون نور",
      "سارة",
      "300 ر.س",
      `https://app.madar.test/bk/gift/${card.shareToken}`,
    ])
    const logged = await database.query<{ kind: string; status: string }>(
      `select kind, status from whatsapp_messages where reference_id = $1`,
      [card.id]
    )
    expect(logged.rows).toEqual([{ kind: "booking_gift", status: "sent" }])

    // No giver named: the business itself is who it is from. No usable number: nothing goes.
    const plain = await bookings.extras.createGiftCard(ORG, {
      amount: 50,
      recipientPhone: "0501234567",
    })
    expect(await messenger.gift(ORG, plain)).toBe("sent")
    expect(sent[1].values.slice(0, 3)).toEqual(["عميلنا العزيز", "صالون نور", "صالون نور"])
    const nowhere = await bookings.extras.createGiftCard(ORG, { amount: 50 })
    expect(await messenger.gift(ORG, nowhere)).toBe("no_phone")
    expect(sent).toHaveLength(2)
  })

  it("reminds once, only inside the window, and not a booking made inside it", async () => {
    const sent = stubMeta()
    const due = await make(20, 48)
    const far = await make(40, 48)
    const lastMinute = await make(10, 1)
    const cancelled = await make(22, 48)
    await bookings.setStatus(ORG, cancelled.id, "cancelled", { by: "staff" })

    expect(await messenger.runDue()).toEqual({ sent: 1, skipped: 1 })
    expect(sent.map((entry) => entry.template)).toEqual(["madar_booking_reminder"])
    // A second pass finds nothing left to do.
    expect(await messenger.runDue()).toEqual({ sent: 0, skipped: 0 })
    const reminded = await database.query<{ id: string }>(
      `select id from bookings where reminder_sent_at is not null`
    )
    expect(reminded.rows.map((row) => row.id).sort()).toEqual([due.id, lastMinute.id].sort())

    // The far one comes due later.
    expect(await messenger.runDue(new Date(Date.now() + 20 * HOUR))).toEqual({
      sent: 1,
      skipped: 0,
    })
    expect(sent).toHaveLength(2)
    expect(far.id).toBeTruthy()
    expect(randomUUID()).toBeTruthy()
  })
})
