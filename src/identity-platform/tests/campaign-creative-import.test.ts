// @vitest-environment node

// Bringing the creatives of ads already on Snapchat into the creative library (campaigns/
// creative-import.ts): what is read from Snapchat, what lands in the library and in storage, how
// each ad is tied to its creative, and what the library then says about where a creative is used
// and what its ads have done (campaigns/creative-insights.ts).
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CreativeImportService } from "../campaigns/creative-import"
import { CreativeInsightsService } from "../campaigns/creative-insights"
import { CampaignCreativesService } from "../campaigns/creatives"
import { SnapchatPublishError } from "../campaigns/publishing/snapchat-publisher"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

const ORG = "20000000-0000-0000-0000-000000000001"
const OTHER_ORG = "20000000-0000-0000-0000-000000000002"
const USER = "10000000-0000-0000-0000-000000000001"
const CONNECTION = "40000000-0000-0000-0000-000000000001"
const ACCOUNT = "acc-1"

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("picture")])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)])

const actor: AuthenticatedActor = {
  userId: USER,
  sessionId: "s",
  organizationId: ORG,
  workspaceId: null,
  roles: [],
  modulePermissions: [],
}

type Json = Record<string, unknown>

describe("bringing Snapchat ads' creatives into the library", () => {
  let database: PostgresDatabase
  let files: Map<string, { body: Buffer; contentType: string }>
  let creatives: CampaignCreativesService

  const rowId = (id: string) => `snapchat_ads:${CONNECTION}:${ACCOUNT}:${id}`
  const record = (type: string, id: string, payload: object) =>
    database.query(
      `insert into snapchat_records
         (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
       values ($1, $2, $3, $4, $5, '2026-01-10', $6::jsonb)`,
      [randomUUID(), CONNECTION, ACCOUNT, type, id, JSON.stringify(payload)]
    )

  // Snapchat as the import reads it: each ad's creative, each creative's file, and the file's
  // own address. Every question asked is kept, so a test can say what was not asked.
  function snapchat(options: { downloadFails?: boolean; media?: Record<string, Json> } = {}) {
    const asked: string[] = []
    const creativesOnSnapchat: Record<string, Json> = {
      "cr-1": { id: "cr-1", name: "عرض 149", top_snap_media_id: "m-image" },
      "cr-2": { id: "cr-2", name: "فيديو الحجوزات", top_snap_media_id: "m-video" },
      // A copy of the first ad: a creative of its own showing the very same file.
      "cr-3": { id: "cr-3", name: "عرض 149 - نسخة", top_snap_media_id: "m-image" },
      "cr-lens": { id: "cr-lens", name: "عدسة", top_snap_media_id: "m-lens" },
    }
    const media: Record<string, Json> = {
      "m-image": {
        id: "m-image",
        type: "IMAGE",
        name: "offer.png",
        download_link: "https://files.snap.test/m-image",
        image_metadata: { width_px: 1080, height_px: 1920 },
        file_size_in_bytes: JPEG.length,
      },
      "m-video": {
        id: "m-video",
        type: "VIDEO",
        download_link: "https://files.snap.test/m-video",
        duration_in_seconds: 28.5,
        video_metadata: { width_px: 1080, height_px: 1920 },
        file_size_in_bytes: MP4.length,
      },
      "m-lens": { id: "m-lens", type: "LENS_PACKAGE" },
      ...options.media,
    }
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      asked.push(`download ${url.split("/").pop()}`)
      if (options.downloadFails) return new Response("no", { status: 503 })
      // Snapchat's storage labels a video as a form upload; the bytes say what it is.
      return new Response(new Uint8Array(url.endsWith("m-video") ? MP4 : JPEG), {
        headers: { "content-type": "multipart/form-data" },
      })
    }) as typeof fetch
    return {
      asked,
      service: (batch?: number) =>
        new CreativeImportService(
          database,
          creatives,
          {
            snapchat: {
              access: { resolveAccessToken: async () => "token" },
              api: {
                readEntity: async ({ id }) => {
                  asked.push(`ad ${id}`)
                  throw new SnapchatPublishError("status", "gone", "SNAPCHAT_GONE")
                },
                readCreative: async ({ creativeId }) => {
                  asked.push(`creative ${creativeId}`)
                  return creativesOnSnapchat[creativeId]
                },
                readMedia: async ({ mediaId }) => {
                  asked.push(`media ${mediaId}`)
                  return media[mediaId]
                },
              },
            },
          },
          { fetch: fetchImpl, batch }
        ),
    }
  }

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
    for (const [id, name] of [
      [ORG, "Org"],
      [OTHER_ORG, "Other"],
    ]) {
      await database.query(
        `insert into organizations (id, name, owner_user_id) values ($1, $2, $3)`,
        [id, name, USER]
      )
    }
    await database.query(
      `insert into snapchat_oauth_connections
         (id, organization_id, project_id, status, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, 'connected', $4, $4)`,
      [CONNECTION, ORG, randomUUID(), USER]
    )
    await database.query(
      `insert into snapchat_ads_accounts (id, connection_id, account_id, account_name, currency_code)
       values ($1, $2, $3, 'Madar', 'SAR')`,
      [randomUUID(), CONNECTION, ACCOUNT]
    )
    files = new Map()
    creatives = new CampaignCreativesService(database, {
      uploadPublicObject: async (input: { key: string; body: Buffer; contentType: string }) => {
        files.set(input.key, { body: input.body, contentType: input.contentType })
        return `https://files.test/${input.key}`
      },
      readObject: async (key: string) => files.get(key) ?? null,
    })
    await record("campaigns", "camp-1", { name: "حملة الكاشير", status: "ACTIVE" })
    await record("ad_squads", "squad-1", { name: "الجميع 25+", campaign_id: "camp-1" })
    await record("ads", "ad-1", {
      name: "عرض 149",
      status: "ACTIVE",
      ad_squad_id: "squad-1",
      creative_id: "cr-1",
    })
    await record("ads", "ad-2", {
      name: "فيديو الحجوزات",
      status: "PAUSED",
      ad_squad_id: "squad-1",
      creative_id: "cr-2",
    })
    await record("ads", "ad-3", {
      name: "عرض 149 - نسخة",
      status: "ACTIVE",
      ad_squad_id: "squad-1",
      creative_id: "cr-3",
    })
  })

  afterEach(async () => {
    await database.end()
  })

  it("copies each ad's file into the library once, marked with its source", async () => {
    const snap = snapchat()
    expect(await snap.service().importNext(actor)).toEqual({ done: 3, remaining: 0, busy: false })

    const library = await creatives.list(ORG)
    expect(library).toHaveLength(2)
    const image = library.find((creative) => creative.kind === "image")
    const video = library.find((creative) => creative.kind === "video")
    expect(image).toMatchObject({
      name: "عرض 149",
      source: "snapchat",
      contentType: "image/jpeg",
      width: 1080,
      height: 1920,
    })
    expect(video).toMatchObject({
      name: "فيديو الحجوزات",
      source: "snapchat",
      contentType: "video/mp4",
      durationSeconds: 28.5,
    })
    // The files themselves are in Madar's storage, so they can go into a new campaign.
    expect((await creatives.readFile(ORG, video!.id)).bytes.equals(MP4)).toBe(true)
    expect([...files.keys()].every((key) => key.startsWith(`campaign-creatives/${ORG}/`))).toBe(
      true
    )
    // The copied ad shows the same file: it is tied to the same creative without a download.
    expect(snap.asked.filter((entry) => entry.startsWith("download"))).toEqual([
      "download m-image",
      "download m-video",
    ])
    const tied = await snap.service().adCreatives(actor)
    expect(tied.map((entry) => [entry.adRowId, entry.creative.id]).sort()).toEqual(
      [
        [rowId("ad-1"), image!.id],
        [rowId("ad-2"), video!.id],
        [rowId("ad-3"), image!.id],
      ].sort()
    )
    // Asking again brings nothing in and asks Snapchat nothing.
    const before = snap.asked.length
    expect(await snap.service().importNext(actor)).toEqual({ done: 0, remaining: 0, busy: false })
    expect(snap.asked).toHaveLength(before)
  })

  it("works through the ads a few at a time", async () => {
    const service = snapchat().service(2)
    expect(await service.importNext(actor)).toMatchObject({ done: 2, remaining: 1 })
    expect(await service.importNext(actor)).toMatchObject({ done: 1, remaining: 0 })
  })

  it("ties an ad published from Madar to the creative it was made from, asking nothing", async () => {
    const uploaded = await creatives.upload({
      organizationId: ORG,
      workspaceId: null,
      userId: USER,
      name: "من مدار",
      contentType: "image/jpeg",
      dataBase64: JPEG.toString("base64"),
    })
    await database.query(
      `insert into campaign_publications
         (id, organization_id, platform, connection_id, ad_account_id, name, objective,
          daily_budget, start_at, creative_id, brand_name, headline, call_to_action,
          destination_url, status, external_ids)
       values ($1, $2, 'snapchat', $3, $4, 'حملة من مدار', 'leads', 50, now(), $5, 'مدار', 'عنوان',
               'SIGN_UP', 'https://www.madar.my', 'published', $6::jsonb)`,
      [
        randomUUID(),
        ORG,
        CONNECTION,
        ACCOUNT,
        uploaded.id,
        JSON.stringify({ adId: "ad-1", mediaId: "m-image" }),
      ]
    )
    const snap = snapchat()
    await snap.service().importNext(actor)
    const tied = await snap.service().adCreatives(actor)
    // The published ad, and the copy that shows the same file, both point at the Madar creative.
    expect(tied.find((entry) => entry.adRowId === rowId("ad-1"))?.creative.id).toBe(uploaded.id)
    expect(tied.find((entry) => entry.adRowId === rowId("ad-3"))?.creative.id).toBe(uploaded.id)
    expect(snap.asked).not.toContain("creative cr-1")
    expect(snap.asked).not.toContain("download m-image")
    // Only the video was new to the library.
    expect((await creatives.list(ORG)).map((creative) => creative.source).sort()).toEqual([
      "snapchat",
      "upload",
    ])
  })

  it("sets aside an ad with no picture or video, and tries again after a failed download", async () => {
    await record("ads", "ad-lens", { name: "عدسة", ad_squad_id: "squad-1", creative_id: "cr-lens" })
    const failing = snapchat({ downloadFails: true })
    // The lens is dealt with for good; the three whose download failed still wait.
    expect(await failing.service(10).importNext(actor)).toEqual({
      done: 1,
      remaining: 3,
      busy: false,
    })
    expect(await creatives.list(ORG)).toEqual([])
    const working = snapchat()
    expect(await working.service(10).importNext(actor)).toEqual({
      done: 3,
      remaining: 0,
      busy: false,
    })
    expect(working.asked).not.toContain("creative cr-lens")
    expect(await working.service().forAd(actor, rowId("ad-lens"))).toBeNull()
  })

  it("sets aside a file over the size the library holds, without downloading it", async () => {
    const snap = snapchat({
      media: {
        "m-video": {
          id: "m-video",
          type: "VIDEO",
          download_link: "https://files.snap.test/m-video",
          file_size_in_bytes: 80 * 1024 * 1024,
        },
      },
    })
    expect(await snap.service().importNext(actor)).toMatchObject({ done: 3, remaining: 0 })
    expect(snap.asked).not.toContain("download m-video")
    expect((await creatives.list(ORG)).map((creative) => creative.kind)).toEqual(["image"])
  })

  it("brings one ad's creative in when it is asked for, for its own organization only", async () => {
    const snap = snapchat()
    const shown = await snap.service().forAd(actor, rowId("ad-2"))
    expect(shown).toMatchObject({ kind: "video", source: "snapchat" })
    expect(snap.asked).toEqual(["creative cr-2", "media m-video", "download m-video"])
    // The second time it comes straight from the library.
    expect((await snap.service().forAd(actor, rowId("ad-2")))?.id).toBe(shown!.id)
    expect(snap.asked).toHaveLength(3)
    await expect(
      snap.service().forAd({ ...actor, organizationId: OTHER_ORG }, rowId("ad-2"))
    ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
    await expect(snap.service().forAd(actor, rowId("ad-unknown"))).rejects.toMatchObject({
      code: "CAMPAIGN_CONTROL_NOT_FOUND",
    })
    expect(await snap.service().importNext({ ...actor, organizationId: OTHER_ORG })).toEqual({
      done: 0,
      remaining: 0,
      busy: false,
    })
  })

  it("says where a brought-in creative is used and what its ads have done", async () => {
    const stat = (adId: string, day: string, numbers: Json) =>
      record("stats", `${adId}:${day}`, { level: "ad", entityId: adId, ...numbers })
    await stat("ad-1", "2026-01-09", { impressions: "900", swipes: "18", spend: "30000000" })
    await stat("ad-1", "2026-01-10", {
      impressions: "600",
      swipes: "12",
      spend: "20000000",
      conversion_sign_ups: "2",
    })
    await stat("ad-3", "2026-01-10", { impressions: "500", swipes: "5", spend: "10000000" })
    await stat("ad-2", "2026-01-10", { impressions: "400", swipes: "2", spend: "8000000" })
    await snapchat().service().importNext(actor)

    const library = await creatives.list(ORG)
    const image = library.find((creative) => creative.kind === "image")!
    const video = library.find((creative) => creative.kind === "video")!
    const insights = await new CreativeInsightsService(database).forOrganization(ORG)
    const of = (id: string) => insights.find((entry) => entry.creativeId === id)!

    // The picture is shown by two ads: their numbers add up, each ad listed with its campaign.
    expect(of(image.id)).toMatchObject({
      impressions: 2000,
      clicks: 35,
      spend: 60,
      signUps: 2,
      currency: "SAR",
      clickRate: expect.closeTo(1.75, 5),
      costPerSignUp: 30,
      rank: 1,
    })
    expect(
      of(image.id)
        .campaigns.map((use) => [use.name, use.adName, use.platformStatus, use.impressions])
        .sort((first, second) => Number(second[3]) - Number(first[3]))
    ).toEqual([
      ["حملة الكاشير", "عرض 149", "active", 1500],
      ["حملة الكاشير", "عرض 149 - نسخة", "active", 500],
    ])
    expect(of(video.id)).toMatchObject({ impressions: 400, rank: null })
    expect(of(video.id).campaigns).toMatchObject([
      { adName: "فيديو الحجوزات", platformStatus: "paused" },
    ])

    // A creative taken out of the library is no longer offered for its ads.
    await creatives.remove(ORG, video.id)
    const tied = await snapchat().service().adCreatives(actor)
    expect(tied.map((entry) => entry.adRowId).sort()).toEqual([rowId("ad-1"), rowId("ad-3")])
  })
})
