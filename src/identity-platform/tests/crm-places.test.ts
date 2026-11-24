// @vitest-environment node
//
// The sales team's free directory of Saudi businesses (crm/places.ts): the monthly load sent by
// Madar's GitHub workflow (and nobody else), the search by activity, words, city and distance,
// and leads made from it carrying their own source.

import { generateKeyPairSync, randomUUID, sign } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import {
  CrmPlacesDirectory,
  isPlacesWorkflow,
  PLACES_TOKEN_AUDIENCE,
  placesBatchSchema,
  placesInternals,
} from "../crm/places"
import { CrmService } from "../crm/service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

let database: PostgresDatabase
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
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())
  placesInternals.forgetKeys()
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

const place = (over: Record<string, unknown>) => ({
  id: randomUUID(),
  name: "مطعم الريم",
  category: "restaurant",
  confidence: 0.9,
  phones: ["+966551234567"],
  website: null,
  email: null,
  social: null,
  address: "حي الملقا",
  locality: "الرياض",
  latitude: 24.77,
  longitude: 46.7,
  closed: false,
  ...over,
})

describe("the free directory of Saudi businesses", () => {
  it("takes a release in batches, replaces the one before and refuses a broken load", async () => {
    const directory = new CrmPlacesDirectory(database)
    expect(await directory.loadState()).toMatchObject({ release: null, places: 0 })

    const kept = place({ name: "مقهى نجد", category: "coffee_shop" })
    const gone = place({ name: "محل أُغلق" })
    const first = placesBatchSchema.parse({ release: "2026-10-21.0", rows: [kept, gone] })
    expect(await directory.loadBatch(first.release, first.rows)).toEqual({ saved: 2 })
    expect(await directory.loadComplete("2026-10-21.0")).toMatchObject({
      release: "2026-10-21.0",
      places: 2,
    })

    // The next release: one business still listed (renamed), one new, one no longer there.
    const next = placesBatchSchema.parse({
      release: "2026-11-18.0",
      rows: [{ ...kept, name: "مقهى نجد الجديد" }, place({ name: "مطعم جديد" })],
    })
    await directory.loadBatch(next.release, next.rows)
    const state = await directory.loadComplete("2026-11-18.0")
    expect(state).toMatchObject({ release: "2026-11-18.0", places: 2, refreshRequestedAt: null })
    const names = await database.query<{ name: string }>(
      `select name from crm_places order by name`
    )
    expect(names.rows.map((row) => row.name)).toEqual(["مطعم جديد", "مقهى نجد الجديد"])

    // A release that never arrived, or came out a fraction of the size, changes nothing.
    await expect(directory.loadComplete("2026-12-17.0")).rejects.toMatchObject({
      code: "CRM_PLACES_LOAD_TOO_SMALL",
    })
    await database.query(`update crm_places_state set places = 100000`)
    await directory.loadBatch(
      "2026-12-17.0",
      placesBatchSchema.parse({ release: "2026-12-17.0", rows: [place({})] }).rows
    )
    await expect(directory.loadComplete("2026-12-17.0")).rejects.toMatchObject({
      code: "CRM_PLACES_LOAD_TOO_SMALL",
    })
    expect((await directory.loadState()).release).toBe("2026-11-18.0")

    // The numbers a business gives: the Saudi mobile is the one kept for WhatsApp.
    expect(placesInternals.phonesOf(["+966114767966", "0551234567"])).toEqual({
      phone: "+966551234567",
      mobile: "966551234567",
    })
    expect(placesInternals.phonesOf(["+966114767966"])).toEqual({
      phone: "+966114767966",
      mobile: null,
    })
    expect(placesInternals.phonesOf([])).toEqual({ phone: null, mobile: null })
  })

  it("searches by activity, words, city and distance, with no limit, phones first", async () => {
    const directory = new CrmPlacesDirectory(database)
    const actor = await staffMember()
    const rows = [
      place({ name: "مطعم الريم", confidence: 0.6 }),
      place({ name: "Burger Lab", category: "fast_food_restaurant", confidence: 0.95 }),
      place({ name: "مطعم بلا رقم", phones: [], confidence: 0.99 }),
      place({ name: "مطعم هاتف ثابت", phones: ["+966114000000"], confidence: 0.5 }),
      place({ name: "مقهى نجد", category: "coffee_shop" }),
      place({ name: "مطعم مغلق", closed: true }),
      place({ name: "مطعم جدة", latitude: 21.55, longitude: 39.17 }),
      // 200 m east of the mall below, and one 3 km away.
      place({
        name: "عطور المول",
        category: "personal_care_and_beauty_store",
        latitude: 24.7689,
        longitude: 46.7162,
      }),
      place({
        name: "عطور بعيدة",
        category: "personal_care_and_beauty_store",
        latitude: 24.7689,
        longitude: 46.745,
      }),
    ]
    const batch = placesBatchSchema.parse({ release: "2026-11-18.0", rows })
    await directory.loadBatch(batch.release, batch.rows)
    await directory.loadComplete(batch.release)

    const overview = await directory.overview(actor)
    expect(overview).toMatchObject({ release: "2026-11-18.0", places: 9 })
    expect(overview.activities.find((entry) => entry.key === "restaurants")?.label).toBe("مطاعم")

    const restaurants = await directory.search(actor, { activity: "restaurants", city: "riyadh" })
    // Closed ones and other cities are left out; phones first, the surest first among them.
    expect(restaurants.items.map((item) => item.name)).toEqual([
      "Burger Lab",
      "مطعم الريم",
      "مطعم هاتف ثابت",
      "مطعم بلا رقم",
    ])
    expect(restaurants).toMatchObject({ total: 4, nextOffset: null })
    expect(restaurants.items[0]).toMatchObject({
      category: "مطاعم",
      phone: "+966551234567",
      internationalPhone: "+966551234567",
      mark: null,
    })
    expect(restaurants.items[0].mapsUrl).toContain("24.77,46.7")

    const mobiles = await directory.search(actor, {
      activity: "restaurants",
      city: "riyadh",
      mobileOnly: true,
    })
    expect(mobiles.items.map((item) => item.name)).toEqual(["Burger Lab", "مطعم الريم"])

    expect(
      (await directory.search(actor, { keyword: "burger" })).items.map((item) => item.name)
    ).toEqual(["Burger Lab"])
    expect((await directory.search(actor, { keyword: "جدة" })).total).toBe(1)

    // Around a mall: every kind of shop within the distance, and none beyond it.
    const around = await directory.search(actor, {
      area: { latitude: 24.7689, longitude: 46.7142, radius: 300 },
    })
    expect(around.items.map((item) => item.name)).toEqual(["عطور المول"])

    // The team asks for a fresh load; the workflow sees it in the state.
    expect((await directory.requestRefresh(actor)).refreshRequestedAt).not.toBeNull()
    expect((await directory.loadState()).refreshRequestedAt).not.toBeNull()

    const outsider = { ...actor, platformPermissions: [] } as AuthenticatedActor
    await expect(directory.search(outsider, {})).rejects.toBeTruthy()
    await expect(directory.requestRefresh(outsider)).rejects.toBeTruthy()
  })

  it("lets in only Madar's own workflow on the main branch", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 })
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "key-1" }] }),
          { status: 200 }
        )
    )
    const repository = "DHIA2010/madar-ai-platform"
    const claims = {
      iss: "https://token.actions.githubusercontent.com",
      aud: PLACES_TOKEN_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 300,
      repository,
      ref: "refs/heads/main",
      job_workflow_ref: `${repository}/.github/workflows/saudi-places.yml@refs/heads/main`,
    }
    const token = (over: Record<string, unknown> = {}, key = privateKey) => {
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
      const body = `${encode({ alg: "RS256", kid: "key-1" })}.${encode({ ...claims, ...over })}`
      return `Bearer ${body}.${sign("RSA-SHA256", Buffer.from(body), key).toString("base64url")}`
    }
    expect(await isPlacesWorkflow(token(), repository)).toBe(true)
    for (const wrong of [
      {
        repository: "someone/else",
        job_workflow_ref: "someone/else/.github/workflows/saudi-places.yml@refs/heads/main",
      },
      { ref: "refs/heads/feature" },
      { job_workflow_ref: `${repository}/.github/workflows/other.yml@refs/heads/main` },
      { aud: "something-else" },
      { exp: Math.floor(Date.now() / 1000) - 10 },
      { iss: "https://example.com" },
    ]) {
      expect(await isPlacesWorkflow(token(wrong), repository)).toBe(false)
    }
    // Signed by a key that is not GitHub's, cut short, or missing.
    expect(await isPlacesWorkflow(token({}, stranger.privateKey), repository)).toBe(false)
    expect(await isPlacesWorkflow("Bearer abc.def", repository)).toBe(false)
    expect(await isPlacesWorkflow(undefined, repository)).toBe(false)
  })

  it("makes leads that carry the directory as their source", async () => {
    const actor = await staffMember()
    const crm = new CrmService(database, async () => [])
    const outcome = await crm.importLeads(actor, {
      tag: "مطاعم الرياض",
      source: "directory",
      rows: [{ companyName: "مطعم الريم", contactName: null, phone: "+966551234567", email: null }],
    })
    expect(outcome).toEqual({ created: 1, duplicates: 0, invalid: 0 })
    const lead = await database.query<{ source: string; tags: unknown }>(
      `select source, tags from crm_leads`
    )
    expect(lead.rows[0].source).toBe("directory")
    // A file's rows keep the source they always had.
    await crm.importLeads(actor, {
      tag: "ملف",
      rows: [{ companyName: "محل آخر", contactName: null, phone: "+966557654321", email: null }],
    })
    const sources = await database.query<{ source: string }>(
      `select source from crm_leads order by source`
    )
    expect(sources.rows.map((row) => row.source)).toEqual(["directory", "import"])
  })
})
