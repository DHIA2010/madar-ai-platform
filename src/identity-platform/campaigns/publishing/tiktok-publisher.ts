// Publishes one campaign to TikTok Ads through its Marketing API: a campaign, one ad group, the
// video, its cover picture and one ad -- the same pieces Ads Manager builds, in the same order.
// Every piece is created before the next one needs its id. If a later step fails, the campaign
// created so far is deleted, so a failed publish leaves nothing behind on the account.
//
// TikTok answers HTTP 200 with { code, message, data } even for a refusal -- anything but
// code 0 is one, and `message` is its own explanation.
import { createHash } from "node:crypto"

import {
  PlatformPublishError,
  type PublishErrorCode,
  type PublishStep,
  type TikTokPublishedIds,
  type TikTokPublishInput,
} from "./platform"

type Json = Record<string, unknown>
type Fetch = typeof fetch

const DEFAULT_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"
const COVER_READY_ATTEMPTS = 20
const COVER_READY_WAIT_MS = 3000
// TikTok's codes for a login that is missing, expired or not allowed to do this.
const DENIED_CODES = new Set([40001, 40105])

// TikTok targets a country by its own location id, not by the two-letter code.
const LOCATION_IDS: Record<string, string> = {
  sa: "102358",
  ae: "290557",
  kw: "285570",
  qa: "289688",
  bh: "290291",
  om: "286963",
  eg: "357994",
  jo: "248816",
}

// TikTok takes ages as fixed buckets. AGE_13_17 is left out on purpose: ads here are for adults.
const AGE_GROUPS: Array<{ name: string; from: number; to: number }> = [
  { name: "AGE_18_24", from: 18, to: 24 },
  { name: "AGE_25_34", from: 25, to: 34 },
  { name: "AGE_35_44", from: 35, to: 44 },
  { name: "AGE_45_54", from: 45, to: 54 },
  { name: "AGE_55_100", from: 55, to: 100 },
]

// The identities an ad can be shown under, best first: a TikTok account shared through the
// Business Center, the advertiser's own TikTok account, one authorised by a code, and last a
// plain name and picture that exists only inside the ad account.
const IDENTITY_PREFERENCE = ["BC_AUTH_TT", "TT_USER", "AUTH_CODE", "CUSTOMIZED_USER"]

interface Identity {
  id: string
  type: string
  authorizedBcId: string | null
}

const refused = (step: PublishStep, reason: string, kind: PublishErrorCode = "REFUSED") =>
  new PlatformPublishError("tiktok", step, reason, kind)

const isDenied = (error: unknown) =>
  error instanceof PlatformPublishError && error.code === "TIKTOK_ACCESS_DENIED"

const asObject = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {}

const asList = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : [])

// TikTok sends ids as text, but a number is accepted too in case it ever does not.
const asId = (value: unknown): string | null =>
  typeof value === "string" && value ? value : typeof value === "number" ? String(value) : null

// The buckets that overlap the wanted ages.
function ageGroups(minAge: number, maxAge: number | null): string[] {
  const upper = maxAge ?? 100
  return AGE_GROUPS.filter((group) => group.from <= upper && group.to >= minAge).map(
    (group) => group.name
  )
}

// TikTok wants "YYYY-MM-DD HH:MM:SS" in UTC.
function scheduleTime(step: PublishStep, instant: string): string {
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) throw refused(step, "The schedule time is not a valid date.")
  return date.toISOString().slice(0, 19).replace("T", " ")
}

export class TikTokCampaignPublisher {
  private readonly base: string

  constructor(
    private readonly options: {
      apiBaseUrl?: string
      fetch?: Fetch
      wait?: (ms: number) => Promise<void>
    } = {}
  ) {
    this.base = (
      options.apiBaseUrl ??
      process.env.TIKTOK_ADS_API_BASE_URL ??
      DEFAULT_API_BASE
    ).replace(/\/$/, "")
  }

  private get fetch(): Fetch {
    return this.options.fetch ?? fetch
  }

  private wait(ms: number) {
    return this.options.wait
      ? this.options.wait(ms)
      : new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  // One call to TikTok, returning the `data` of its answer. A GET carries its parameters in the
  // address (lists and objects as JSON text); a POST sends JSON, or a form when a file goes along.
  private async call(
    step: PublishStep,
    token: string,
    method: "GET" | "POST",
    path: string,
    payload?: Json | FormData
  ): Promise<unknown> {
    let url = `${this.base}${path}`
    let body: string | FormData | undefined
    const headers: Record<string, string> = { "access-token": token, accept: "application/json" }
    if (payload instanceof FormData) {
      // No content-type here: fetch writes it itself, with the form's boundary.
      body = payload
    } else if (method === "GET") {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(payload ?? {})) {
        query.set(key, typeof value === "string" ? value : JSON.stringify(value))
      }
      const text = query.toString()
      if (text) url += `?${text}`
    } else {
      headers["content-type"] = "application/json"
      body = JSON.stringify(payload ?? {})
    }

    const response = await this.fetch(url, { method, headers, body })
    const text = await response.text()
    let parsed: { code?: unknown; message?: unknown; data?: unknown } = {}
    try {
      parsed = text ? (JSON.parse(text) as typeof parsed) : {}
    } catch {
      parsed = { message: text.slice(0, 300) }
    }
    if (!response.ok || parsed.code !== 0) {
      const denied =
        response.status === 401 ||
        response.status === 403 ||
        (typeof parsed.code === "number" && DENIED_CODES.has(parsed.code))
      throw refused(
        step,
        String(parsed.message ?? `request failed (${response.status})`).slice(0, 400),
        denied ? "ACCESS_DENIED" : "REFUSED"
      )
    }
    return parsed.data
  }

  // The identity (name and picture) the ad is shown under -- TikTok requires one on every ad. An
  // account that has none yet gets a plain one made from the brand name.
  private async identity(token: string, input: TikTokPublishInput): Promise<Identity> {
    const advertiserId = input.advertiserId
    const listed = await this.call("account", token, "GET", "/identity/get/", {
      advertiser_id: advertiserId,
    }).catch((error: unknown) => {
      if (isDenied(error)) throw error
      // A refused list is treated like an empty one: making an identity is still worth a try.
      return null
    })
    const identities = asList(asObject(listed).identity_list)
      .map((entry) => ({
        id: asId(entry.identity_id),
        type: typeof entry.identity_type === "string" ? entry.identity_type : "",
        authorizedBcId: asId(entry.identity_authorized_bc_id),
      }))
      .filter((entry): entry is Identity => entry.id !== null && entry.type !== "")
    for (const type of IDENTITY_PREFERENCE) {
      const match = identities.find((entry) => entry.type === type)
      if (match) return match
    }
    if (identities[0]) return identities[0]

    const made = await this.call("account", token, "POST", "/identity/create/", {
      advertiser_id: advertiserId,
      display_name: input.brandName,
    }).catch((error: unknown) => {
      if (isDenied(error)) throw error
      const reason = error instanceof PlatformPublishError ? error.reason : "no reason given"
      throw refused("account", reason, "NO_IDENTITY")
    })
    const id = asId(asObject(made).identity_id)
    if (!id) {
      throw refused(
        "account",
        "No TikTok identity could be found or made for the ad account.",
        "NO_IDENTITY"
      )
    }
    return { id, type: "CUSTOMIZED_USER", authorizedBcId: null }
  }

  // The account's pixel, which a sign-ups campaign is measured by. The ad group is given the
  // pixel's code, not its id.
  private async pixelCode(token: string, advertiserId: string): Promise<string> {
    const data = await this.call("account", token, "GET", "/pixel/list/", {
      advertiser_id: advertiserId,
    })
    const pixel = asList(asObject(data).pixels).find(
      (entry) => typeof entry.pixel_code === "string" && entry.pixel_code
    )
    if (!pixel) {
      throw refused(
        "account",
        "The ad account has no TikTok Pixel, which a sign-ups campaign needs.",
        "NO_PIXEL"
      )
    }
    return pixel.pixel_code as string
  }

  private async uploadVideo(token: string, input: TikTokPublishInput): Promise<string> {
    const { media } = input
    // TikTok refuses a file name the account already has, so each upload gets its own.
    const fileName = `${Date.now()}-${media.fileName}`
    const form = new FormData()
    form.append("advertiser_id", input.advertiserId)
    form.append("upload_type", "UPLOAD_BY_FILE")
    // The md5 of the file, which TikTok checks the upload against.
    form.append("video_signature", createHash("md5").update(media.bytes).digest("hex"))
    form.append("file_name", fileName)
    form.append(
      "video_file",
      new Blob([new Uint8Array(media.bytes)], { type: media.contentType }),
      fileName
    )
    const data = await this.call("media", token, "POST", "/file/video/ad/upload/", form)
    const videoId = asId(asList(data)[0]?.video_id)
    if (!videoId) throw refused("media", "TikTok did not return the uploaded video.")
    return videoId
  }

  // The cover picture a video ad must have. TikTok makes one itself while it processes the
  // video, so the video is asked about until the cover is there, then the cover is added to the
  // account's pictures.
  private async coverImage(token: string, advertiserId: string, videoId: string): Promise<string> {
    let coverUrl: string | null = null
    for (let attempt = 0; attempt < COVER_READY_ATTEMPTS; attempt += 1) {
      const data = await this.call("media", token, "GET", "/file/video/ad/info/", {
        advertiser_id: advertiserId,
        video_ids: [videoId],
      })
      const url = asList(asObject(data).list)[0]?.video_cover_url
      if (typeof url === "string" && url) {
        coverUrl = url
        break
      }
      await this.wait(COVER_READY_WAIT_MS)
    }
    if (!coverUrl) {
      throw refused("media", "TikTok is still processing the video.", "MEDIA_NOT_READY")
    }
    const data = await this.call("media", token, "POST", "/file/image/ad/upload/", {
      advertiser_id: advertiserId,
      upload_type: "UPLOAD_BY_URL",
      image_url: coverUrl,
    })
    const imageId = asId(asObject(data).image_id)
    if (!imageId) throw refused("media", "TikTok did not return the cover picture.")
    return imageId
  }

  private campaignStatus(
    step: PublishStep,
    input: { accessToken: string; advertiserId: string; campaignId: string },
    operation: "ENABLE" | "DISABLE" | "DELETE"
  ) {
    return this.call(step, input.accessToken, "POST", "/campaign/status/update/", {
      advertiser_id: input.advertiserId,
      campaign_ids: [input.campaignId],
      operation_status: operation,
    })
  }

  async publish(input: TikTokPublishInput): Promise<TikTokPublishedIds> {
    if (input.media.kind !== "video") {
      throw refused("media", "TikTok shows video ads only.")
    }
    const token = input.accessToken
    const advertiserId = input.advertiserId
    // Everything the campaign depends on is checked and looked up first, so a missing piece stops
    // the publish before anything is created.
    const locationId = LOCATION_IDS[input.countryCode.toLowerCase()]
    if (!locationId) {
      throw refused("ad_set", `TikTok targeting is not set up for "${input.countryCode}".`)
    }
    const ages = ageGroups(input.minAge, input.maxAge)
    if (ages.length === 0) throw refused("ad_set", "The age range matches no TikTok age group.")
    const startTime = scheduleTime("ad_set", input.startAt)
    const endTime = input.endAt ? scheduleTime("ad_set", input.endAt) : null
    const identity = await this.identity(token, input)
    const pixelCode = input.objective === "leads" ? await this.pixelCode(token, advertiserId) : null

    const campaign = await this.call("campaign", token, "POST", "/campaign/create/", {
      advertiser_id: advertiserId,
      campaign_name: input.name,
      objective_type: input.objective === "leads" ? "WEB_CONVERSIONS" : "TRAFFIC",
      // The budget is set on the ad group; the campaign itself has no limit.
      budget_mode: "BUDGET_MODE_INFINITE",
      operation_status: input.startActive ? "ENABLE" : "DISABLE",
    })
    const campaignId = asId(asObject(campaign).campaign_id)
    if (!campaignId) throw refused("campaign", "TikTok did not return the campaign.")

    try {
      const adGroup = await this.call("ad_set", token, "POST", "/adgroup/create/", {
        advertiser_id: advertiserId,
        campaign_id: campaignId,
        adgroup_name: input.name,
        promotion_type: "WEBSITE",
        placement_type: "PLACEMENT_TYPE_NORMAL",
        placements: ["PLACEMENT_TIKTOK"],
        location_ids: [locationId],
        age_groups: ages,
        ...(input.gender !== "all"
          ? { gender: input.gender === "male" ? "GENDER_MALE" : "GENDER_FEMALE" }
          : {}),
        budget_mode: "BUDGET_MODE_DAY",
        budget: input.dailyBudget,
        schedule_type: endTime ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
        schedule_start_time: startTime,
        ...(endTime ? { schedule_end_time: endTime } : {}),
        bid_type: "BID_TYPE_NO_BID",
        pacing: "PACING_MODE_SMOOTH",
        // The ad group is always on: the campaign's own switch decides whether it spends.
        operation_status: "ENABLE",
        ...(pixelCode
          ? {
              optimization_goal: "CONVERT",
              pixel_id: pixelCode,
              optimization_event: "FORM",
              billing_event: "OCPM",
            }
          : { optimization_goal: "CLICK", billing_event: "CPC" }),
      })
      const adGroupId = asId(asObject(adGroup).adgroup_id)
      if (!adGroupId) throw refused("ad_set", "TikTok did not return the ad group.")

      const videoId = await this.uploadVideo(token, input)
      const imageId = await this.coverImage(token, advertiserId, videoId)

      const ad = await this.call("ad", token, "POST", "/ad/create/", {
        advertiser_id: advertiserId,
        adgroup_id: adGroupId,
        creatives: [
          {
            ad_name: input.name,
            identity_type: identity.type,
            identity_id: identity.id,
            ...(identity.authorizedBcId
              ? { identity_authorized_bc_id: identity.authorizedBcId }
              : {}),
            ad_format: "SINGLE_VIDEO",
            video_id: videoId,
            image_ids: [imageId],
            ad_text: input.text,
            call_to_action: input.callToAction,
            landing_page_url: input.url,
          },
        ],
      })
      const adId = asId(asList(asObject(ad).ad_ids)[0])
      if (!adId) throw refused("ad", "TikTok did not return the ad.")

      return { campaignId, adGroupId, videoId, adId }
    } catch (error) {
      // Nothing half-built stays on the account. Deleting the campaign takes its ad group and ad
      // with it; a failure to delete must not hide the original reason.
      await this.campaignStatus(
        "campaign",
        { accessToken: token, advertiserId, campaignId },
        "DELETE"
      ).catch(() => undefined)
      throw error
    }
  }

  // Switches a published campaign on or off.
  async setCampaignStatus(input: {
    accessToken: string
    advertiserId: string
    campaignId: string
    active: boolean
  }): Promise<void> {
    await this.campaignStatus("status", input, input.active ? "ENABLE" : "DISABLE")
  }

  // Deletes a published campaign from the account, with its ad group and ad. A campaign that is
  // already gone (deleted in Ads Manager) counts as deleted: when the delete is refused the
  // campaign is looked up, and only one that is still there -- or a lookup that could not say --
  // makes the refusal stand.
  async deleteCampaign(input: {
    accessToken: string
    advertiserId: string
    campaignId: string
  }): Promise<void> {
    try {
      await this.campaignStatus("campaign", input, "DELETE")
    } catch (error) {
      if (isDenied(error)) throw error
      const gone = await this.call("campaign", input.accessToken, "GET", "/campaign/get/", {
        advertiser_id: input.advertiserId,
        filtering: { campaign_ids: [input.campaignId] },
      }).then(
        (data) => asList(asObject(data).list).length === 0,
        (lookup: unknown) => {
          if (isDenied(lookup)) throw lookup
          return false
        }
      )
      if (!gone) throw error
    }
  }
}
