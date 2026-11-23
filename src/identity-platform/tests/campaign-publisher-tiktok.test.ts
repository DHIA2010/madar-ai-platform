// @vitest-environment node

// Publishing a campaign to TikTok (campaigns/publishing/tiktok-publisher.ts): the exact pieces
// TikTok is asked to create and in what order, what stops a publish before anything is created,
// cleaning up after a refused step, and switching a campaign on, off and away.
import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import { PlatformPublishError, type TikTokPublishInput } from "../campaigns/publishing/platform"
import { TikTokCampaignPublisher } from "../campaigns/publishing/tiktok-publisher"

const ADVERTISER = "adv-1"
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)])

type Call = {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, unknown> | null
  token: string | null
  isForm: boolean
}

// A stand-in for TikTok's API: records every call, answers the way TikTok does (HTTP 200 with a
// code), and can be told to refuse one path or to behave like an account missing something.
function fakeTikTok(
  options: {
    refuse?: string
    identities?: Array<Record<string, unknown>>
    noPixel?: boolean
    // How many times the video is asked about before its cover is there.
    coverAfter?: number
    // The campaign was already deleted in Ads Manager.
    campaignGone?: boolean
    deleteRefused?: boolean
    denied?: boolean
  } = {}
) {
  const calls: Call[] = []
  let coverAsked = 0
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname.replace(/^\/open_api\/v1\.3/, "")
    const method = init?.method ?? "GET"
    const isForm = init?.body instanceof FormData
    let body: Record<string, unknown> | null = null
    if (init?.body instanceof FormData) {
      body = {}
      for (const [key, value] of init.body.entries()) {
        body[key] = typeof value === "string" ? value : `<file ${value.name} ${value.size}>`
      }
    } else if (init?.body) {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
    }
    const headers = new Headers(init?.headers)
    calls.push({
      method,
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
      token: headers.get("access-token"),
      isForm,
    })
    const ok = (data: unknown) =>
      new Response(JSON.stringify({ code: 0, message: "OK", data }), { status: 200 })
    const no = (message: string, code = 40002) =>
      new Response(JSON.stringify({ code, message, data: {} }), { status: 200 })

    if (options.denied) return no("Access token is incorrect or has been revoked.", 40105)
    if (options.refuse && path === options.refuse) return no("Ad text is too long")

    if (method === "GET" && path === "/identity/get/") {
      return ok({
        identity_list: options.identities ?? [
          { identity_id: "id-custom", identity_type: "CUSTOMIZED_USER" },
          {
            identity_id: "id-bc",
            identity_type: "BC_AUTH_TT",
            identity_authorized_bc_id: "bc-9",
          },
          { identity_id: "id-user", identity_type: "TT_USER" },
        ],
      })
    }
    if (method === "POST" && path === "/identity/create/") return ok({ identity_id: "id-new" })
    if (method === "GET" && path === "/pixel/list/") {
      return ok({ pixels: options.noPixel ? [] : [{ pixel_id: "777", pixel_code: "PIXELCODE" }] })
    }
    if (method === "POST" && path === "/campaign/create/") return ok({ campaign_id: "camp-1" })
    if (method === "POST" && path === "/adgroup/create/") return ok({ adgroup_id: "group-1" })
    if (method === "POST" && path === "/file/video/ad/upload/") return ok([{ video_id: "vid-1" }])
    if (method === "GET" && path === "/file/video/ad/info/") {
      coverAsked += 1
      const ready = coverAsked > (options.coverAfter ?? 0)
      return ok({
        list: [{ video_id: "vid-1", video_cover_url: ready ? "https://cover.test/1.jpg" : "" }],
      })
    }
    if (method === "POST" && path === "/file/image/ad/upload/") return ok({ image_id: "img-1" })
    if (method === "POST" && path === "/ad/create/") return ok({ ad_ids: ["ad-1"] })
    if (method === "POST" && path === "/campaign/status/update/") {
      if (body?.operation_status === "DELETE" && (options.campaignGone || options.deleteRefused)) {
        return no("Campaign does not exist or cannot be deleted")
      }
      return ok({ campaign_ids: body?.campaign_ids })
    }
    if (method === "GET" && path === "/campaign/get/") {
      return ok({ list: options.campaignGone ? [] : [{ campaign_id: "camp-1" }] })
    }
    return new Response(JSON.stringify({ code: 40002, message: `unexpected ${path}` }), {
      status: 200,
    })
  }) as typeof fetch
  return { calls, fetchImpl }
}

function publishInput(overrides: Partial<TikTokPublishInput> = {}): TikTokPublishInput {
  return {
    accessToken: "token-1",
    advertiserId: ADVERTISER,
    name: "Winter offer",
    objective: "traffic",
    dailyBudget: 75,
    startAt: "2026-12-01T09:30:00.000Z",
    endAt: null,
    countryCode: "sa",
    minAge: 25,
    maxAge: 44,
    gender: "all",
    media: { kind: "video", bytes: MP4, contentType: "video/mp4", fileName: "offer.mp4" },
    brandName: "Madar",
    text: "Run your shop from one place",
    callToAction: "SIGN_UP",
    url: "https://www.madar.my/",
    startActive: false,
    ...overrides,
  }
}

function publisherFor(fake: ReturnType<typeof fakeTikTok>) {
  const waits: number[] = []
  const publisher = new TikTokCampaignPublisher({
    apiBaseUrl: "https://tiktok.test/open_api/v1.3",
    fetch: fake.fetchImpl,
    wait: async (ms) => {
      waits.push(ms)
    },
  })
  return { publisher, waits }
}

const steps = (calls: Call[]) => calls.map((call) => `${call.method} ${call.path}`)

async function refusal(run: Promise<unknown>): Promise<PlatformPublishError> {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught
  )
  expect(error).toBeInstanceOf(PlatformPublishError)
  return error as PlatformPublishError
}

describe("publishing a campaign to TikTok", () => {
  it("creates the campaign, ad group, video, cover and ad in order", async () => {
    const fake = fakeTikTok({ coverAfter: 2 })
    const { publisher, waits } = publisherFor(fake)

    const ids = await publisher.publish(publishInput())

    expect(ids).toEqual({
      campaignId: "camp-1",
      adGroupId: "group-1",
      videoId: "vid-1",
      adId: "ad-1",
    })
    expect(steps(fake.calls)).toEqual([
      "GET /identity/get/",
      "POST /campaign/create/",
      "POST /adgroup/create/",
      "POST /file/video/ad/upload/",
      "GET /file/video/ad/info/",
      "GET /file/video/ad/info/",
      "GET /file/video/ad/info/",
      "POST /file/image/ad/upload/",
      "POST /ad/create/",
    ])
    // The cover was not there twice, so the publisher waited twice.
    expect(waits).toEqual([3000, 3000])
    expect(fake.calls.every((call) => call.token === "token-1")).toBe(true)

    const [identity, campaign, adGroup, video, info, , , image, ad] = fake.calls
    expect(identity.query).toEqual({ advertiser_id: ADVERTISER })

    expect(campaign.body).toEqual({
      advertiser_id: ADVERTISER,
      campaign_name: "Winter offer",
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_INFINITE",
      operation_status: "DISABLE",
    })

    expect(adGroup.body).toEqual({
      advertiser_id: ADVERTISER,
      campaign_id: "camp-1",
      adgroup_name: "Winter offer",
      promotion_type: "WEBSITE",
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: ["102358"],
      age_groups: ["AGE_25_34", "AGE_35_44"],
      budget_mode: "BUDGET_MODE_DAY",
      budget: 75,
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: "2026-12-01 09:30:00",
      bid_type: "BID_TYPE_NO_BID",
      pacing: "PACING_MODE_SMOOTH",
      operation_status: "ENABLE",
      optimization_goal: "CLICK",
      billing_event: "CPC",
    })

    expect(video.isForm).toBe(true)
    expect(video.body).toMatchObject({
      advertiser_id: ADVERTISER,
      upload_type: "UPLOAD_BY_FILE",
      video_signature: createHash("md5").update(MP4).digest("hex"),
    })
    // The file name is made unique, since TikTok refuses one the account already has.
    expect(String(video.body?.file_name)).toMatch(/^\d+-offer\.mp4$/)
    expect(String(video.body?.video_file)).toContain(`${MP4.length}>`)

    expect(info.query).toEqual({ advertiser_id: ADVERTISER, video_ids: '["vid-1"]' })
    expect(image.body).toEqual({
      advertiser_id: ADVERTISER,
      upload_type: "UPLOAD_BY_URL",
      image_url: "https://cover.test/1.jpg",
    })

    // The Business Center identity wins over the others on the account.
    expect(ad.body).toEqual({
      advertiser_id: ADVERTISER,
      adgroup_id: "group-1",
      creatives: [
        {
          ad_name: "Winter offer",
          identity_type: "BC_AUTH_TT",
          identity_id: "id-bc",
          identity_authorized_bc_id: "bc-9",
          ad_format: "SINGLE_VIDEO",
          video_id: "vid-1",
          image_ids: ["img-1"],
          ad_text: "Run your shop from one place",
          call_to_action: "SIGN_UP",
          landing_page_url: "https://www.madar.my/",
        },
      ],
    })
  })

  it("sends the gender, the end date and an open upper age when they are set", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    await publisher.publish(
      publishInput({
        gender: "female",
        endAt: "2026-12-10T21:00:00.000Z",
        minAge: 13,
        maxAge: null,
        countryCode: "AE",
        startActive: true,
      })
    )

    const campaign = fake.calls.find((call) => call.path === "/campaign/create/")
    expect(campaign?.body?.operation_status).toBe("ENABLE")
    const adGroup = fake.calls.find((call) => call.path === "/adgroup/create/")
    expect(adGroup?.body).toMatchObject({
      gender: "GENDER_FEMALE",
      location_ids: ["290557"],
      schedule_type: "SCHEDULE_START_END",
      schedule_start_time: "2026-12-01 09:30:00",
      schedule_end_time: "2026-12-10 21:00:00",
      // Never the under-18 group, even when the range reaches it.
      age_groups: ["AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_54", "AGE_55_100"],
    })
  })

  it("makes an identity from the brand name when the account has none", async () => {
    const fake = fakeTikTok({ identities: [] })
    const { publisher } = publisherFor(fake)

    await publisher.publish(publishInput())

    expect(steps(fake.calls).slice(0, 3)).toEqual([
      "GET /identity/get/",
      "POST /identity/create/",
      "POST /campaign/create/",
    ])
    expect(fake.calls[1].body).toEqual({ advertiser_id: ADVERTISER, display_name: "Madar" })
    const creative = (
      fake.calls.find((call) => call.path === "/ad/create/")?.body?.creatives as Array<
        Record<string, unknown>
      >
    )[0]
    expect(creative.identity_type).toBe("CUSTOMIZED_USER")
    expect(creative.identity_id).toBe("id-new")
    expect(creative).not.toHaveProperty("identity_authorized_bc_id")
  })

  it("reports a missing identity when none can be made, before creating anything", async () => {
    const fake = fakeTikTok({ identities: [], refuse: "/identity/create/" })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput()))

    expect(error.code).toBe("TIKTOK_NO_IDENTITY")
    expect(error.step).toBe("account")
    expect(steps(fake.calls)).toEqual(["GET /identity/get/", "POST /identity/create/"])
  })

  it("measures a sign-ups campaign by the account's pixel", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    await publisher.publish(publishInput({ objective: "leads" }))

    expect(steps(fake.calls).slice(0, 3)).toEqual([
      "GET /identity/get/",
      "GET /pixel/list/",
      "POST /campaign/create/",
    ])
    expect(fake.calls[2].body?.objective_type).toBe("WEB_CONVERSIONS")
    const adGroup = fake.calls.find((call) => call.path === "/adgroup/create/")
    expect(adGroup?.body).toMatchObject({
      optimization_goal: "CONVERT",
      // The pixel's code, not its id.
      pixel_id: "PIXELCODE",
      optimization_event: "FORM",
      billing_event: "OCPM",
    })
  })

  it("stops a sign-ups campaign before creating anything when there is no pixel", async () => {
    const fake = fakeTikTok({ noPixel: true })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput({ objective: "leads" })))

    expect(error.code).toBe("TIKTOK_NO_PIXEL")
    expect(error.step).toBe("account")
    expect(error.reason).toBe(
      "The ad account has no TikTok Pixel, which a sign-ups campaign needs."
    )
    expect(fake.calls.every((call) => call.method === "GET")).toBe(true)
  })

  it("refuses a picture without calling TikTok", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    const error = await refusal(
      publisher.publish(
        publishInput({
          media: {
            kind: "image",
            bytes: Buffer.from("png"),
            contentType: "image/png",
            fileName: "offer.png",
          },
        })
      )
    )

    expect(error.code).toBe("TIKTOK_REFUSED")
    expect(error.step).toBe("media")
    expect(error.reason).toBe("TikTok shows video ads only.")
    expect(fake.calls).toEqual([])
  })

  it("refuses a country it has no TikTok location for without calling TikTok", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput({ countryCode: "fr" })))

    expect(error.code).toBe("TIKTOK_REFUSED")
    expect(error.step).toBe("ad_set")
    expect(fake.calls).toEqual([])
  })

  it("deletes the campaign and reports TikTok's reason when the ad is refused", async () => {
    const fake = fakeTikTok({ refuse: "/ad/create/" })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput()))

    expect(error.code).toBe("TIKTOK_REFUSED")
    expect(error.step).toBe("ad")
    expect(error.reason).toBe("Ad text is too long")
    const last = fake.calls[fake.calls.length - 1]
    expect(last.path).toBe("/campaign/status/update/")
    expect(last.body).toEqual({
      advertiser_id: ADVERTISER,
      campaign_ids: ["camp-1"],
      operation_status: "DELETE",
    })
  })

  it("keeps the original reason when the clean-up delete fails too", async () => {
    const fake = fakeTikTok({ refuse: "/adgroup/create/", deleteRefused: true })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput()))

    expect(error.step).toBe("ad_set")
    expect(error.reason).toBe("Ad text is too long")
    expect(steps(fake.calls).slice(-2)).toEqual([
      "POST /adgroup/create/",
      "POST /campaign/status/update/",
    ])
  })

  it("gives up when the video's cover never appears, and deletes the campaign", async () => {
    const fake = fakeTikTok({ coverAfter: 1000 })
    const { publisher, waits } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput()))

    expect(error.code).toBe("TIKTOK_MEDIA_NOT_READY")
    expect(error.step).toBe("media")
    expect(waits).toHaveLength(20)
    expect(fake.calls[fake.calls.length - 1].body?.operation_status).toBe("DELETE")
  })

  it("reports a rejected login as access denied", async () => {
    const fake = fakeTikTok({ denied: true })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.publish(publishInput()))

    expect(error.code).toBe("TIKTOK_ACCESS_DENIED")
    // A denied identity list does not go on to try making an identity.
    expect(steps(fake.calls)).toEqual(["GET /identity/get/"])
  })
})

describe("a published TikTok campaign", () => {
  const target = { accessToken: "token-1", advertiserId: ADVERTISER, campaignId: "camp-1" }

  it("is switched on and off", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    await publisher.setCampaignStatus({ ...target, active: true })
    await publisher.setCampaignStatus({ ...target, active: false })

    expect(fake.calls.map((call) => [call.path, call.body])).toEqual([
      [
        "/campaign/status/update/",
        { advertiser_id: ADVERTISER, campaign_ids: ["camp-1"], operation_status: "ENABLE" },
      ],
      [
        "/campaign/status/update/",
        { advertiser_id: ADVERTISER, campaign_ids: ["camp-1"], operation_status: "DISABLE" },
      ],
    ])
  })

  it("reports a refused switch at the status step", async () => {
    const fake = fakeTikTok({ refuse: "/campaign/status/update/" })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.setCampaignStatus({ ...target, active: true }))

    expect(error.step).toBe("status")
    expect(error.code).toBe("TIKTOK_REFUSED")
  })

  it("is deleted", async () => {
    const fake = fakeTikTok()
    const { publisher } = publisherFor(fake)

    await publisher.deleteCampaign(target)

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].body).toEqual({
      advertiser_id: ADVERTISER,
      campaign_ids: ["camp-1"],
      operation_status: "DELETE",
    })
  })

  it("counts as deleted when it is already gone", async () => {
    const fake = fakeTikTok({ campaignGone: true })
    const { publisher } = publisherFor(fake)

    await expect(publisher.deleteCampaign(target)).resolves.toBeUndefined()

    expect(steps(fake.calls)).toEqual(["POST /campaign/status/update/", "GET /campaign/get/"])
    expect(fake.calls[1].query).toEqual({
      advertiser_id: ADVERTISER,
      filtering: '{"campaign_ids":["camp-1"]}',
    })
  })

  it("keeps the refusal when the campaign is still there", async () => {
    const fake = fakeTikTok({ deleteRefused: true })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.deleteCampaign(target))

    expect(error.code).toBe("TIKTOK_REFUSED")
    expect(error.reason).toBe("Campaign does not exist or cannot be deleted")
  })

  it("does not look the campaign up when the delete was denied", async () => {
    const fake = fakeTikTok({ denied: true })
    const { publisher } = publisherFor(fake)

    const error = await refusal(publisher.deleteCampaign(target))

    expect(error.code).toBe("TIKTOK_ACCESS_DENIED")
    expect(fake.calls).toHaveLength(1)
  })
})
