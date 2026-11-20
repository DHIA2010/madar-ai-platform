// Publishes one campaign to Snapchat through its Marketing API: a campaign, one ad set, the
// creative's file, the creative and one ad -- the same pieces Ads Manager builds, in the same
// order. Every piece is created before the next one needs its id. If a later step fails, the
// campaign created so far is deleted, so a failed publish leaves nothing behind on the account.
//
// Snapchat answers each write with { request_status, <items>: [{ sub_request_status, sub_request
// _error_reason, <item> }] } -- a 200 can still carry a refused item, so both are checked.

export type SnapchatObjective = "traffic" | "leads"

export const SNAPCHAT_CALLS_TO_ACTION = [
  "MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "GET_NOW",
] as const
export type SnapchatCallToAction = (typeof SNAPCHAT_CALLS_TO_ACTION)[number]

// Snapchat's own limits for the text on an ad.
export const SNAPCHAT_HEADLINE_MAX = 34
export const SNAPCHAT_BRAND_NAME_MAX = 25

export interface SnapchatPublishInput {
  accessToken: string
  adAccountId: string
  name: string
  objective: SnapchatObjective
  // In the ad account's currency.
  dailyBudget: number
  startAt: string
  endAt: string | null
  countryCode: string
  minAge: number
  maxAge: number | null
  gender: "all" | "male" | "female"
  media: { kind: "image" | "video"; bytes: Buffer; contentType: string; fileName: string }
  brandName: string
  headline: string
  callToAction: SnapchatCallToAction
  url: string
  // Whether the campaign starts spending as soon as Snapchat approves the ad, or waits switched
  // off for the merchant to turn it on.
  startActive: boolean
}

export interface SnapchatPublishedIds {
  campaignId: string
  adSquadId: string
  mediaId: string
  creativeId: string
  adId: string
}

export type SnapchatPublishStep =
  | "account"
  | "campaign"
  | "ad_set"
  | "media"
  | "creative"
  | "ad"
  | "status"

// A step Snapchat refused, with its own explanation.
export class SnapchatPublishError extends Error {
  constructor(
    readonly step: SnapchatPublishStep,
    readonly reason: string,
    // Something the merchant can fix on their side, as opposed to a refusal to read as-is.
    readonly code:
      | "SNAPCHAT_REFUSED"
      | "SNAPCHAT_NO_PUBLIC_PROFILE"
      | "SNAPCHAT_NO_PIXEL"
      | "SNAPCHAT_MEDIA_NOT_READY"
      | "SNAPCHAT_ACCESS_DENIED" = "SNAPCHAT_REFUSED"
  ) {
    super(`Snapchat refused the ${step} step: ${reason}`)
    this.name = "SnapchatPublishError"
  }
}

type Json = Record<string, unknown>
type Fetch = typeof fetch

const DEFAULT_API_BASE = "https://adsapi.snapchat.com/v1"
const DEFAULT_PROFILE_API_BASE = "https://businessapi.snapchat.com/v1"
const MEDIA_READY_ATTEMPTS = 20
const MEDIA_READY_WAIT_MS = 3000

function reasonOf(body: Json, listKey: string | null): string {
  const items = listKey && Array.isArray(body[listKey]) ? (body[listKey] as Json[]) : []
  const item = items.find((entry) => entry.sub_request_status !== "SUCCESS")
  const text =
    (item?.sub_request_error_reason as string | undefined) ??
    (body.debug_message as string | undefined) ??
    (body.display_message as string | undefined) ??
    (body.error_code as string | undefined) ??
    "no reason given"
  return String(text).slice(0, 400)
}

export class SnapchatCampaignPublisher {
  private readonly base: string
  private readonly profileBase: string

  constructor(
    private readonly options: {
      apiBaseUrl?: string
      profileApiBaseUrl?: string
      fetch?: Fetch
      wait?: (ms: number) => Promise<void>
    } = {}
  ) {
    this.base = (
      options.apiBaseUrl ??
      process.env.SNAPCHAT_MARKETING_API_BASE_URL ??
      DEFAULT_API_BASE
    ).replace(/\/$/, "")
    this.profileBase = (options.profileApiBaseUrl ?? DEFAULT_PROFILE_API_BASE).replace(/\/$/, "")
  }

  private get fetch(): Fetch {
    return this.options.fetch ?? fetch
  }

  private wait(ms: number) {
    return this.options.wait
      ? this.options.wait(ms)
      : new Promise<void>((resolve) => setTimeout(resolve, ms))
  }

  private async call(
    step: SnapchatPublishStep,
    token: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Json
  ): Promise<Json> {
    const response = await this.fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let parsed: Json = {}
    try {
      parsed = text ? (JSON.parse(text) as Json) : {}
    } catch {
      parsed = { debug_message: text.slice(0, 300) }
    }
    if (response.status === 401 || response.status === 403) {
      throw new SnapchatPublishError(step, reasonOf(parsed, null), "SNAPCHAT_ACCESS_DENIED")
    }
    if (!response.ok) throw new SnapchatPublishError(step, reasonOf(parsed, null))
    return parsed
  }

  // One created item out of a write's reply, or the reason it was refused.
  private created(step: SnapchatPublishStep, body: Json, listKey: string, itemKey: string): Json {
    const items = Array.isArray(body[listKey]) ? (body[listKey] as Json[]) : []
    const first = items[0]
    const item = first?.[itemKey] as Json | undefined
    if (body.request_status !== "SUCCESS" || first?.sub_request_status !== "SUCCESS" || !item?.id) {
      throw new SnapchatPublishError(step, reasonOf(body, listKey))
    }
    return item
  }

  // The public profile ads on this account are shown under -- Snapchat requires one on every
  // creative. The Marketing API has no lookup for it (checked against a live account: the
  // profiles list lives on Snapchat's business API and needs a permission of its own), so it is
  // read from an ad the account already has; the business API is still tried for an account with
  // no ads yet, in case the connection is allowed there.
  private async publicProfileId(token: string, adAccountId: string): Promise<string> {
    const creatives = await this.call(
      "account",
      token,
      "GET",
      `/adaccounts/${adAccountId}/creatives?limit=50`
    )
    for (const entry of Array.isArray(creatives.creatives) ? (creatives.creatives as Json[]) : []) {
      const profileId = ((entry.creative as Json | undefined)?.profile_properties as Json)
        ?.profile_id
      if (typeof profileId === "string") return profileId
    }

    const account = await this.call("account", token, "GET", `/adaccounts/${adAccountId}`)
    const organizationId = (
      (Array.isArray(account.adaccounts) ? (account.adaccounts as Json[]) : [])[0]?.adaccount as
        | Json
        | undefined
    )?.organization_id
    if (typeof organizationId === "string") {
      const response = await this.fetch(
        `${this.profileBase}/organizations/${organizationId}/public_profiles`,
        { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }
      ).catch(() => null)
      const body = response?.ok ? ((await response.json().catch(() => ({}))) as Json) : {}
      const profile = (Array.isArray(body.public_profiles) ? (body.public_profiles as Json[]) : [])
        .map((entry) => (entry.public_profile ?? entry) as Json)
        .find((entry) => typeof entry.id === "string")
      if (profile) return profile.id as string
    }
    throw new SnapchatPublishError(
      "account",
      "No public profile could be found for the ad account.",
      "SNAPCHAT_NO_PUBLIC_PROFILE"
    )
  }

  // The account's pixel, which a leads campaign is measured by.
  private async pixelId(token: string, adAccountId: string): Promise<string> {
    const body = await this.call("account", token, "GET", `/adaccounts/${adAccountId}/pixels`)
    const pixel = (Array.isArray(body.pixels) ? (body.pixels as Json[]) : [])
      .map((entry) => entry.pixel as Json | undefined)
      .find((entry) => typeof entry?.id === "string")
    if (!pixel) {
      throw new SnapchatPublishError(
        "account",
        "The ad account has no Snap Pixel, which a sign-ups campaign needs.",
        "SNAPCHAT_NO_PIXEL"
      )
    }
    return pixel.id as string
  }

  private async uploadMedia(token: string, input: SnapchatPublishInput): Promise<string> {
    const { adAccountId, media } = input
    const created = this.created(
      "media",
      await this.call("media", token, "POST", `/adaccounts/${adAccountId}/media`, {
        media: [
          {
            name: input.name,
            type: media.kind === "video" ? "VIDEO" : "IMAGE",
            ad_account_id: adAccountId,
          },
        ],
      }),
      "media",
      "media"
    )
    const mediaId = created.id as string

    const form = new FormData()
    form.append(
      "file",
      new Blob([new Uint8Array(media.bytes)], { type: media.contentType }),
      media.fileName
    )
    const upload = await this.fetch(`${this.base}/media/${mediaId}/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    if (!upload.ok) {
      const text = await upload.text().catch(() => "")
      let reason = text.slice(0, 300)
      try {
        reason = reasonOf(JSON.parse(text) as Json, null)
      } catch {
        // Not JSON: the raw text is the reason.
      }
      throw new SnapchatPublishError("media", reason || `upload failed (${upload.status})`)
    }

    // Snapchat processes the file after the upload (a video takes longer); a creative can only
    // use it once it is READY.
    for (let attempt = 0; attempt < MEDIA_READY_ATTEMPTS; attempt += 1) {
      const body = await this.call("media", token, "GET", `/media/${mediaId}`)
      const state = (
        (Array.isArray(body.media) ? (body.media as Json[]) : [])[0]?.media as Json | undefined
      )?.media_status
      if (state === "READY") return mediaId
      await this.wait(MEDIA_READY_WAIT_MS)
    }
    throw new SnapchatPublishError(
      "media",
      "Snapchat is still processing the file.",
      "SNAPCHAT_MEDIA_NOT_READY"
    )
  }

  async publish(input: SnapchatPublishInput): Promise<SnapchatPublishedIds> {
    const token = input.accessToken
    const account = input.adAccountId
    // Everything the campaign depends on is looked up first, so a missing piece stops the publish
    // before anything is created.
    const profileId = await this.publicProfileId(token, account)
    const pixelId = input.objective === "leads" ? await this.pixelId(token, account) : null

    const campaign = this.created(
      "campaign",
      await this.call("campaign", token, "POST", `/adaccounts/${account}/campaigns`, {
        campaigns: [
          {
            name: input.name,
            ad_account_id: account,
            status: input.startActive ? "ACTIVE" : "PAUSED",
            start_time: input.startAt,
            ...(input.endAt ? { end_time: input.endAt } : {}),
            buy_model: "AUCTION",
            objective_v2_properties: {
              objective_v2_type: input.objective === "leads" ? "LEADS" : "TRAFFIC",
            },
          },
        ],
      }),
      "campaigns",
      "campaign"
    )
    const campaignId = campaign.id as string

    try {
      const demographic: Json = { min_age: String(input.minAge), operation: "INCLUDE" }
      if (input.maxAge) demographic.max_age = String(input.maxAge)
      if (input.gender !== "all") demographic.gender = input.gender.toUpperCase()
      const adSquad = this.created(
        "ad_set",
        await this.call("ad_set", token, "POST", `/campaigns/${campaignId}/adsquads`, {
          adsquads: [
            {
              name: input.name,
              campaign_id: campaignId,
              status: "ACTIVE",
              type: "SNAP_ADS",
              targeting: {
                regulated_content: false,
                geos: [{ country_code: input.countryCode.toLowerCase(), operation: "INCLUDE" }],
                demographics: [demographic],
              },
              placement_v2: { config: "AUTOMATIC" },
              billing_event: "IMPRESSION",
              auto_bid: true,
              bid_strategy: "AUTO_BID",
              daily_budget_micro: Math.round(input.dailyBudget * 1_000_000),
              delivery_constraint: "DAILY_BUDGET",
              pacing_type: "STANDARD",
              child_ad_type: "REMOTE_WEBPAGE",
              start_time: input.startAt,
              ...(input.endAt ? { end_time: input.endAt } : {}),
              ...(pixelId
                ? {
                    optimization_goal: "PIXEL_SIGNUP",
                    pixel_id: pixelId,
                    conversion_window: "SWIPE_28DAY_VIEW_1DAY",
                  }
                : { optimization_goal: "SWIPES" }),
            },
          ],
        }),
        "adsquads",
        "adsquad"
      )
      const adSquadId = adSquad.id as string

      const mediaId = await this.uploadMedia(token, input)

      const creative = this.created(
        "creative",
        await this.call("creative", token, "POST", `/adaccounts/${account}/creatives`, {
          creatives: [
            {
              ad_account_id: account,
              name: input.name,
              type: "WEB_VIEW",
              headline: input.headline,
              brand_name: input.brandName,
              shareable: true,
              call_to_action: input.callToAction,
              top_snap_media_id: mediaId,
              web_view_properties: { url: input.url },
              profile_properties: { profile_id: profileId },
            },
          ],
        }),
        "creatives",
        "creative"
      )
      const creativeId = creative.id as string

      const ad = this.created(
        "ad",
        await this.call("ad", token, "POST", `/adsquads/${adSquadId}/ads`, {
          ads: [
            {
              ad_squad_id: adSquadId,
              creative_id: creativeId,
              name: input.name,
              type: "REMOTE_WEBPAGE",
              status: "ACTIVE",
            },
          ],
        }),
        "ads",
        "ad"
      )

      return { campaignId, adSquadId, mediaId, creativeId, adId: ad.id as string }
    } catch (error) {
      // Nothing half-built stays on the account. Deleting the campaign takes its ad set and ad
      // with it; a failure to delete must not hide the original reason.
      await this.call("campaign", token, "DELETE", `/campaigns/${campaignId}`).catch(
        () => undefined
      )
      throw error
    }
  }

  // Deletes a published campaign from the account, with its ad set and ad. A campaign that is
  // already gone (deleted in Ads Manager) counts as deleted: Snapchat no longer answers for it,
  // so when the delete is refused the campaign is looked up, and only one that is still there
  // makes the refusal stand.
  async deleteCampaign(input: { accessToken: string; campaignId: string }): Promise<void> {
    try {
      await this.call("campaign", input.accessToken, "DELETE", `/campaigns/${input.campaignId}`)
    } catch (error) {
      if (error instanceof SnapchatPublishError && error.code === "SNAPCHAT_ACCESS_DENIED") {
        throw error
      }
      const stillThere = await this.call(
        "campaign",
        input.accessToken,
        "GET",
        `/campaigns/${input.campaignId}`
      ).then(
        (body) => Array.isArray(body.campaigns) && body.campaigns.length > 0,
        (lookup: unknown) => {
          if (lookup instanceof SnapchatPublishError && lookup.code === "SNAPCHAT_ACCESS_DENIED") {
            throw lookup
          }
          return false
        }
      )
      if (stillThere) throw error
    }
  }

  // Switches a published campaign on or off. Snapchat updates a campaign by sending the whole
  // campaign back, so it is read first and returned with only its status changed.
  async setCampaignStatus(input: {
    accessToken: string
    adAccountId: string
    campaignId: string
    active: boolean
  }): Promise<void> {
    const body = await this.call(
      "status",
      input.accessToken,
      "GET",
      `/campaigns/${input.campaignId}`
    )
    const current = (Array.isArray(body.campaigns) ? (body.campaigns as Json[]) : [])[0]
      ?.campaign as Json | undefined
    if (!current)
      throw new SnapchatPublishError("status", "The campaign was not found on Snapchat.")
    const readOnly = new Set(["updated_at", "created_at", "delivery_status", "creation_state"])
    const next: Json = Object.fromEntries(
      Object.entries(current).filter(([key]) => !readOnly.has(key))
    )
    next.status = input.active ? "ACTIVE" : "PAUSED"
    this.created(
      "status",
      await this.call(
        "status",
        input.accessToken,
        "PUT",
        `/adaccounts/${input.adAccountId}/campaigns`,
        { campaigns: [next] }
      ),
      "campaigns",
      "campaign"
    )
  }
}
