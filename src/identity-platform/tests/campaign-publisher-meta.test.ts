// @vitest-environment node

// Publishing a campaign to Meta (campaigns/publishing/meta-publisher.ts): the exact pieces Meta
// is asked to create and in what order, what stops a publish before anything is created, cleaning
// up after a refused step, and switching a campaign on, off or away.
import { describe, expect, it } from "vitest"

import { MetaCampaignPublisher } from "../campaigns/publishing/meta-publisher"
import { PlatformPublishError, type MetaPublishInput } from "../campaigns/publishing/platform"

const ACCOUNT = "act_1234567890"

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("image-bytes"),
])
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)])

// A stand-in for Meta's Graph API: records every call, answers the way Meta does, and can be told
// to refuse one path.
function fakeMeta(
  options: {
    // Refuse writes to paths ending with this, the way Meta refuses a bad field.
    refuse?: string
    // Refuse them as a missing permission instead.
    refuseDenied?: boolean
    noPixel?: boolean
    // The ad account lists no pages to promote.
    noPromotePages?: boolean
    // Nor does the connected person manage any.
    noManagedPages?: boolean
    // How many times the video is still processing before it is ready.
    videoProcessingRounds?: number
    // The campaign was already deleted in Ads Manager: Meta no longer answers for it.
    campaignGone?: boolean
    // It is still there but marked deleted.
    campaignMarkedDeleted?: boolean
    // Meta refuses to delete a campaign that is still there.
    deleteRefused?: boolean
  } = {}
) {
  const calls: Array<{ method: string; path: string; query: string; body: unknown }> = []
  const waits: number[] = []
  let videoLookups = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/v21\.0/, "")
    const method = init?.method ?? "GET"
    let body: unknown = null
    if (init?.body instanceof FormData) {
      // A form is recorded by its fields; a file as its name and type.
      body = Object.fromEntries(
        [...init.body.entries()].map(([key, value]) => [
          key,
          typeof value === "string" ? value : `<file ${value.name} ${value.type}>`,
        ])
      )
    } else if (init?.body) {
      body = JSON.parse(String(init.body))
    }
    calls.push({ method, path, query: decodeURIComponent(url.search), body })
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

    if (options.refuse && method === "POST" && path.endsWith(options.refuse)) {
      return options.refuseDenied
        ? reply(
            {
              error: {
                message: "(#200) Requires ads_management permission",
                type: "OAuthException",
                code: 200,
              },
            },
            400
          )
        : reply(
            {
              error: {
                message: "Invalid parameter",
                type: "OAuthException",
                code: 100,
                error_user_msg: "The headline is too long",
              },
            },
            400
          )
    }
    if (method === "GET" && path === `/${ACCOUNT}/promote_pages`) {
      return reply({ data: options.noPromotePages ? [] : [{ id: "page-1", name: "مدار" }] })
    }
    if (method === "GET" && path === "/me/accounts") {
      return reply({ data: options.noManagedPages ? [] : [{ id: "page-2", name: "مدار" }] })
    }
    if (method === "GET" && path === `/${ACCOUNT}/adspixels`) {
      return reply({ data: options.noPixel ? [] : [{ id: "pixel-1", name: "Madar" }] })
    }
    if (method === "POST" && path === `/${ACCOUNT}/campaigns`) return reply({ id: "camp-1" })
    if (method === "POST" && path === `/${ACCOUNT}/adsets`) return reply({ id: "set-1" })
    if (method === "POST" && path === `/${ACCOUNT}/adimages`) {
      return reply({ images: { "a.png": { hash: "hash-1", url: "https://cdn.test/a.png" } } })
    }
    if (method === "POST" && path === `/${ACCOUNT}/advideos`) return reply({ id: "video-1" })
    if (method === "GET" && path === "/video-1") {
      videoLookups += 1
      return videoLookups <= (options.videoProcessingRounds ?? 0)
        ? reply({ id: "video-1", status: { video_status: "processing" } })
        : reply({
            id: "video-1",
            status: { video_status: "ready" },
            thumbnails: { data: [{ uri: "https://cdn.test/thumb.jpg" }] },
          })
    }
    if (method === "POST" && path === `/${ACCOUNT}/adcreatives`) return reply({ id: "creative-1" })
    if (method === "POST" && path === `/${ACCOUNT}/ads`) return reply({ id: "ad-1" })
    if (options.campaignGone && path === "/camp-1") {
      return reply(
        {
          error: {
            message: "Unsupported request. Object with ID 'camp-1' does not exist",
            type: "GraphMethodException",
            code: 100,
          },
        },
        400
      )
    }
    if ((options.deleteRefused || options.campaignMarkedDeleted) && method === "DELETE") {
      return reply({ error: { message: "Try again later", code: 2 } }, 500)
    }
    if (method === "GET" && path === "/camp-1") {
      return reply({
        id: "camp-1",
        effective_status: options.campaignMarkedDeleted ? "DELETED" : "PAUSED",
      })
    }
    if (method === "POST" && path === "/camp-1") return reply({ success: true })
    if (method === "DELETE") return reply({ success: true })
    return reply({ error: { message: `unexpected ${method} ${path}`, code: 1 } }, 404)
  }) as typeof fetch
  return {
    calls,
    waits,
    publisher: new MetaCampaignPublisher({
      apiBaseUrl: "https://meta.test/v21.0",
      fetch: fetchImpl,
      wait: async (ms) => {
        waits.push(ms)
      },
    }),
  }
}

const metaInput = (overrides: Partial<MetaPublishInput> = {}): MetaPublishInput => ({
  accessToken: "token",
  // Without the "act_" prefix: the publisher adds it.
  adAccountId: "1234567890",
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
  text: "جرّب مدار مجاناً",
  headline: "كاشير سريع",
  callToAction: "SIGN_UP",
  url: "https://example.com/?utm_source=meta",
  startActive: false,
  ...overrides,
})

describe("publishing to Meta", () => {
  it("creates the campaign, ad set, image, creative and ad, in that order", async () => {
    const { calls, publisher } = fakeMeta()
    const ids = await publisher.publish(metaInput())
    expect(ids).toEqual({
      campaignId: "camp-1",
      adSetId: "set-1",
      creativeId: "creative-1",
      adId: "ad-1",
    })
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET /${ACCOUNT}/promote_pages`,
      `POST /${ACCOUNT}/campaigns`,
      `POST /${ACCOUNT}/adsets`,
      `POST /${ACCOUNT}/adimages`,
      `POST /${ACCOUNT}/adcreatives`,
      `POST /${ACCOUNT}/ads`,
    ])
    const body = (path: string) =>
      calls.find((call) => call.method === "POST" && call.path === path)?.body as Record<
        string,
        unknown
      >
    expect(body(`/${ACCOUNT}/campaigns`)).toEqual({
      name: "حملة الشتاء",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
    })
    const adSet = body(`/${ACCOUNT}/adsets`)
    expect(adSet).toMatchObject({
      campaign_id: "camp-1",
      status: "ACTIVE",
      // 50 SAR, in halalas.
      daily_budget: 5000,
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      optimization_goal: "LINK_CLICKS",
      destination_type: "WEBSITE",
      start_time: "2026-01-15T09:05:00.000Z",
      targeting: {
        geo_locations: { countries: ["SA"] },
        age_min: 25,
        age_max: 44,
        genders: [1],
        targeting_automation: { advantage_audience: 0 },
      },
    })
    expect(adSet).not.toHaveProperty("end_time")
    expect(adSet).not.toHaveProperty("promoted_object")
    expect(body(`/${ACCOUNT}/adimages`)).toEqual({ filename: "<file a.png image/png>" })
    expect(body(`/${ACCOUNT}/adcreatives`)).toEqual({
      name: "حملة الشتاء",
      object_story_spec: {
        page_id: "page-1",
        link_data: {
          link: "https://example.com/?utm_source=meta",
          message: "جرّب مدار مجاناً",
          name: "كاشير سريع",
          image_hash: "hash-1",
          call_to_action: {
            type: "SIGN_UP",
            value: { link: "https://example.com/?utm_source=meta" },
          },
        },
      },
    })
    expect(body(`/${ACCOUNT}/ads`)).toEqual({
      name: "حملة الشتاء",
      adset_id: "set-1",
      creative: { creative_id: "creative-1" },
      status: "ACTIVE",
    })
  })

  it("keeps the audience inside Meta's ages, leaves gender out for everyone and sends an end", async () => {
    const { calls, publisher } = fakeMeta()
    await publisher.publish(
      metaInput({
        adAccountId: ACCOUNT,
        minAge: 13,
        maxAge: null,
        gender: "all",
        dailyBudget: 12.5,
        endAt: "2026-02-01T00:00:00.000Z",
        startActive: true,
      })
    )
    expect(calls.find((call) => call.path === `/${ACCOUNT}/campaigns`)?.body).toMatchObject({
      status: "ACTIVE",
    })
    const adSet = calls.find((call) => call.path === `/${ACCOUNT}/adsets`)?.body as {
      targeting: Record<string, unknown>
    }
    expect(adSet).toMatchObject({ daily_budget: 1250, end_time: "2026-02-01T00:00:00.000Z" })
    expect(adSet.targeting).toMatchObject({ age_min: 18, age_max: 65 })
    expect(adSet.targeting).not.toHaveProperty("genders")

    const women = fakeMeta()
    await women.publisher.publish(metaInput({ gender: "female", maxAge: 70 }))
    expect(women.calls.find((call) => call.path === `/${ACCOUNT}/adsets`)?.body).toMatchObject({
      targeting: { genders: [2], age_max: 65 },
    })
  })

  it("waits for a video to be ready and builds the creative from it", async () => {
    const { calls, waits, publisher } = fakeMeta({ videoProcessingRounds: 2 })
    await publisher.publish(
      metaInput({
        media: { kind: "video", bytes: MP4, contentType: "video/mp4", fileName: "a.mp4" },
        callToAction: "LEARN_MORE",
      })
    )
    expect(calls.find((call) => call.path === `/${ACCOUNT}/advideos`)?.body).toEqual({
      source: "<file a.mp4 video/mp4>",
      name: "حملة الشتاء",
    })
    const lookups = calls.filter((call) => call.method === "GET" && call.path === "/video-1")
    expect(lookups).toHaveLength(3)
    expect(lookups[0].query).toBe("?fields=status,thumbnails{uri}")
    expect(waits).toEqual([3000, 3000])
    expect(calls.some((call) => call.path === `/${ACCOUNT}/adimages`)).toBe(false)
    expect(calls.find((call) => call.path === `/${ACCOUNT}/adcreatives`)?.body).toEqual({
      name: "حملة الشتاء",
      object_story_spec: {
        page_id: "page-1",
        video_data: {
          video_id: "video-1",
          message: "جرّب مدار مجاناً",
          title: "كاشير سريع",
          image_url: "https://cdn.test/thumb.jpg",
          call_to_action: {
            type: "LEARN_MORE",
            value: { link: "https://example.com/?utm_source=meta" },
          },
        },
      },
    })
  })

  it("gives up on a video Meta never finishes, and deletes the campaign", async () => {
    const { calls, waits, publisher } = fakeMeta({ videoProcessingRounds: 100 })
    await expect(
      publisher.publish(
        metaInput({
          media: { kind: "video", bytes: MP4, contentType: "video/mp4", fileName: "a.mp4" },
        })
      )
    ).rejects.toMatchObject({ code: "META_MEDIA_NOT_READY", step: "media" })
    expect(waits).toHaveLength(20)
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/camp-1" })
  })

  it("measures a sign-ups campaign by the account's pixel, and stops early without one", async () => {
    const withPixel = fakeMeta()
    await withPixel.publisher.publish(metaInput({ objective: "leads" }))
    expect(
      withPixel.calls.find((call) => call.path === `/${ACCOUNT}/campaigns`)?.body
    ).toMatchObject({ objective: "OUTCOME_LEADS" })
    expect(withPixel.calls.find((call) => call.path === `/${ACCOUNT}/adsets`)?.body).toMatchObject({
      optimization_goal: "OFFSITE_CONVERSIONS",
      destination_type: "WEBSITE",
      promoted_object: { pixel_id: "pixel-1", custom_event_type: "LEAD" },
    })

    const without = fakeMeta({ noPixel: true })
    await expect(
      without.publisher.publish(metaInput({ objective: "leads" }))
    ).rejects.toMatchObject({ code: "META_NO_PIXEL", step: "account" })
    // Nothing was created.
    expect(without.calls.every((call) => call.method === "GET")).toBe(true)
  })

  it("falls back to the pages the person manages, and stops early when there is no page", async () => {
    const managed = fakeMeta({ noPromotePages: true })
    await managed.publisher.publish(metaInput())
    expect(
      managed.calls.find((call) => call.path === `/${ACCOUNT}/adcreatives`)?.body
    ).toMatchObject({ object_story_spec: { page_id: "page-2" } })

    const { calls, publisher } = fakeMeta({ noPromotePages: true, noManagedPages: true })
    await expect(publisher.publish(metaInput())).rejects.toMatchObject({
      code: "META_NO_PAGE",
      step: "account",
    })
    expect(calls.every((call) => call.method === "GET")).toBe(true)
  })

  it("deletes the campaign when the ad is refused, and reports Meta's reason", async () => {
    const { calls, publisher } = fakeMeta({ refuse: "/ads" })
    const error = await publisher.publish(metaInput()).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PlatformPublishError)
    expect(error).toMatchObject({
      platform: "meta",
      step: "ad",
      reason: "The headline is too long",
      code: "META_REFUSED",
    })
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: "/camp-1" })
  })

  it("reports a missing permission as access denied", async () => {
    const { calls, publisher } = fakeMeta({ refuse: "/campaigns", refuseDenied: true })
    await expect(publisher.publish(metaInput())).rejects.toMatchObject({
      code: "META_ACCESS_DENIED",
      step: "campaign",
      reason: "(#200) Requires ads_management permission",
    })
    // The campaign never existed, so there is nothing to delete.
    expect(calls.some((call) => call.method === "DELETE")).toBe(false)
  })

  it("switches a campaign on and off", async () => {
    const { calls, publisher } = fakeMeta()
    await publisher.setCampaignStatus({ accessToken: "token", campaignId: "camp-1", active: true })
    await publisher.setCampaignStatus({ accessToken: "token", campaignId: "camp-1", active: false })
    expect(calls).toEqual([
      { method: "POST", path: "/camp-1", query: "", body: { status: "ACTIVE" } },
      { method: "POST", path: "/camp-1", query: "", body: { status: "PAUSED" } },
    ])

    const gone = fakeMeta({ campaignGone: true })
    await expect(
      gone.publisher.setCampaignStatus({ accessToken: "token", campaignId: "camp-1", active: true })
    ).rejects.toMatchObject({ step: "status", code: "META_REFUSED" })
  })

  it("deletes a campaign, and counts one already gone from Meta as deleted", async () => {
    const there = fakeMeta()
    await there.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })
    expect(there.calls).toEqual([{ method: "DELETE", path: "/camp-1", query: "", body: null }])

    const gone = fakeMeta({ campaignGone: true })
    await gone.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })
    expect(gone.calls.map((call) => `${call.method} ${call.path}${call.query}`)).toEqual([
      "DELETE /camp-1",
      "GET /camp-1?fields=id,effective_status",
    ])

    const marked = fakeMeta({ campaignMarkedDeleted: true })
    await marked.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })

    // Still on Meta and not deleted: the refusal stands.
    const refused = fakeMeta({ deleteRefused: true })
    await expect(
      refused.publisher.deleteCampaign({ accessToken: "token", campaignId: "camp-1" })
    ).rejects.toMatchObject({ reason: "Try again later", code: "META_REFUSED" })
  })
})
