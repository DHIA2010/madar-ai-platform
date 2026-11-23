// @vitest-environment node

// The creative library and publishing a campaign to Snapchat (campaigns/creatives.ts,
// campaigns/publishing): what a creative upload accepts, the exact pieces Snapchat is asked to
// create and in what order, cleaning up after a refused step, and the record Madar keeps.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { CampaignControlService } from "../campaigns/control-service"
import { CreativeInsightsService } from "../campaigns/creative-insights"
import { CampaignCreativesService } from "../campaigns/creatives"
import {
  CampaignPublishingService,
  snapchatCreativeProblem,
  withCampaignTracking,
  type PublishCampaignInput,
} from "../campaigns/publishing/service"
import { PlatformPublishError } from "../campaigns/publishing/platform"
import {
  SnapchatCampaignPublisher,
  SnapchatPublishError,
  type SnapchatPublishInput,
} from "../campaigns/publishing/snapchat-publisher"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"

const ORG = "20000000-0000-0000-0000-000000000001"
const OTHER_ORG = "20000000-0000-0000-0000-000000000002"
const USER = "10000000-0000-0000-0000-000000000001"
const CONNECTION = "40000000-0000-0000-0000-000000000001"
const ACCOUNT = "acc-1"

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("image-bytes"),
])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)])

const actor: AuthenticatedActor = {
  userId: USER,
  sessionId: "s",
  organizationId: ORG,
  workspaceId: null,
  roles: [],
  modulePermissions: [],
}

// Object storage held in memory.
function memoryStorage() {
  const files = new Map<string, { body: Buffer; contentType: string }>()
  return {
    files,
    uploadPublicObject: async (input: { key: string; body: Buffer; contentType: string }) => {
      files.set(input.key, { body: input.body, contentType: input.contentType })
      return `https://files.test/${input.key}`
    },
    readObject: async (key: string) => files.get(key) ?? null,
  }
}

// A stand-in for Snapchat's API: records every call, answers the way Snapchat does, and can be
// told to refuse one path.
function fakeSnapchat(
  options: {
    refuse?: string
    noPixel?: boolean
    noProfile?: boolean
    // The campaign was already deleted in Ads Manager: Snapchat no longer answers for it.
    campaignGone?: boolean
    // Snapchat refuses to delete a campaign that is still there.
    deleteRefused?: boolean
  } = {}
) {
  const calls: Array<{ method: string; path: string; body: unknown }> = []
  const ok = (listKey: string, itemKey: string, item: Record<string, unknown>) => ({
    request_status: "SUCCESS",
    [listKey]: [{ sub_request_status: "SUCCESS", [itemKey]: item }],
  })
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/v1/, "")
    const method = init?.method ?? "GET"
    const isForm = init?.body instanceof FormData
    const body = isForm ? "<file>" : init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ method, path, body })
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

    if (
      options.refuse &&
      method !== "GET" &&
      method !== "DELETE" &&
      path.endsWith(options.refuse)
    ) {
      return reply({
        request_status: "ERROR",
        [options.refuse.replace("/", "")]: [
          { sub_request_status: "ERROR", sub_request_error_reason: "Headline is too long" },
        ],
      })
    }
    if (method === "GET" && path === `/adaccounts/${ACCOUNT}`) {
      return reply(ok("adaccounts", "adaccount", { id: ACCOUNT, organization_id: "snap-org" }))
    }
    if (method === "GET" && path === "/organizations/snap-org/public_profiles") {
      return reply({
        request_status: "SUCCESS",
        public_profiles: [],
      })
    }
    if (method === "GET" && path === `/adaccounts/${ACCOUNT}/creatives`) {
      return reply({
        request_status: "SUCCESS",
        creatives: options.noProfile
          ? []
          : [{ creative: { id: "old", profile_properties: { profile_id: "profile-1" } } }],
      })
    }
    if (method === "GET" && path === `/adaccounts/${ACCOUNT}/pixels`) {
      return reply({
        request_status: "SUCCESS",
        pixels: options.noPixel ? [] : [{ pixel: { id: "pixel-1" } }],
      })
    }
    if (method === "POST" && path === `/adaccounts/${ACCOUNT}/campaigns`) {
      return reply(ok("campaigns", "campaign", { id: "camp-1" }))
    }
    if (method === "POST" && path === "/campaigns/camp-1/adsquads") {
      return reply(ok("adsquads", "adsquad", { id: "squad-1" }))
    }
    if (method === "POST" && path === `/adaccounts/${ACCOUNT}/media`) {
      return reply(ok("media", "media", { id: "media-1" }))
    }
    if (method === "POST" && path === "/media/media-1/upload") {
      return reply({ request_status: "SUCCESS" })
    }
    if (method === "GET" && path === "/media/media-1") {
      return reply(ok("media", "media", { id: "media-1", media_status: "READY" }))
    }
    if (method === "POST" && path === `/adaccounts/${ACCOUNT}/creatives`) {
      return reply(ok("creatives", "creative", { id: "creative-1" }))
    }
    if (method === "POST" && path === "/adsquads/squad-1/ads") {
      return reply(ok("ads", "ad", { id: "ad-1" }))
    }
    if (options.campaignGone && path === "/campaigns/camp-1") {
      return reply({ request_status: "ERROR", debug_message: "Campaign not found" }, 400)
    }
    if (options.deleteRefused && method === "DELETE") {
      return reply({ request_status: "ERROR", debug_message: "Try again later" }, 500)
    }
    if (method === "GET" && path === "/campaigns/camp-1") {
      return reply(
        ok("campaigns", "campaign", {
          id: "camp-1",
          name: "حملة",
          status: "PAUSED",
          ad_account_id: ACCOUNT,
          updated_at: "x",
          delivery_status: ["y"],
        })
      )
    }
    if (method === "GET" && path === "/adsquads/squad-1") {
      return reply(
        ok("adsquads", "adsquad", {
          id: "squad-1",
          name: "مجموعة",
          status: "ACTIVE",
          campaign_id: "camp-1",
          targeting_reach_status: "VALID",
          delivery_status: ["VALID"],
        })
      )
    }
    if (method === "PUT" && path === "/campaigns/camp-1/adsquads") {
      return reply(ok("adsquads", "adsquad", { id: "squad-1", status: "PAUSED" }))
    }
    if (method === "GET" && path === "/ads/ad-1") {
      return reply(
        ok("ads", "ad", {
          id: "ad-1",
          name: "إعلان",
          status: "PAUSED",
          ad_squad_id: "squad-1",
          review_status: "APPROVED",
        })
      )
    }
    if (method === "PUT" && path === "/adsquads/squad-1/ads") {
      return reply(ok("ads", "ad", { id: "ad-1", status: "ACTIVE" }))
    }
    if (method === "PUT" && path === `/adaccounts/${ACCOUNT}/campaigns`) {
      return reply(ok("campaigns", "campaign", { id: "camp-1" }))
    }
    if (method === "DELETE") return reply({ request_status: "SUCCESS" })
    return reply({ request_status: "ERROR", debug_message: `unexpected ${method} ${path}` }, 404)
  }) as typeof fetch
  return {
    calls,
    publisher: new SnapchatCampaignPublisher({
      apiBaseUrl: "https://snap.test/v1",
      profileApiBaseUrl: "https://snap.test/v1",
      fetch: fetchImpl,
      wait: async () => undefined,
    }),
  }
}

const snapInput = (overrides: Partial<SnapchatPublishInput> = {}): SnapchatPublishInput => ({
  accessToken: "token",
  adAccountId: ACCOUNT,
  name: "حملة الشتاء",
  objective: "traffic",
  dailyBudget: 50,
  startAt: "2026-01-15T09:05:00.000Z",
  endAt: null,
  countryCode: "sa",
  minAge: 25,
  maxAge: 44,
  gender: "male",
  media: { kind: "image", bytes: PNG, contentType: "image/png", fileName: "a.png" },
  brandName: "مدار",
  headline: "كاشير سريع",
  callToAction: "SIGN_UP",
  url: "https://example.com/?utm_source=snapchat",
  startActive: false,
  ...overrides,
})

describe("publishing to Snapchat", () => {
  it("creates the campaign, ad set, media, creative and ad, in that order", async () => {
    const { calls, publisher } = fakeSnapchat()
    const ids = await publisher.publish(snapInput())
    expect(ids).toEqual({
      campaignId: "camp-1",
      adSquadId: "squad-1",
      mediaId: "media-1",
      creativeId: "creative-1",
      adId: "ad-1",
    })
    const writes = calls.filter((call) => call.method !== "GET").map((call) => call.path)
    expect(writes).toEqual([
      `/adaccounts/${ACCOUNT}/campaigns`,
      "/campaigns/camp-1/adsquads",
      `/adaccounts/${ACCOUNT}/media`,
      "/media/media-1/upload",
      `/adaccounts/${ACCOUNT}/creatives`,
      "/adsquads/squad-1/ads",
    ])
    const body = (path: string) =>
      calls.find((call) => call.method === "POST" && call.path === path)?.body as Record<
        string,
        Array<Record<string, unknown>>
      >
    expect(body(`/adaccounts/${ACCOUNT}/campaigns`).campaigns[0]).toMatchObject({
      status: "PAUSED",
      objective_v2_properties: { objective_v2_type: "TRAFFIC" },
    })
    expect(body("/campaigns/camp-1/adsquads").adsquads[0]).toMatchObject({
      daily_budget_micro: 50_000_000,
      optimization_goal: "SWIPES",
      auto_bid: true,
      targeting: {
        geos: [{ country_code: "sa", operation: "INCLUDE" }],
        demographics: [{ min_age: "25", max_age: "44", gender: "MALE", operation: "INCLUDE" }],
      },
    })
    expect(body(`/adaccounts/${ACCOUNT}/creatives`).creatives[0]).toMatchObject({
      type: "WEB_VIEW",
      headline: "كاشير سريع",
      brand_name: "مدار",
      call_to_action: "SIGN_UP",
      top_snap_media_id: "media-1",
      profile_properties: { profile_id: "profile-1" },
    })
  })

  it("measures a sign-ups campaign by the account's pixel, and stops early without one", async () => {
    const withPixel = fakeSnapchat()
    await withPixel.publisher.publish(snapInput({ objective: "leads", startActive: true }))
    const squad = withPixel.calls.find((call) => call.path === "/campaigns/camp-1/adsquads")
      ?.body as { adsquads: Array<Record<string, unknown>> }
    expect(squad.adsquads[0]).toMatchObject({
      optimization_goal: "PIXEL_SIGNUP",
      pixel_id: "pixel-1",
    })

    const without = fakeSnapchat({ noPixel: true })
    await expect(
      without.publisher.publish(snapInput({ objective: "leads" }))
    ).rejects.toMatchObject({
      code: "SNAPCHAT_NO_PIXEL",
    })
    // Nothing was created.
    expect(without.calls.every((call) => call.method === "GET")).toBe(true)
  })

  it("stops before creating anything when the account has no public profile", async () => {
    const { calls, publisher } = fakeSnapchat({ noProfile: true })
    await expect(publisher.publish(snapInput())).rejects.toMatchObject({
      code: "SNAPCHAT_NO_PUBLIC_PROFILE",
    })
    expect(calls.every((call) => call.method === "GET")).toBe(true)
  })

  it("deletes the campaign when a later step is refused, and reports Snapchat's reason", async () => {
    const { calls, publisher } = fakeSnapchat({ refuse: "/creatives" })
    const error = await publisher.publish(snapInput()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SnapchatPublishError)
    expect(error).toMatchObject({ step: "creative", reason: "Headline is too long" })
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/campaigns/camp-1" })
  })

  it("switches a campaign on by sending it back with only its status changed", async () => {
    const { calls, publisher } = fakeSnapchat()
    await publisher.setCampaignStatus({
      accessToken: "token",
      adAccountId: ACCOUNT,
      campaignId: "camp-1",
      active: true,
    })
    const put = calls.find((call) => call.method === "PUT")?.body as {
      campaigns: Array<Record<string, unknown>>
    }
    expect(put.campaigns[0]).toEqual({
      id: "camp-1",
      name: "حملة",
      status: "ACTIVE",
      ad_account_id: ACCOUNT,
    })
  })

  it("deletes a campaign, and counts one already gone from Snapchat as deleted", async () => {
    const there = fakeSnapchat()
    await there.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })
    expect(there.calls).toEqual([{ method: "DELETE", path: "/campaigns/camp-1", body: null }])

    const gone = fakeSnapchat({ campaignGone: true })
    await gone.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })

    // Still on Snapchat and not deleted: the refusal stands.
    const refused = fakeSnapchat({ deleteRefused: true })
    await expect(
      refused.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })
    ).rejects.toMatchObject({ reason: "Try again later" })
  })
})

describe("switching and deleting an ad set or an ad on Snapchat", () => {
  it("sends each one back through its parent, without the fields only Snapchat writes", async () => {
    const { calls, publisher } = fakeSnapchat()
    await publisher.setEntityStatus({
      accessToken: "token",
      level: "ad_set",
      id: "squad-1",
      active: false,
    })
    await publisher.setEntityStatus({ accessToken: "token", level: "ad", id: "ad-1", active: true })
    const puts = calls.filter((call) => call.method === "PUT")
    expect(puts.map((call) => call.path)).toEqual([
      "/campaigns/camp-1/adsquads",
      "/adsquads/squad-1/ads",
    ])
    expect((puts[0].body as { adsquads: unknown[] }).adsquads[0]).toEqual({
      id: "squad-1",
      name: "مجموعة",
      status: "PAUSED",
      campaign_id: "camp-1",
    })
    expect((puts[1].body as { ads: unknown[] }).ads[0]).toEqual({
      id: "ad-1",
      name: "إعلان",
      status: "ACTIVE",
      ad_squad_id: "squad-1",
    })
  })

  it("says so when the thing is no longer on Snapchat, and deletes by its own path", async () => {
    const gone = fakeSnapchat({ campaignGone: true })
    await expect(
      gone.publisher.setEntityStatus({
        accessToken: "token",
        level: "campaign",
        id: "camp-1",
        active: true,
      })
    ).rejects.toMatchObject({ code: "SNAPCHAT_GONE" })

    const { calls, publisher } = fakeSnapchat()
    await publisher.deleteEntity({ accessToken: "token", level: "ad", id: "ad-1" })
    await publisher.deleteEntity({ accessToken: "token", level: "ad_set", id: "squad-1" })
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "DELETE /ads/ad-1",
      "DELETE /adsquads/squad-1",
    ])
  })
})

describe("the creative library and the publish record", () => {
  let database: PostgresDatabase
  let storage: ReturnType<typeof memoryStorage>
  let creatives: CampaignCreativesService

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
    storage = memoryStorage()
    creatives = new CampaignCreativesService(database, storage)
  })

  afterEach(async () => {
    await database.end()
  })

  const upload = (overrides: Record<string, unknown> = {}) =>
    creatives.upload({
      organizationId: ORG,
      workspaceId: null,
      userId: USER,
      name: "عرض الشتاء",
      contentType: "image/png",
      dataBase64: PNG.toString("base64"),
      width: 1080,
      height: 1920,
      ...overrides,
    })

  it("keeps an uploaded creative, and refuses a file that is not what it says", async () => {
    const image = await upload()
    expect(image).toMatchObject({ kind: "image", width: 1080, height: 1920, sizeBytes: PNG.length })
    expect(image.url).toBe(`https://files.test/campaign-creatives/${ORG}/${image.id}.png`)
    const video = await upload({
      contentType: "video/mp4",
      dataBase64: MP4.toString("base64"),
      durationSeconds: 12.5,
    })
    expect(video).toMatchObject({ kind: "video", durationSeconds: 12.5 })

    await expect(
      upload({ contentType: "image/jpeg", dataBase64: PNG.toString("base64") })
    ).rejects.toMatchObject({ code: "CREATIVE_INVALID_FILE" })
    await expect(
      upload({
        dataBase64: Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]).toString("base64"),
      })
    ).rejects.toMatchObject({ code: "CREATIVE_TOO_LARGE" })

    expect((await creatives.list(ORG)).map((entry) => entry.id).sort()).toEqual(
      [image.id, video.id].sort()
    )
    // Another organization sees none of it.
    expect(await creatives.list(OTHER_ORG)).toEqual([])
    await expect(creatives.get(OTHER_ORG, image.id)).rejects.toMatchObject({
      code: "CREATIVE_NOT_FOUND",
    })

    await creatives.remove(ORG, image.id)
    expect((await creatives.list(ORG)).map((entry) => entry.id)).toEqual([video.id])
  })

  it("judges whether a creative fits Snapchat, and names the campaign in the address", async () => {
    const fits = await upload()
    expect(snapchatCreativeProblem(fits)).toBeNull()
    expect(snapchatCreativeProblem({ ...fits, width: 1080, height: 1080 })).toBe("ratio")
    expect(snapchatCreativeProblem({ ...fits, width: 540, height: 960 })).toBe("small")
    expect(snapchatCreativeProblem({ ...fits, kind: "video", durationSeconds: 2 })).toBe("duration")
    expect(snapchatCreativeProblem({ ...fits, width: null, height: null })).toBeNull()

    expect(withCampaignTracking("https://shop.sa/offers?x=1", "عروض الشتاء 2026")).toBe(
      "https://shop.sa/offers?x=1&utm_source=snapchat&utm_medium=paid_social&utm_campaign=" +
        encodeURIComponent("عروض_الشتاء_2026")
    )
    expect(withCampaignTracking("https://shop.sa/?utm_source=mine", "x")).toBe(
      "https://shop.sa/?utm_source=mine"
    )
  })

  function service(snap = fakeSnapchat(), now = new Date("2026-01-15T06:00:00Z")) {
    return {
      snap,
      publishing: new CampaignPublishingService(
        database,
        creatives,
        { resolveAccessToken: async () => "token" },
        snap.publisher,
        () => now
      ),
    }
  }

  type SnapchatInput = Extract<PublishCampaignInput, { platform: "snapchat" }>
  const request = (creativeId: string, overrides: Partial<SnapchatInput> = {}) =>
    ({
      platform: "snapchat",
      connectionId: CONNECTION,
      adAccountId: ACCOUNT,
      name: "حملة الشتاء",
      objective: "traffic",
      dailyBudget: 50,
      startDate: "2026-01-15",
      endDate: "2026-01-20",
      countryCode: "sa",
      minAge: 25,
      maxAge: null,
      gender: "all",
      creativeId,
      brandName: "مدار",
      headline: "كاشير سريع",
      callToAction: "SIGN_UP",
      url: "https://example.com/offer",
      startActive: false,
      ...overrides,
    }) satisfies SnapchatInput

  it("lists the connected accounts, publishes in the background and keeps the record", async () => {
    const { publishing, snap } = service()
    const creative = await upload()
    expect((await publishing.options(actor)).snapchat.accounts).toEqual([
      { connectionId: CONNECTION, adAccountId: ACCOUNT, name: "Madar", currency: "SAR" },
    ])
    expect(
      (await publishing.options({ ...actor, organizationId: OTHER_ORG })).snapchat.accounts
    ).toEqual([])

    const started = await publishing.publish(actor, request(creative.id))
    expect(started).toMatchObject({
      status: "publishing",
      currency: "SAR",
      platformStatus: "paused",
      // Today: five minutes from now. The end date runs to its last minute in Riyadh.
      startAt: "2026-01-15T06:05:00.000Z",
      endAt: "2026-01-20T20:59:00.000Z",
    })
    expect(started.url).toContain("utm_source=snapchat")

    await publishing.settled()
    const done = await publishing.get(ORG, started.id)
    expect(done).toMatchObject({ status: "published", externalCampaignId: "camp-1", error: null })
    expect(snap.calls.some((call) => call.path === "/media/media-1/upload")).toBe(true)
    expect((await publishing.list(ORG)).map((entry) => entry.id)).toEqual([started.id])
    await expect(publishing.get(OTHER_ORG, started.id)).rejects.toMatchObject({
      code: "PUBLICATION_NOT_FOUND",
    })

    const on = await publishing.setActive(actor, started.id, true)
    expect(on.platformStatus).toBe("active")
  })

  it("removes a published campaign from Snapchat and from the list", async () => {
    const { publishing, snap } = service()
    const creative = await upload()
    const started = await publishing.publish(actor, request(creative.id))
    await publishing.settled()
    // Not while it is still being published.
    const setStatus = (status: string) =>
      database.query(`update campaign_publications set status = $2 where id = $1`, [
        started.id,
        status,
      ])
    await setStatus("publishing")
    await expect(publishing.remove(actor, started.id)).rejects.toMatchObject({
      code: "PUBLICATION_STILL_PUBLISHING",
    })
    await setStatus("published")
    // Not by another organization.
    await expect(
      publishing.remove({ ...actor, organizationId: OTHER_ORG }, started.id)
    ).rejects.toMatchObject({ code: "PUBLICATION_NOT_FOUND" })

    await publishing.remove(actor, started.id)
    expect(snap.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/campaigns/camp-1" })
    expect(await publishing.list(ORG)).toEqual([])
  })

  it("keeps a campaign on the list when Snapchat refuses to delete it", async () => {
    const { publishing } = service(fakeSnapchat({ deleteRefused: true }))
    const creative = await upload()
    const started = await publishing.publish(actor, request(creative.id))
    await publishing.settled()
    await expect(publishing.remove(actor, started.id)).rejects.toMatchObject({
      code: "SNAPCHAT_REFUSED",
    })
    expect((await publishing.list(ORG)).map((entry) => entry.id)).toEqual([started.id])
  })

  it("takes a campaign already deleted on Snapchat off the list", async () => {
    const { publishing } = service()
    const creative = await upload()
    const started = await publishing.publish(actor, request(creative.id))
    await publishing.settled()
    const gone = service(fakeSnapchat({ campaignGone: true }))
    await gone.publishing.remove(actor, started.id)
    expect(await publishing.list(ORG)).toEqual([])
  })

  it("renames a creative, within its own organization only", async () => {
    const creative = await upload()
    expect((await creatives.rename(ORG, creative.id, "  عرض الصيف  ")).name).toBe("عرض الصيف")
    await expect(creatives.rename(OTHER_ORG, creative.id, "x")).rejects.toMatchObject({
      code: "CREATIVE_NOT_FOUND",
    })
  })

  it("adds up each creative's numbers, lists its campaigns and ranks by tap rate", async () => {
    const insights = new CreativeInsightsService(database)
    const strong = await upload({ name: "قوي" })
    const weak = await upload({ name: "ضعيف" })
    const fresh = await upload({ name: "جديد" })
    await upload({ name: "غير مستخدم" })

    // One published campaign per ad; "strong" is used twice.
    const publish = async (creativeId: string, adId: string, name: string) => {
      await database.query(
        `insert into campaign_publications
           (id, organization_id, platform, connection_id, ad_account_id, name, objective, currency,
            daily_budget, start_at, creative_id, brand_name, headline, call_to_action,
            destination_url, status, platform_status, external_ids)
         values ($1, $2, 'snapchat', $3, $4, $5, 'leads', 'SAR', 50, now(), $6, 'b', 'h', 'MORE',
                 'https://x.sa', 'published', 'active', $7::jsonb)`,
        [randomUUID(), ORG, CONNECTION, ACCOUNT, name, creativeId, JSON.stringify({ adId })]
      )
    }
    await publish(strong.id, "ad-a", "حملة أ")
    await publish(strong.id, "ad-b", "حملة ب")
    await publish(weak.id, "ad-c", "حملة ج")
    await publish(fresh.id, "ad-d", "حملة د")

    const day = async (level: string, entityId: string, date: string, stats: object) => {
      await database.query(
        `insert into snapchat_records
           (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
         values ($1, $2, $3, 'stats', $4, $5, $6::jsonb)`,
        [
          randomUUID(),
          CONNECTION,
          ACCOUNT,
          `${level}:${entityId}:${date}`,
          date,
          JSON.stringify({ level, entityId, startTime: `${date}T00:00:00Z`, ...stats }),
        ]
      )
    }
    await day("ad", "ad-a", "2026-01-10", { impressions: 1000, swipes: 30, spend: 20_000_000 })
    await day("ad", "ad-a", "2026-01-11", {
      impressions: 1000,
      swipes: 30,
      spend: 20_000_000,
      conversion_sign_ups: 2,
    })
    await day("ad", "ad-b", "2026-01-10", { impressions: 2000, swipes: 20, spend: 10_000_000 })
    await day("ad", "ad-c", "2026-01-10", { impressions: 5000, swipes: 25, spend: 60_000_000 })
    await day("ad", "ad-d", "2026-01-10", { impressions: 200, swipes: 20, spend: 2_000_000 })
    // Not an ad of ours, and not ad-level: neither is counted.
    await day("ad", "someone-else", "2026-01-10", { impressions: 9999, swipes: 999 })
    await day("campaign", "ad-a", "2026-01-10", { impressions: 7777, swipes: 777 })

    const all = await insights.forOrganization(ORG)
    const of = (id: string) => all.find((entry) => entry.creativeId === id)
    expect(all).toHaveLength(3)
    expect(of(strong.id)).toMatchObject({
      impressions: 4000,
      clicks: 80,
      spend: 50,
      signUps: 2,
      clickRate: 2,
      costPerSignUp: 25,
      rank: 1,
      rankedOutOf: 2,
      currency: "SAR",
    })
    expect(
      of(strong.id)
        ?.campaigns.map((campaign) => [campaign.name, campaign.impressions])
        .sort()
    ).toEqual([
      ["حملة أ", 2000],
      ["حملة ب", 2000],
    ])
    expect(of(weak.id)).toMatchObject({ clickRate: 0.5, rank: 2, costPerSignUp: null })
    // Seen too little to be judged: a high tap rate on 200 views does not take first place.
    expect(of(fresh.id)).toMatchObject({ impressions: 200, clickRate: 10, rank: null })
    expect(await insights.forOrganization(OTHER_ORG)).toEqual([])
  })

  describe("the campaigns list controls", () => {
    const rowId = (id: string) => `snapchat_ads:${CONNECTION}:${ACCOUNT}:${id}`
    const record = (type: string, id: string, payload: object) =>
      database.query(
        `insert into snapchat_records
           (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
         values ($1, $2, $3, $4, $5, '2026-01-10', $6::jsonb)`,
        [randomUUID(), CONNECTION, ACCOUNT, type, id, JSON.stringify(payload)]
      )
    const stored = async (type: string) =>
      (
        await database.query<{ entity_id: string; payload: unknown }>(
          `select entity_id, payload from snapchat_records where entity_type = $1`,
          [type]
        )
      ).rows.map((row) => [
        row.entity_id,
        (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload).status,
      ])
    const control = (snap = fakeSnapchat()) => ({
      snap,
      service: new CampaignControlService(database, {
        snapchat: { access: { resolveAccessToken: async () => "token" }, api: snap.publisher },
      }),
    })
    const seed = async () => {
      await record("campaigns", "camp-1", { name: "حملة", status: "PAUSED" })
      await record("campaigns", "camp-2", { name: "أخرى", status: "ACTIVE" })
      await record("ad_squads", "squad-1", { status: "ACTIVE", campaign_id: "camp-1" })
      await record("ad_squads", "squad-9", { status: "ACTIVE", campaign_id: "camp-2" })
      await record("ads", "ad-1", { status: "PAUSED", ad_squad_id: "squad-1" })
      await record("ads", "ad-9", { status: "ACTIVE", ad_squad_id: "squad-9" })
    }

    it("switches each level on Snapchat and corrects Madar's own copy", async () => {
      await seed()
      const { service, snap } = control()
      expect(await service.setActive(actor, rowId("camp-1"), "campaign", true)).toEqual({
        id: rowId("camp-1"),
        status: "ACTIVE",
      })
      await service.setActive(actor, rowId("squad-1"), "adGroup", false)
      await service.setActive(actor, rowId("ad-1"), "ad", true)
      expect(snap.calls.filter((call) => call.method === "PUT")).toHaveLength(3)
      expect((await stored("campaigns")).sort()).toEqual([
        ["camp-1", "ACTIVE"],
        ["camp-2", "ACTIVE"],
      ])
      expect(await stored("ad_squads")).toContainEqual(["squad-1", "PAUSED"])
      expect(await stored("ads")).toContainEqual(["ad-1", "ACTIVE"])
    })

    it("refuses another organization, an unknown row and a platform it cannot change", async () => {
      await seed()
      const { service, snap } = control()
      await expect(
        service.setActive(
          { ...actor, organizationId: OTHER_ORG },
          rowId("camp-1"),
          "campaign",
          true
        )
      ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
      // An ad's id asked for as a campaign is not a campaign of theirs.
      await expect(service.remove(actor, rowId("ad-1"), "campaign")).rejects.toMatchObject({
        code: "CAMPAIGN_CONTROL_NOT_FOUND",
      })
      // An unknown source, and a platform this service was not given.
      await expect(
        service.setActive(actor, "other_ads:x:y:z", "campaign", true)
      ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_SUPPORTED" })
      await expect(
        service.setActive(actor, "google_ads:x:y:z", "campaign", true)
      ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_SUPPORTED" })
      expect(snap.calls).toEqual([])
    })

    it("deletes a campaign with what is under it, and its record of being published", async () => {
      await seed()
      const { publishing } = service()
      const creative = await upload()
      const started = await publishing.publish(actor, request(creative.id))
      await publishing.settled()

      const { service: controls, snap } = control()
      await controls.remove(actor, rowId("camp-1"), "campaign")
      expect(snap.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/campaigns/camp-1" })
      expect(await stored("campaigns")).toEqual([["camp-2", "ACTIVE"]])
      expect(await stored("ad_squads")).toEqual([["squad-9", "ACTIVE"]])
      expect(await stored("ads")).toEqual([["ad-9", "ACTIVE"]])
      await expect(publishing.get(ORG, started.id)).rejects.toMatchObject({
        code: "PUBLICATION_NOT_FOUND",
      })
    })

    it("deletes one ad group with its ads only, and keeps everything when Snapchat refuses", async () => {
      await seed()
      const refused = control(fakeSnapchat({ deleteRefused: true }))
      await expect(
        refused.service.remove(actor, rowId("squad-1"), "adGroup")
      ).rejects.toMatchObject({ code: "SNAPCHAT_REFUSED" })
      expect(await stored("ad_squads")).toHaveLength(2)

      await control().service.remove(actor, rowId("squad-1"), "adGroup")
      expect(await stored("ad_squads")).toEqual([["squad-9", "ACTIVE"]])
      expect(await stored("ads")).toEqual([["ad-9", "ACTIVE"]])
      expect(await stored("campaigns")).toHaveLength(2)
    })

    it("adds an ad to an ad group that exists, and changes its daily budget", async () => {
      await seed()
      const calls: Array<{ action: string; input: Record<string, unknown> }> = []
      const service = new CampaignControlService(
        database,
        {
          snapchat: {
            access: { resolveAccessToken: async () => "token" },
            api: {
              setEntityStatus: async () => ({}),
              deleteEntity: async () => undefined,
              addAd: async (input) => {
                calls.push({ action: "addAd", input })
                return { adId: "ad-new", ad: { id: "ad-new", review_status: "PENDING" } }
              },
              setAdSquadBudget: async (input) => {
                calls.push({ action: "budget", input })
                return { id: "squad-1", daily_budget_micro: 90_000_000 }
              },
            },
          },
        },
        creatives
      )
      const creative = await upload()
      const ad = {
        name: "إعلان جديد",
        url: "https://example.com/offer",
        creativeId: creative.id,
        brandName: "مدار",
        headline: "كاشير سريع",
        callToAction: "SIGN_UP",
      }

      expect(await service.addAd(actor, rowId("squad-1"), ad)).toEqual({ adId: "ad-new" })
      expect(calls[0].input).toMatchObject({
        accessToken: "token",
        adAccountId: ACCOUNT,
        adSquadId: "squad-1",
        name: "إعلان جديد",
        brandName: "مدار",
        headline: "كاشير سريع",
        callToAction: "SIGN_UP",
        url: expect.stringContaining("utm_source=snapchat"),
      })
      expect((calls[0].input.media as { kind: string }).kind).toBe("image")
      // The new ad is on Madar's list at once, under its ad group.
      const copy = await database.query<{ payload: unknown }>(
        `select payload from snapchat_records where entity_type = 'ads' and entity_id = 'ad-new'`
      )
      const payload = copy.rows[0].payload
      expect(typeof payload === "string" ? JSON.parse(payload) : payload).toMatchObject({
        name: "إعلان جديد",
        status: "ACTIVE",
        ad_squad_id: "squad-1",
      })

      expect(await service.setDailyBudget(actor, rowId("squad-1"), 90)).toEqual({
        id: rowId("squad-1"),
        dailyBudget: 90,
      })
      expect(calls[1]).toEqual({
        action: "budget",
        input: { accessToken: "token", adSquadId: "squad-1", dailyBudget: 90 },
      })

      // Refused before Snapchat is asked: a missing field, a file that does not fit, a budget
      // under the floor, another organization's ad group, and an ad group that is not there.
      const square = await upload({ width: 1080, height: 1080 })
      await expect(
        service.addAd(actor, rowId("squad-1"), { ...ad, headline: "" })
      ).rejects.toMatchObject({ code: "CAMPAIGN_AD_INCOMPLETE" })
      await expect(
        service.addAd(actor, rowId("squad-1"), { ...ad, creativeId: square.id })
      ).rejects.toMatchObject({ code: "PUBLISH_CREATIVE_NOT_SUITABLE" })
      await expect(service.setDailyBudget(actor, rowId("squad-1"), 5)).rejects.toMatchObject({
        code: "PUBLISH_BUDGET_TOO_LOW",
      })
      await expect(
        service.addAd({ ...actor, organizationId: OTHER_ORG }, rowId("squad-1"), ad)
      ).rejects.toMatchObject({ code: "CAMPAIGN_CONTROL_NOT_FOUND" })
      await expect(service.addAd(actor, rowId("squad-404"), ad)).rejects.toMatchObject({
        code: "CAMPAIGN_CONTROL_NOT_FOUND",
      })
      expect(calls).toHaveLength(2)
    })
  })

  it("refuses what it can judge itself before anything reaches Snapchat", async () => {
    const { publishing, snap } = service()
    const creative = await upload()
    const square = await upload({ width: 1080, height: 1080 })
    const cases: Array<[Partial<SnapchatInput>, string]> = [
      [{ adAccountId: "someone-else" }, "PUBLISH_ACCOUNT_NOT_CONNECTED"],
      [{ dailyBudget: 5 }, "PUBLISH_BUDGET_TOO_LOW"],
      [{ startDate: "2026-01-14" }, "PUBLISH_START_IN_PAST"],
      [{ endDate: "2026-01-10" }, "PUBLISH_END_BEFORE_START"],
      [{ minAge: 30, maxAge: 25 }, "PUBLISH_AGE_RANGE"],
      [{ url: "http://example.com" }, "PUBLISH_INVALID_URL"],
      [{ creativeId: square.id }, "PUBLISH_CREATIVE_NOT_SUITABLE"],
      [{ creativeId: randomUUID() }, "CREATIVE_NOT_FOUND"],
    ]
    for (const [overrides, code] of cases) {
      await expect(
        publishing.publish(actor, request(creative.id, overrides))
      ).rejects.toMatchObject({ code })
    }
    expect(snap.calls).toEqual([])
    expect(await publishing.list(ORG)).toEqual([])
  })

  it("records Snapchat's reason when a publish fails, and what was cut short", async () => {
    const { publishing } = service(fakeSnapchat({ refuse: "/creatives" }))
    const creative = await upload()
    const started = await publishing.publish(actor, request(creative.id))
    await publishing.settled()
    const failed = await publishing.get(ORG, started.id)
    expect(failed).toMatchObject({
      status: "failed",
      error: { code: "SNAPCHAT_REFUSED", step: "creative", reason: "Headline is too long" },
    })
    await expect(publishing.setActive(actor, started.id, true)).rejects.toMatchObject({
      code: "PUBLICATION_NOT_PUBLISHED",
    })

    // A publish still marked as running long after it started was interrupted.
    await database.query(
      `update campaign_publications set status = 'publishing', updated_at = $2 where id = $1`,
      [started.id, "2026-01-15T05:00:00Z"]
    )
    expect(await publishing.get(ORG, started.id)).toMatchObject({
      status: "failed",
      error: { code: "PUBLISH_INTERRUPTED" },
    })
  })

  // ---- TikTok, Meta and Google Ads ----

  const TIKTOK_CONNECTION = "40000000-0000-0000-0000-000000000002"
  const META_CONNECTION = "40000000-0000-0000-0000-000000000003"
  const META_READ_ONLY = "40000000-0000-0000-0000-000000000004"
  const GOOGLE_CONNECTION = "40000000-0000-0000-0000-000000000005"

  async function connectOthers() {
    for (const [table, id, scopes] of [
      ["tiktok_ads_oauth_connections", TIKTOK_CONNECTION, []],
      ["meta_oauth_connections", META_CONNECTION, ["ads_read", "ads_management"]],
      ["meta_oauth_connections", META_READ_ONLY, ["ads_read"]],
    ] as const) {
      await database.query(
        `insert into ${table}
           (id, organization_id, project_id, status, scopes, created_by_user_id, updated_by_user_id)
         values ($1, $2, $3, 'connected', $4::jsonb, $5, $5)`,
        [id, ORG, randomUUID(), JSON.stringify(scopes), USER]
      )
    }
    await database.query(
      `insert into integration_connections
         (id, provider_id, provider_family, platform, organization_id, project_id, status,
          created_by_user_id, updated_by_user_id)
       values ($1, 'google_ads', 'google', 'google_ads', $2, $3, 'connected', $4, $4)`,
      [GOOGLE_CONNECTION, ORG, randomUUID(), USER]
    )
    // Google's ad accounts point at both the first connections table and the shared one.
    await database.query(
      `insert into google_oauth_connections
         (id, organization_id, project_id, status, created_by_user_id, updated_by_user_id)
       values ($1, $2, $3, 'connected', $4, $4)`,
      [GOOGLE_CONNECTION, ORG, randomUUID(), USER]
    )
    for (const [table, connection, account] of [
      ["tiktok_ads_accounts", TIKTOK_CONNECTION, "7700"],
      ["meta_ads_accounts", META_CONNECTION, "act_55"],
      ["meta_ads_accounts", META_READ_ONLY, "act_66"],
    ] as const) {
      await database.query(
        `insert into ${table} (id, connection_id, account_id, account_name, currency_code)
         values ($1, $2, $3, 'Madar', 'SAR')`,
        [randomUUID(), connection, account]
      )
    }
    await database.query(
      `insert into google_ads_customer_accounts
         (id, connection_id, customer_id, display_name, currency_code)
       values ($1, $2, '273-911-1244', 'Madar', 'SAR')`,
      [randomUUID(), GOOGLE_CONNECTION]
    )
  }

  // Stand-ins for the three publishers: they record what they were handed.
  function others(refuse: "tiktok" | null = null) {
    const calls: Array<{ platform: string; action: string; input: Record<string, unknown> }> = []
    const record =
      (platform: string, action: string, ids: Record<string, string> = {}) =>
      async (input: object) => {
        calls.push({ platform, action, input: input as Record<string, unknown> })
        if (platform === refuse && action === "publish") {
          throw new PlatformPublishError(
            "tiktok",
            "account",
            "No pixel on the account.",
            "NO_PIXEL"
          )
        }
        return ids as never
      }
    const token = { resolveAccessToken: async (id: string) => `token-${id.slice(-1)}` }
    const publishing = new CampaignPublishingService(
      database,
      creatives,
      token,
      fakeSnapchat().publisher,
      () => new Date("2026-01-15T06:00:00Z"),
      {
        tiktok: {
          access: token,
          api: {
            publish: record("tiktok", "publish", {
              campaignId: "tt-campaign",
              adGroupId: "tt-group",
              videoId: "tt-video",
              adId: "tt-ad",
            }),
            setCampaignStatus: record("tiktok", "status"),
            deleteCampaign: record("tiktok", "delete"),
          },
        },
        meta: {
          access: token,
          api: {
            publish: record("meta", "publish", {
              campaignId: "fb-campaign",
              adSetId: "fb-set",
              creativeId: "fb-creative",
              adId: "fb-ad",
            }),
            setCampaignStatus: record("meta", "status"),
            deleteCampaign: record("meta", "delete"),
          },
        },
        google: {
          api: {
            publish: record("google", "publish", {
              campaignId: "g-campaign",
              budgetResourceName: "customers/2739111244/campaignBudgets/1",
              adGroupId: "g-group",
              adId: "g-ad",
            }),
            setCampaignStatus: record("google", "status"),
            deleteCampaign: record("google", "delete"),
          },
        },
      }
    )
    return { publishing, calls }
  }

  const common = {
    name: "حملة الشتاء",
    objective: "traffic",
    dailyBudget: 100,
    startDate: "2026-01-15",
    endDate: null,
    countryCode: "sa",
    minAge: 25,
    maxAge: 44,
    gender: "all",
    url: "https://example.com/offer",
    startActive: false,
  } as const
  const video = () =>
    upload({
      contentType: "video/mp4",
      dataBase64: MP4.toString("base64"),
      durationSeconds: 20,
    })
  const googleRequest = {
    ...common,
    platform: "google",
    connectionId: GOOGLE_CONNECTION,
    adAccountId: "273-911-1244",
    headlines: ["كاشير سريع", "فواتير إلكترونية", "جرّبه مجانًا"],
    descriptions: ["نظام كاشير سعودي متوافق مع الفوترة.", "ابدأ خلال دقائق."],
    keywords: ["برنامج كاشير", "نظام نقاط بيع"],
  } satisfies PublishCampaignInput

  it("offers the connected accounts of each platform, and Meta only when it may manage ads", async () => {
    await connectOthers()
    const options = await others().publishing.options(actor)
    expect(options.tiktok.accounts).toEqual([
      { connectionId: TIKTOK_CONNECTION, adAccountId: "7700", name: "Madar", currency: "SAR" },
    ])
    // The read-only Meta connection's account is not offered.
    expect(options.meta).toEqual({
      accounts: [
        { connectionId: META_CONNECTION, adAccountId: "act_55", name: "Madar", currency: "SAR" },
      ],
      needsPermission: false,
    })
    expect(options.google.accounts.map((account) => account.adAccountId)).toEqual(["273-911-1244"])
    expect(options.limits.minDailyBudgets).toMatchObject({ snapchat: 20, tiktok: 75 })

    // With only the read-only connection left, Meta says a permission is missing.
    await database.query(`update meta_oauth_connections set status = 'paused' where id = $1`, [
      META_CONNECTION,
    ])
    expect((await others().publishing.options(actor)).meta).toEqual({
      accounts: [],
      needsPermission: true,
    })
    // A service built without the other platforms offers none of them.
    expect((await service().publishing.options(actor)).tiktok.accounts).toEqual([])
  })

  it("publishes a video to TikTok and a picture to Meta, each with its own text", async () => {
    await connectOthers()
    const { publishing, calls } = others()
    const clip = await video()
    const picture = await upload()

    const tiktok = await publishing.publish(actor, {
      ...common,
      platform: "tiktok",
      connectionId: TIKTOK_CONNECTION,
      adAccountId: "7700",
      creativeId: clip.id,
      brandName: "مدار",
      headline: "حجوزاتك مرتّبة بدون دفاتر",
      callToAction: "SIGN_UP",
    })
    const meta = await publishing.publish(actor, {
      ...common,
      platform: "meta",
      connectionId: META_CONNECTION,
      adAccountId: "act_55",
      creativeId: picture.id,
      headline: "كاشير سريع",
      text: "نظام سعودي واحد يدير البيع والمخزون.",
      callToAction: "LEARN_MORE",
    })
    await publishing.settled()

    const sent = (platform: string) =>
      calls.find((call) => call.platform === platform && call.action === "publish")?.input
    expect(sent("tiktok")).toMatchObject({
      accessToken: "token-2",
      advertiserId: "7700",
      text: "حجوزاتك مرتّبة بدون دفاتر",
      brandName: "مدار",
      callToAction: "SIGN_UP",
      dailyBudget: 100,
      countryCode: "sa",
      minAge: 25,
      maxAge: 44,
      url: expect.stringContaining("utm_source=tiktok"),
    })
    expect((sent("tiktok")?.media as { kind: string }).kind).toBe("video")
    expect(sent("meta")).toMatchObject({
      accessToken: "token-3",
      adAccountId: "act_55",
      headline: "كاشير سريع",
      text: "نظام سعودي واحد يدير البيع والمخزون.",
      url: expect.stringContaining("utm_source=meta"),
    })
    expect(await publishing.get(ORG, tiktok.id)).toMatchObject({
      platform: "tiktok",
      status: "published",
      externalCampaignId: "tt-campaign",
    })
    expect(await publishing.get(ORG, meta.id)).toMatchObject({
      platform: "meta",
      status: "published",
      externalCampaignId: "fb-campaign",
      details: { text: "نظام سعودي واحد يدير البيع والمخزون." },
    })

    // Its switch and its removal go to the platform that holds it.
    await publishing.setActive(actor, tiktok.id, true)
    await publishing.remove(actor, meta.id)
    expect(calls.slice(-2)).toEqual([
      {
        platform: "tiktok",
        action: "status",
        input: {
          accessToken: "token-2",
          advertiserId: "7700",
          campaignId: "tt-campaign",
          active: true,
        },
      },
      {
        platform: "meta",
        action: "delete",
        input: { accessToken: "token-3", campaignId: "fb-campaign" },
      },
    ])
    expect((await publishing.list(ORG)).map((entry) => entry.platform)).toEqual(["tiktok"])
  })

  it("publishes a Google search campaign from text and keywords, with no creative", async () => {
    await connectOthers()
    const { publishing, calls } = others()
    const started = await publishing.publish(actor, googleRequest)
    await publishing.settled()

    expect(calls[0]).toMatchObject({
      platform: "google",
      action: "publish",
      input: {
        connectionId: GOOGLE_CONNECTION,
        // Digits only, as Google's API addresses an account.
        customerId: "2739111244",
        startDate: "2026-01-15",
        endDate: null,
        headlines: googleRequest.headlines,
        descriptions: googleRequest.descriptions,
        keywords: googleRequest.keywords,
        url: expect.stringContaining("utm_source=google&utm_medium=cpc"),
      },
    })
    expect(await publishing.get(ORG, started.id)).toMatchObject({
      platform: "google",
      status: "published",
      creativeId: null,
      headline: "كاشير سريع",
      externalCampaignId: "g-campaign",
      details: { keywords: ["برنامج كاشير", "نظام نقاط بيع"] },
    })
    await publishing.remove(actor, started.id)
    expect(calls.at(-1)).toMatchObject({
      platform: "google",
      action: "delete",
      input: { customerId: "2739111244", campaignId: "g-campaign" },
    })
  })

  it("refuses what does not fit a platform before asking it for anything", async () => {
    await connectOthers()
    const { publishing, calls } = others()
    const picture = await upload()
    const tiktok = {
      ...common,
      platform: "tiktok",
      connectionId: TIKTOK_CONNECTION,
      adAccountId: "7700",
      creativeId: picture.id,
      brandName: "مدار",
      headline: "نص الإعلان",
      callToAction: "SIGN_UP",
    } satisfies PublishCampaignInput

    // TikTok shows videos only, and its daily budget starts higher.
    await expect(publishing.publish(actor, tiktok)).rejects.toMatchObject({
      code: "PUBLISH_CREATIVE_NOT_SUITABLE",
      details: { problem: "video_only" },
    })
    await expect(publishing.publish(actor, { ...tiktok, dailyBudget: 50 })).rejects.toMatchObject({
      code: "PUBLISH_BUDGET_TOO_LOW",
      details: { minimum: 75 },
    })
    // A Meta account whose connection may only read is not a place to publish to.
    await expect(
      publishing.publish(actor, {
        ...common,
        platform: "meta",
        connectionId: META_READ_ONLY,
        adAccountId: "act_66",
        creativeId: picture.id,
        headline: "كاشير سريع",
        text: "نص",
        callToAction: "LEARN_MORE",
      })
    ).rejects.toMatchObject({ code: "PUBLISH_ACCOUNT_NOT_CONNECTED" })
    // Google needs three headlines.
    await expect(
      publishing.publish(actor, { ...googleRequest, headlines: ["واحد", "اثنان"] })
    ).rejects.toMatchObject({
      code: "PUBLISH_TEXT_NOT_SUITABLE",
      details: { problem: "headlines" },
    })
    expect(calls).toEqual([])
  })

  it("records the platform's own reason when TikTok refuses", async () => {
    await connectOthers()
    const { publishing } = others("tiktok")
    const clip = await video()
    const started = await publishing.publish(actor, {
      ...common,
      platform: "tiktok",
      connectionId: TIKTOK_CONNECTION,
      adAccountId: "7700",
      creativeId: clip.id,
      brandName: "مدار",
      headline: "نص الإعلان",
      callToAction: "SIGN_UP",
    })
    await publishing.settled()
    expect(await publishing.get(ORG, started.id)).toMatchObject({
      status: "failed",
      error: { code: "TIKTOK_NO_PIXEL", step: "account", reason: "No pixel on the account." },
    })
  })
})
