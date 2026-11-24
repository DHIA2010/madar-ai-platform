// @vitest-environment node
//
// The sales team's prospect finder (crm/prospects.ts): a live search of Google Places that keeps
// nothing Google returns, the team's own mark against a place's id, and reading a business's own
// website for its e-mail without ever opening an address inside a network.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CrmProspectFinder, prospectsInternals } from "../crm/prospects"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import {
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettingsRepository,
} from "../platform-settings/types"

let database: PostgresDatabase
let key = "test-key"
const settings: PlatformSettingsRepository = {
  get: async () => ({ ...DEFAULT_PLATFORM_SETTINGS, googlePlacesApiKey: key }),
  update: async () => ({ ...DEFAULT_PLATFORM_SETTINGS }),
}
const sales = (userId: string): AuthenticatedActor =>
  ({
    userId,
    sessionId: randomUUID(),
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    roles: [],
    modulePermissions: [],
    isPlatformAdmin: true,
    platformPermissions: ["crm:manage"],
  }) as AuthenticatedActor

beforeEach(async () => {
  key = "test-key"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())
})
afterEach(async () => {
  vi.restoreAllMocks()
  await database.end()
})

async function staffMember() {
  const id = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'سلمان', now())`,
    [id, `${id}@madar.test`]
  )
  return sales(id)
}

describe("the prospect finder", () => {
  it("searches Google live, shows what it returns and keeps none of it", async () => {
    const asked: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      asked.push({
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      })
      return new Response(
        JSON.stringify({
          places: [
            {
              id: "place-1",
              displayName: { text: "مطعم الريم" },
              primaryTypeDisplayName: { text: "مطعم" },
              formattedAddress: "حي الملقا، الرياض",
              nationalPhoneNumber: "055 123 4567",
              internationalPhoneNumber: "+966 55 123 4567",
              websiteUri: "https://alreem.example",
              googleMapsUri: "https://maps.google.com/?cid=1",
              rating: 4.4,
              userRatingCount: 210,
              businessStatus: "OPERATIONAL",
            },
            {
              id: "place-2",
              displayName: { text: "مطعم مغلق" },
              businessStatus: "CLOSED_PERMANENTLY",
            },
          ],
          nextPageToken: "more",
        }),
        { status: 200 }
      )
    })
    const finder = new CrmProspectFinder(database, settings)
    const actor = await staffMember()

    const page = await finder.search(actor, { query: "مطاعم في الرياض" })
    expect(asked[0].headers["x-goog-api-key"]).toBe("test-key")
    expect(asked[0].body).toMatchObject({
      textQuery: "مطاعم في الرياض",
      languageCode: "ar",
      regionCode: "SA",
    })
    expect(page.nextPageToken).toBe("more")
    expect(page.items[0]).toMatchObject({
      placeId: "place-1",
      name: "مطعم الريم",
      category: "مطعم",
      phone: "055 123 4567",
      website: "https://alreem.example",
      rating: 4.4,
      ratings: 210,
      closed: false,
      mark: null,
    })
    expect(page.items[1]).toMatchObject({ name: "مطعم مغلق", closed: true, phone: null })
    // Nothing of Google's was written anywhere.
    expect((await database.query(`select * from crm_prospect_marks`)).rows).toEqual([])

    // The team's mark is kept against the place's id and comes back with the next search.
    const mark = await finder.mark(actor, {
      placeId: "place-1",
      status: "interested",
      note: "يتصل الخميس",
    })
    expect(mark).toMatchObject({ status: "interested", note: "يتصل الخميس", updatedBy: "سلمان" })
    const again = await finder.search(actor, { query: "مطاعم في الرياض", pageToken: "more" })
    expect(asked[1].body.pageToken).toBe("more")
    expect(again.items[0].mark).toMatchObject({ status: "interested" })
    const kept = await database.query<Record<string, unknown>>(`select * from crm_prospect_marks`)
    expect(Object.keys(kept.rows[0]).sort()).toEqual(
      ["note", "place_id", "status", "updated_at", "updated_by"].sort()
    )
    // Changed, then taken away.
    expect(
      await finder.mark(actor, { placeId: "place-1", status: "no_answer", note: null })
    ).toMatchObject({ status: "no_answer", note: null })
    expect(await finder.mark(actor, { placeId: "place-1", status: null })).toBeNull()
    expect((await database.query(`select * from crm_prospect_marks`)).rows).toEqual([])
  })

  it("searches inside a place, counts each search and stops at the month's free ones", async () => {
    const asked: Array<Record<string, unknown>> = []
    let refuseNext = false
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      asked.push(JSON.parse(String(init?.body)))
      if (refuseNext) {
        return new Response(JSON.stringify({ error: { message: "no" } }), { status: 403 })
      }
      return new Response(
        JSON.stringify({
          places: [
            {
              id: "shop-1",
              displayName: { text: "محل عطور" },
              location: { latitude: 24.7701, longitude: 46.7002 },
            },
          ],
        }),
        { status: 200 }
      )
    })
    const finder = new CrmProspectFinder(database, settings)
    const actor = await staffMember()
    expect(await finder.usage(actor)).toMatchObject({ used: 0, free: 1000, remaining: 1000 })

    const page = await finder.search(actor, {
      query: "محلات عطور",
      area: { latitude: 24.77, longitude: 46.7, radius: 300 },
    })
    // Only the square around the place is asked for.
    const rectangle = (
      asked[0].locationRestriction as {
        rectangle: Record<string, { latitude: number; longitude: number }>
      }
    ).rectangle
    expect(rectangle.low.latitude).toBeCloseTo(24.77 - 300 / 111_320, 6)
    expect(rectangle.high.latitude).toBeCloseTo(24.77 + 300 / 111_320, 6)
    expect(rectangle.high.longitude - rectangle.low.longitude).toBeGreaterThan(
      rectangle.high.latitude - rectangle.low.latitude
    )
    expect(page.items[0]).toMatchObject({ latitude: 24.7701, longitude: 46.7002 })
    expect(page.usage).toMatchObject({ used: 1, remaining: 999, paid: 0, costUsd: 0 })

    // A search Google refuses is not counted.
    refuseNext = true
    await expect(finder.search(actor, { query: "مطاعم" })).rejects.toMatchObject({
      code: "CRM_PROSPECTS_REFUSED",
    })
    refuseNext = false
    expect((await finder.usage(actor)).used).toBe(1)

    // The free ones used up: refused before Google is asked, unless paid searches are allowed.
    await database.query(`update crm_prospect_usage set searches = 1000`)
    const before = asked.length
    await expect(finder.search(actor, { query: "مطاعم" })).rejects.toMatchObject({
      code: "CRM_PROSPECTS_FREE_USED",
    })
    expect(asked.length).toBe(before)
    const paid = await finder.search(actor, { query: "مطاعم", allowPaid: true })
    expect(paid.usage).toMatchObject({ used: 1001, remaining: 0, paid: 1, costUsd: 0.04 })
  })

  it("says so when the key is missing or Google refuses, and is for the sales team only", async () => {
    const finder = new CrmProspectFinder(database, settings)
    const actor = await staffMember()
    key = ""
    await expect(finder.search(actor, { query: "مطاعم" })).rejects.toMatchObject({
      code: "CRM_PROSPECTS_NO_KEY",
    })
    key = "wrong"
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "API key not valid." } }), { status: 400 })
    )
    await expect(finder.search(actor, { query: "مطاعم" })).rejects.toMatchObject({
      code: "CRM_PROSPECTS_REFUSED",
      details: { reason: "API key not valid." },
    })
    const outsider = { ...actor, platformPermissions: [] } as AuthenticatedActor
    await expect(finder.search(outsider, { query: "مطاعم" })).rejects.toBeTruthy()
    await expect(finder.emails(outsider, "https://alreem.example")).rejects.toBeTruthy()
  })

  it("reads e-mails out of a page, and never opens an address inside a network", async () => {
    const { emailsIn, contactLink, isPublicAddress } = prospectsInternals
    expect(
      emailsIn(
        '<a href="mailto:Info@AlReem.sa">راسلنا</a> sales&#64;alreem.sa logo@2x.png noreply@alreem.sa a@example.com'
      )
    ).toEqual(["info@alreem.sa", "sales@alreem.sa"])
    expect(
      contactLink(
        '<a href="/about">من نحن</a><a href="/contact-us">تواصل</a>',
        new URL("https://alreem.sa/")
      )
    ).toBe("https://alreem.sa/contact-us")
    expect(
      contactLink('<a href="https://other.sa/contact">x</a>', new URL("https://alreem.sa/"))
    ).toBeNull()

    for (const inside of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.4.1",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPublicAddress(inside)).toBe(false)
    }
    expect(isPublicAddress("52.59.230.170")).toBe(true)

    // Addresses that are not a named public website are refused before anything is fetched.
    const fetched = vi.spyOn(globalThis, "fetch")
    const finder = new CrmProspectFinder(database, settings)
    const actor = await staffMember()
    for (const bad of [
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:4000/",
      "http://10.40.1.5/",
      "ftp://alreem.sa/",
      "http://internal/",
    ]) {
      expect(await finder.emails(actor, bad)).toEqual([])
    }
    expect(fetched).not.toHaveBeenCalled()
  })
})
