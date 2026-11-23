// Publishes one campaign to Meta (Facebook and Instagram, automatic placements) through its
// Marketing API: a campaign, one ad set, the creative's file, the creative and one ad -- the same
// pieces Ads Manager builds, in the same order. Every piece is created before the next one needs
// its id. If a later step fails, the campaign created so far is deleted, so a failed publish
// leaves nothing behind on the account.
//
// Meta answers a refusal with { error: { message, error_user_msg, code } }, usually with a 400;
// both the HTTP status and the body are checked.

import {
  PlatformPublishError,
  type MetaCallToAction,
  type MetaPublishedIds,
  type MetaPublishInput,
  type PublishMedia,
  type PublishStep,
} from "./platform"

type Json = Record<string, unknown>
type Fetch = typeof fetch

const DEFAULT_API_BASE = "https://graph.facebook.com/v21.0"
const MEDIA_READY_ATTEMPTS = 20
const MEDIA_READY_WAIT_MS = 3000
// Meta's widest age range; "65" means 65 and older.
const META_MIN_AGE = 18
const META_MAX_AGE = 65
// Meta's code for "the object does not exist" (or the request is malformed).
const META_INVALID_PARAMETER = 100

// One ad as Meta is asked to build it: the file, the words around it and where it leads.
interface MetaAdPiece {
  name: string
  media: PublishMedia
  text: string
  headline: string
  callToAction: MetaCallToAction
  url: string
}

// The account as Meta names it; it arrives with or without the "act_" prefix.
function accountOf(adAccountId: string): string {
  return `act_${adAccountId.trim().replace(/^act_/i, "")}`
}

interface MetaAnswer {
  status: number
  ok: boolean
  body: Json
  error: Json | null
  denied: boolean
}

// Meta's permission-denied codes: 10 and the 200s.
function metaDenied(code: unknown): boolean {
  const value = Number(code)
  return value === 10 || (value >= 200 && value <= 299)
}

function reasonOf(answer: MetaAnswer): string {
  const text =
    (answer.error?.error_user_msg as string | undefined) ||
    (answer.error?.message as string | undefined) ||
    `request failed (${answer.status})`
  return String(text).slice(0, 400)
}

function listOf(body: Json): Json[] {
  return Array.isArray(body.data) ? (body.data as Json[]) : []
}

function isDenied(error: unknown): boolean {
  return error instanceof PlatformPublishError && error.code === "META_ACCESS_DENIED"
}

export class MetaCampaignPublisher {
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
      process.env.IDENTITY_PLATFORM_META_GRAPH_API_BASE_URL ??
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

  // One request, answered without throwing, so a caller can tell a missing object from any other
  // refusal. A file goes as a form; everything else as JSON.
  private async request(
    token: string,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Json | FormData
  ): Promise<MetaAnswer> {
    const isForm = body instanceof FormData
    const response = await this.fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body && !isForm ? { "content-type": "application/json" } : {}),
      },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let parsed: Json = {}
    try {
      parsed = text ? (JSON.parse(text) as Json) : {}
    } catch {
      parsed = { error: { message: text.slice(0, 300) } }
    }
    // A JSON answer that is not an object (a bare `true`) carries no error.
    if (!parsed || typeof parsed !== "object") parsed = {}
    const error =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as Json)
        : !response.ok || parsed.success === false
          ? {}
          : null
    return {
      status: response.status,
      ok: response.ok && !error,
      body: parsed,
      error,
      denied: response.status === 401 || response.status === 403 || metaDenied(error?.code),
    }
  }

  private async call(
    step: PublishStep,
    token: string,
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Json | FormData
  ): Promise<Json> {
    const answer = await this.request(token, method, path, body)
    if (!answer.ok) {
      throw new PlatformPublishError(
        "meta",
        step,
        reasonOf(answer),
        answer.denied ? "ACCESS_DENIED" : "REFUSED"
      )
    }
    return answer.body
  }

  // The id of what a write created, or a refusal when Meta answered without one.
  private createdId(step: PublishStep, body: Json): string {
    const id = body.id
    if (typeof id !== "string" && typeof id !== "number") {
      throw new PlatformPublishError("meta", step, "Meta did not return an id.")
    }
    return String(id)
  }

  // The Facebook page the ad is shown under -- Meta requires one on every creative. The pages
  // the ad account may promote are asked for first; an account that lists none (or cannot be
  // asked) falls back to the pages the connected person manages.
  private async pageId(token: string, account: string): Promise<string> {
    const promotable = await this.call(
      "account",
      token,
      "GET",
      `/${account}/promote_pages?fields=id,name&limit=25`
    ).catch((error: unknown) => {
      if (isDenied(error)) throw error
      return {} as Json
    })
    const promoted = listOf(promotable).find((entry) => typeof entry.id === "string")
    if (promoted) return promoted.id as string

    const managed = await this.call(
      "account",
      token,
      "GET",
      "/me/accounts?fields=id,name&limit=25"
    ).catch((error: unknown) => {
      if (isDenied(error)) throw error
      return {} as Json
    })
    const page = listOf(managed).find((entry) => typeof entry.id === "string")
    if (page) return page.id as string

    throw new PlatformPublishError(
      "meta",
      "account",
      "No Facebook page could be found to show the ad under.",
      "NO_PAGE"
    )
  }

  // The account's pixel, which a leads campaign is measured by.
  private async pixelId(token: string, account: string): Promise<string> {
    const body = await this.call(
      "account",
      token,
      "GET",
      `/${account}/adspixels?fields=id,name&limit=25`
    )
    const pixel = listOf(body).find((entry) => typeof entry.id === "string")
    if (!pixel) {
      throw new PlatformPublishError(
        "meta",
        "account",
        "The ad account has no Meta Pixel, which a sign-ups campaign needs.",
        "NO_PIXEL"
      )
    }
    return pixel.id as string
  }

  // Uploads a picture; Meta names it by the hash of its bytes, which is what a creative uses.
  private async uploadImage(token: string, account: string, media: PublishMedia): Promise<string> {
    const form = new FormData()
    form.append(
      "filename",
      new Blob([new Uint8Array(media.bytes)], { type: media.contentType }),
      media.fileName
    )
    const body = await this.call("media", token, "POST", `/${account}/adimages`, form)
    // { images: { "<file name>": { hash, url } } }
    const images = (body.images ?? {}) as Record<string, Json | undefined>
    const hash = Object.values(images)[0]?.hash
    if (typeof hash !== "string") {
      throw new PlatformPublishError("meta", "media", "Meta did not return the image's hash.")
    }
    return hash
  }

  // Uploads a video and waits for Meta to finish processing it (a creative can only use it once
  // it is ready). A video creative needs a still picture too; Meta makes some while processing,
  // and the first one is returned with the id.
  private async uploadVideo(
    token: string,
    account: string,
    media: PublishMedia,
    name: string
  ): Promise<{ videoId: string; thumbnailUrl: string | null }> {
    const form = new FormData()
    form.append(
      "source",
      new Blob([new Uint8Array(media.bytes)], { type: media.contentType }),
      media.fileName
    )
    form.append("name", name)
    const videoId = this.createdId(
      "media",
      await this.call("media", token, "POST", `/${account}/advideos`, form)
    )

    for (let attempt = 0; attempt < MEDIA_READY_ATTEMPTS; attempt += 1) {
      const body = await this.call(
        "media",
        token,
        "GET",
        `/${videoId}?fields=status,thumbnails{uri}`
      )
      const state = (body.status as Json | undefined)?.video_status
      if (state === "ready") {
        const thumbnail = listOf((body.thumbnails ?? {}) as Json).find(
          (entry) => typeof entry.uri === "string"
        )
        return { videoId, thumbnailUrl: (thumbnail?.uri as string | undefined) ?? null }
      }
      // Meta gave up on the file: waiting longer will not help.
      if (state === "error") {
        throw new PlatformPublishError("meta", "media", "Meta could not process the video.")
      }
      await this.wait(MEDIA_READY_WAIT_MS)
    }
    throw new PlatformPublishError(
      "meta",
      "media",
      "Meta is still processing the file.",
      "MEDIA_NOT_READY"
    )
  }

  // One ad inside an ad set that exists: the file is uploaded, the creative built from it and the
  // ad created, shown under the given page. Nothing is deleted here when a step is refused.
  private async adInAdSet(
    token: string,
    account: string,
    pageId: string,
    adSetId: string,
    piece: MetaAdPiece
  ): Promise<{ creativeId: string; adId: string }> {
    const callToAction = { type: piece.callToAction, value: { link: piece.url } }
    let story: Json
    if (piece.media.kind === "video") {
      const { videoId, thumbnailUrl } = await this.uploadVideo(
        token,
        account,
        piece.media,
        piece.name
      )
      story = {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          message: piece.text,
          title: piece.headline,
          ...(thumbnailUrl ? { image_url: thumbnailUrl } : {}),
          call_to_action: callToAction,
        },
      }
    } else {
      const imageHash = await this.uploadImage(token, account, piece.media)
      story = {
        page_id: pageId,
        link_data: {
          link: piece.url,
          message: piece.text,
          name: piece.headline,
          image_hash: imageHash,
          call_to_action: callToAction,
        },
      }
    }

    const creativeId = this.createdId(
      "creative",
      await this.call("creative", token, "POST", `/${account}/adcreatives`, {
        name: piece.name,
        object_story_spec: story,
      })
    )

    const adId = this.createdId(
      "ad",
      await this.call("ad", token, "POST", `/${account}/ads`, {
        name: piece.name,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: "ACTIVE",
      })
    )

    return { creativeId, adId }
  }

  async publish(input: MetaPublishInput): Promise<MetaPublishedIds> {
    const token = input.accessToken
    const account = accountOf(input.adAccountId)
    // Everything the campaign depends on is looked up first, so a missing piece stops the publish
    // before anything is created.
    const pageId = await this.pageId(token, account)
    const pixelId = input.objective === "leads" ? await this.pixelId(token, account) : null

    const campaignId = this.createdId(
      "campaign",
      await this.call("campaign", token, "POST", `/${account}/campaigns`, {
        name: input.name,
        objective: input.objective === "leads" ? "OUTCOME_LEADS" : "OUTCOME_TRAFFIC",
        status: input.startActive ? "ACTIVE" : "PAUSED",
        special_ad_categories: [],
        buying_type: "AUCTION",
      })
    )

    try {
      const adSetId = this.createdId(
        "ad_set",
        await this.call("ad_set", token, "POST", `/${account}/adsets`, {
          name: input.name,
          campaign_id: campaignId,
          status: "ACTIVE",
          // Meta takes the currency's smallest unit (halalas for SAR).
          daily_budget: Math.round(input.dailyBudget * 100),
          billing_event: "IMPRESSIONS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          start_time: input.startAt,
          ...(input.endAt ? { end_time: input.endAt } : {}),
          // No placements are named, so Meta places the ad across Facebook and Instagram itself.
          targeting: {
            geo_locations: { countries: [input.countryCode.toUpperCase()] },
            age_min: Math.max(META_MIN_AGE, input.minAge),
            age_max: Math.min(META_MAX_AGE, input.maxAge ?? META_MAX_AGE),
            ...(input.gender !== "all" ? { genders: [input.gender === "male" ? 1 : 2] } : {}),
            // The audience is exactly the one chosen; Meta does not widen it.
            targeting_automation: { advantage_audience: 0 },
          },
          destination_type: "WEBSITE",
          ...(pixelId
            ? {
                optimization_goal: "OFFSITE_CONVERSIONS",
                promoted_object: { pixel_id: pixelId, custom_event_type: "LEAD" },
              }
            : { optimization_goal: "LINK_CLICKS" }),
        })
      )

      const { creativeId, adId } = await this.adInAdSet(token, account, pageId, adSetId, input)

      return { campaignId, adSetId, creativeId, adId }
    } catch (error) {
      // Nothing half-built stays on the account. Deleting the campaign takes its ad set and ad
      // with it; a failure to delete must not hide the original reason.
      await this.call("campaign", token, "DELETE", `/${campaignId}`).catch(() => undefined)
      throw error
    }
  }

  // A new ad in an ad set that already exists: the page it is shown under is looked up, then the
  // file, the creative and the ad are created. The ad set and its other ads are left as they
  // are, and nothing is deleted when a step is refused (an uploaded file or a creative without an
  // ad is not shown to anyone and costs nothing).
  async addAd(input: {
    accessToken: string
    // With or without the "act_" prefix.
    adAccountId: string
    adSetId: string
    name: string
    media: PublishMedia
    text: string
    headline: string
    callToAction: MetaCallToAction
    url: string
  }): Promise<{ adId: string; creativeId: string }> {
    const token = input.accessToken
    const account = accountOf(input.adAccountId)
    const pageId = await this.pageId(token, account)
    const { creativeId, adId } = await this.adInAdSet(token, account, pageId, input.adSetId, input)
    return { adId, creativeId }
  }

  // Changes what an ad set may spend a day (in the ad account's currency, whole units). Meta
  // takes just the field that changes, in the currency's smallest unit.
  async setAdSetBudget(input: {
    accessToken: string
    adSetId: string
    dailyBudget: number
  }): Promise<void> {
    await this.call("ad_set", input.accessToken, "POST", `/${input.adSetId}`, {
      daily_budget: Math.round(input.dailyBudget * 100),
    })
  }

  // Switches a published campaign on or off. Meta takes just the field that changes.
  async setCampaignStatus(input: {
    accessToken: string
    campaignId: string
    active: boolean
  }): Promise<void> {
    await this.call("status", input.accessToken, "POST", `/${input.campaignId}`, {
      status: input.active ? "ACTIVE" : "PAUSED",
    })
  }

  // Deletes a published campaign from the account, with its ad set and ad. A campaign that is
  // already gone (deleted in Ads Manager) counts as deleted: when the delete is refused the
  // campaign is looked up, and only one that is still there makes the refusal stand.
  async deleteCampaign(input: { accessToken: string; campaignId: string }): Promise<void> {
    try {
      await this.call("campaign", input.accessToken, "DELETE", `/${input.campaignId}`)
    } catch (error) {
      if (isDenied(error)) throw error
      const lookup = await this.request(
        input.accessToken,
        "GET",
        `/${input.campaignId}?fields=id,effective_status`
      )
      if (lookup.ok) {
        if (lookup.body.effective_status === "DELETED") return
        throw error
      }
      if (lookup.denied) {
        throw new PlatformPublishError("meta", "campaign", reasonOf(lookup), "ACCESS_DENIED")
      }
      // Meta no longer answers for it: the object does not exist.
      const gone =
        Number(lookup.error?.code) === META_INVALID_PARAMETER ||
        lookup.status === 400 ||
        lookup.status === 404
      if (!gone) throw error
    }
  }
}
