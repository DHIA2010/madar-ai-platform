// Publishes one campaign to Snapchat through its Marketing API: a campaign, one ad set, the
// creative's file, the creative and one ad -- the same pieces Ads Manager builds, in the same
// order. Every piece is created before the next one needs its id. If a later step fails, the
// campaign created so far is deleted, so a failed publish leaves nothing behind on the account.
//
// Snapchat answers each write with { request_status, <items>: [{ sub_request_status, sub_request
// _error_reason, <item> }] } -- a 200 can still carry a refused item, so both are checked.

// Snapchat's five campaign objectives. Four send people to a website; the fifth, promoting an
// app, sends them to the app's page in the App Store or Google Play (an "app install" ad) and
// needs the app's store details and its icon.
export type SnapchatObjective = "awareness" | "traffic" | "leads" | "sales" | "app"
export const SNAPCHAT_OBJECTIVES: readonly SnapchatObjective[] = [
  "awareness",
  "traffic",
  "leads",
  "sales",
  "app",
]

// The app an app-promotion campaign is for: its name as the ad shows it (30 letters at most),
// its number in the App Store, its package name in Google Play (one of the two is enough for
// Madar; the ad then goes to that store only), and its icon -- a square PNG, 200 to 2000 wide.
export interface SnapchatAppInput {
  name: string
  iosAppId?: string | null
  androidPackage?: string | null
  icon: { kind: "image" | "video"; bytes: Buffer; contentType: string; fileName: string }
}
export const SNAPCHAT_APP_NAME_MAX = 30
export const SNAPCHAT_APP_ICON_MIN = 200
export const SNAPCHAT_APP_ICON_MAX = 2000
const OBJECTIVE_TYPE: Record<SnapchatObjective, string> = {
  awareness: "AWARENESS_AND_ENGAGEMENT",
  traffic: "TRAFFIC",
  leads: "LEADS",
  sales: "SALES",
  app: "APP_PROMOTION",
}

// What an ad set is delivered for: who Snapchat shows the ad to. Each objective has its own
// choices; the first is what Madar picks when none is chosen. The PIXEL_ ones are measured by
// the account's Snap Pixel, so the account has to have one.
export type SnapchatGoal =
  | "IMPRESSIONS"
  | "SWIPES"
  | "APP_INSTALLS"
  | "VIDEO_VIEWS"
  | "PIXEL_PAGE_VIEW"
  | "PIXEL_SIGNUP"
  | "PIXEL_ADD_TO_CART"
  | "PIXEL_PURCHASE"
export const SNAPCHAT_GOALS: Record<SnapchatObjective, readonly SnapchatGoal[]> = {
  awareness: ["IMPRESSIONS", "VIDEO_VIEWS", "SWIPES"],
  traffic: ["SWIPES", "PIXEL_PAGE_VIEW"],
  leads: ["PIXEL_SIGNUP", "SWIPES"],
  sales: ["PIXEL_PURCHASE", "PIXEL_ADD_TO_CART", "PIXEL_PAGE_VIEW"],
  // Installs are counted by Snapchat only when the app reports them to it (the Snap app id or a
  // measurement partner, set up outside Madar); taps on the ad need nothing.
  app: ["APP_INSTALLS", "SWIPES"],
}

// How Snapchat bids for the ad set: on its own, around a cost per result to aim for, or never
// above a ceiling. Snapchat only takes a target cost for some goals.
export type SnapchatBidStrategy = "auto" | "target_cost" | "max_bid"
export const SNAPCHAT_TARGET_COST_GOALS: ReadonlySet<SnapchatGoal> = new Set([
  "SWIPES",
  "PIXEL_PAGE_VIEW",
  "PIXEL_SIGNUP",
  "PIXEL_ADD_TO_CART",
  "PIXEL_PURCHASE",
])
// Snapchat's floor for a campaign's daily or lifetime spend cap, in the account's currency.
export const SNAPCHAT_MIN_SPEND_CAP = 20

export const SNAPCHAT_CALLS_TO_ACTION = [
  "MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "GET_NOW",
  "INSTALL_NOW",
  "DOWNLOAD",
  "USE_APP",
] as const
export type SnapchatCallToAction = (typeof SNAPCHAT_CALLS_TO_ACTION)[number]
// The buttons an app-install ad may carry, and the ones only it may carry.
export const SNAPCHAT_APP_CALLS_TO_ACTION: readonly SnapchatCallToAction[] = [
  "INSTALL_NOW",
  "DOWNLOAD",
  "GET_NOW",
  "USE_APP",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
]
export const SNAPCHAT_APP_ONLY_CALLS_TO_ACTION: readonly SnapchatCallToAction[] = [
  "INSTALL_NOW",
  "DOWNLOAD",
  "USE_APP",
]

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
  // Where inside the country: some of its regions (Snapchat's own ids) or some of its cities
  // (snapchat-geo.ts). Left out or empty: the whole country.
  regionIds?: string[] | null
  cityKeys?: string[] | null
  // The languages people use Snapchat in, and Snapchat's own interests (snapchat-audience.ts).
  // Left out or empty: everyone.
  languages?: string[] | null
  interestIds?: string[] | null
  // The phones it is shown on: the system and the connection. Left out: every phone.
  deviceSystem?: SnapchatDeviceSystem | null
  deviceConnection?: SnapchatDeviceConnection | null
  // One amount for the whole run instead of an amount a day; it needs an end date. When set,
  // dailyBudget is only the average a day and is not sent.
  lifetimeBudget?: number | null
  // The app, for the app-promotion objective: every ad is then an app-install ad and `url` is
  // not used.
  app?: SnapchatAppInput | null
  // The names of the first ad group and the first ad; left out, the campaign's own name.
  adGroupName?: string | null
  adName?: string | null
  // More ad groups in the same campaign, each with its own budget and audience, and more ads.
  // Every ad is placed in every ad group.
  moreAdGroups?: SnapchatAdGroupInput[] | null
  moreAds?: SnapchatAdInput[] | null
  // What the ad set is delivered for; left out, the objective's own first choice.
  goal?: SnapchatGoal | null
  // The most the whole campaign may spend in a day, and over its life. Left out: no cap.
  campaignDailyCap?: number | null
  campaignLifetimeCap?: number | null
  // Left out: Snapchat bids on its own.
  bidStrategy?: SnapchatBidStrategy | null
  // The cost per result to aim for, or the ceiling, in the account's currency.
  bidAmount?: number | null
}

// One ad group of a campaign: its own budget and its own audience. The country, the dates, the
// goal and the bid are the campaign's.
export type SnapchatAdGroupInput = Pick<
  SnapchatPublishInput,
  | "dailyBudget"
  | "lifetimeBudget"
  | "minAge"
  | "maxAge"
  | "gender"
  | "regionIds"
  | "cityKeys"
  | "languages"
  | "interestIds"
  | "deviceSystem"
  | "deviceConnection"
> & { name: string }

// One ad of a campaign: its file, its text, its button and its link.
export type SnapchatAdInput = Pick<
  SnapchatPublishInput,
  "media" | "headline" | "callToAction" | "url"
> & { name: string }

export interface SnapchatPublishedIds {
  campaignId: string
  // The first ad group, and the first ad in it with its creative and its file.
  adSquadId: string
  mediaId: string
  creativeId: string
  adId: string
  // Only when the campaign has more than one ad group or ad: every ad group, and every ad
  // placed (adIndex says which of the campaign's ads it shows, the first being 0).
  adSquadIds?: string[]
  ads?: Array<{
    adId: string
    adSquadId: string
    creativeId: string
    mediaId: string
    adIndex: number
  }>
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
      | "SNAPCHAT_ACCESS_DENIED"
      | "SNAPCHAT_GONE" = "SNAPCHAT_REFUSED"
  ) {
    super(`Snapchat refused the ${step} step: ${reason}`)
    this.name = "SnapchatPublishError"
  }
}

import {
  interestNameAr,
  languageNameAr,
  snapchatDevices,
  type SnapchatDeviceConnection,
  type SnapchatDeviceSystem,
  type SnapchatInterest,
  type SnapchatLanguage,
} from "./snapchat-audience"
import { regionNameAr, snapchatPlaces, type SnapchatRegion } from "./snapchat-geo"

type Json = Record<string, unknown>

// The three things an account holds, from the top down, and how Snapchat's API names each: its
// list and item keys, the parent it is updated through, and the fields only Snapchat may write.
export type SnapchatEntityLevel = "campaign" | "ad_set" | "ad"

const ENTITY_SHAPES: Record<
  SnapchatEntityLevel,
  { list: string; item: string; parentList: string; parentKey: string; readOnly: Set<string> }
> = {
  campaign: {
    list: "campaigns",
    item: "campaign",
    parentList: "adaccounts",
    parentKey: "ad_account_id",
    readOnly: new Set(["updated_at", "created_at", "delivery_status", "creation_state"]),
  },
  ad_set: {
    list: "adsquads",
    item: "adsquad",
    parentList: "campaigns",
    parentKey: "campaign_id",
    readOnly: new Set([
      "updated_at",
      "created_at",
      "delivery_status",
      "targeting_reach_status",
      "creation_state",
      "delivery_properties_version",
    ]),
  },
  ad: {
    list: "ads",
    item: "ad",
    parentList: "adsquads",
    parentKey: "ad_squad_id",
    readOnly: new Set([
      "updated_at",
      "created_at",
      "delivery_status",
      "review_status",
      "review_status_reasons",
    ]),
  },
}
type Fetch = typeof fetch

// What a creative is sent back with when it is changed or copied: the fields a change was
// accepted with on a live account (its text, its button, its file, its link and its profile),
// and whatever "..._properties" its kind carries. Everything else Snapchat fills in itself.
const CREATIVE_WRITABLE = new Set([
  "id",
  "ad_account_id",
  "name",
  "type",
  "headline",
  "brand_name",
  "shareable",
  "call_to_action",
  "top_snap_media_id",
])
const writableCreative = (creative: Json): Json =>
  Object.fromEntries(
    Object.entries(creative).filter(
      ([key]) => CREATIVE_WRITABLE.has(key) || key.endsWith("_properties")
    )
  )

// A campaign or an ad set as the start of a copy: without its id and the fields only Snapchat
// writes, and with dates that still make sense -- a start that has passed becomes now, an end
// that has passed is dropped.
function freshCopy(source: Json, readOnly: Set<string>, now = new Date()): Json {
  const copy: Json = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "id" && !readOnly.has(key))
  )
  const at = (value: unknown) => (typeof value === "string" ? Date.parse(value) : Number.NaN)
  if (!(at(copy.start_time) > now.getTime())) copy.start_time = now.toISOString()
  if (copy.end_time !== undefined && !(at(copy.end_time) > now.getTime())) delete copy.end_time
  return copy
}

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

  private async uploadMedia(
    token: string,
    input: Pick<SnapchatPublishInput, "adAccountId" | "media" | "name">
  ): Promise<string> {
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
    const goal = input.goal ?? SNAPCHAT_GOALS[input.objective][0]
    const pixelId = goal.startsWith("PIXEL_") ? await this.pixelId(token, account) : null
    const micro = (amount: number) => Math.round(amount * 1_000_000)
    const bidStrategy = input.bidStrategy ?? "auto"
    const bidding: Json =
      bidStrategy === "auto" || !input.bidAmount
        ? { auto_bid: true, bid_strategy: "AUTO_BID" }
        : {
            auto_bid: false,
            target_bid: bidStrategy === "target_cost",
            bid_strategy:
              bidStrategy === "target_cost" ? "TARGET_COST" : "LOWEST_COST_WITH_MAX_BID",
            bid_micro: micro(input.bidAmount),
          }

    const app = input.objective === "app" ? (input.app ?? null) : null
    if (input.objective === "app" && !(app?.iosAppId || app?.androidPackage)) {
      throw new SnapchatPublishError("campaign", "An app campaign needs the app's store details.")
    }
    // An app in one store only is shown to that store's phones, unless phones were chosen.
    const onlySystem: SnapchatDeviceSystem | null = !app
      ? null
      : app.iosAppId && !app.androidPackage
        ? "ios"
        : app.androidPackage && !app.iosAppId
          ? "android"
          : null
    const adType = app ? "APP_INSTALL" : "REMOTE_WEBPAGE"

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
            objective_v2_properties: { objective_v2_type: OBJECTIVE_TYPE[input.objective] },
            // Snapchat asks for the app's store ids on a campaign of app-install ads, to count
            // installs against it.
            ...(app
              ? {
                  measurement_spec: {
                    ...(app.iosAppId ? { ios_app_id: app.iosAppId } : {}),
                    ...(app.androidPackage ? { android_app_url: app.androidPackage } : {}),
                  },
                }
              : {}),
            ...(input.campaignDailyCap
              ? { daily_budget_micro: micro(input.campaignDailyCap) }
              : {}),
            ...(input.campaignLifetimeCap
              ? { lifetime_spend_cap_micro: micro(input.campaignLifetimeCap) }
              : {}),
          },
        ],
      }),
      "campaigns",
      "campaign"
    )
    const campaignId = campaign.id as string

    const groups: SnapchatAdGroupInput[] = [
      { ...input, name: input.adGroupName?.trim() || input.name },
      ...(input.moreAdGroups ?? []),
    ]
    const ads: SnapchatAdInput[] = [
      { ...input, name: input.adName?.trim() || input.name },
      ...(input.moreAds ?? []),
    ]
    try {
      // Every ad group first, then each ad's file and creative once, then the ad itself in
      // every ad group.
      const adSquadIds: string[] = []
      for (const group of groups) {
        const places = snapchatPlaces(input.countryCode, group.regionIds, group.cityKeys)
        const demographic: Json = { min_age: String(group.minAge), operation: "INCLUDE" }
        if (group.maxAge) demographic.max_age = String(group.maxAge)
        if (group.gender !== "all") demographic.gender = group.gender.toUpperCase()
        if (group.languages?.length) demographic.languages = [...new Set(group.languages)]
        const interestIds = [...new Set(group.interestIds ?? [])]
        const devices = snapchatDevices(
          onlySystem && (!group.deviceSystem || group.deviceSystem === "all")
            ? onlySystem
            : group.deviceSystem,
          group.deviceConnection
        )
        const lifetime = group.lifetimeBudget && input.endAt ? group.lifetimeBudget : null
        const adSquad = this.created(
          "ad_set",
          await this.call("ad_set", token, "POST", `/campaigns/${campaignId}/adsquads`, {
            adsquads: [
              {
                name: group.name,
                campaign_id: campaignId,
                status: "ACTIVE",
                type: "SNAP_ADS",
                targeting: {
                  regulated_content: false,
                  geos: places.geos,
                  ...(places.locations ? { locations: places.locations } : {}),
                  demographics: [demographic],
                  ...(interestIds.length > 0
                    ? { interests: [{ category_id: interestIds, operation: "INCLUDE" }] }
                    : {}),
                  ...(devices ? { devices } : {}),
                },
                placement_v2: { config: "AUTOMATIC" },
                billing_event: "IMPRESSION",
                ...bidding,
                ...(lifetime
                  ? {
                      lifetime_budget_micro: micro(lifetime),
                      delivery_constraint: "LIFETIME_BUDGET",
                    }
                  : {
                      daily_budget_micro: micro(group.dailyBudget),
                      delivery_constraint: "DAILY_BUDGET",
                    }),
                pacing_type: "STANDARD",
                child_ad_type: adType,
                start_time: input.startAt,
                ...(input.endAt ? { end_time: input.endAt } : {}),
                optimization_goal: goal,
                ...(pixelId
                  ? { pixel_id: pixelId, conversion_window: "SWIPE_28DAY_VIEW_1DAY" }
                  : {}),
              },
            ],
          }),
          "adsquads",
          "adsquad"
        )
        adSquadIds.push(adSquad.id as string)
      }

      // The app's icon is uploaded once and shown on every ad.
      const appShown = app
        ? {
            name: app.name,
            iosAppId: app.iosAppId ?? null,
            androidPackage: app.androidPackage ?? null,
            iconMediaId: await this.uploadMedia(token, {
              adAccountId: account,
              media: app.icon,
              name: `${app.name} icon`,
            }),
          }
        : null
      const placed: NonNullable<SnapchatPublishedIds["ads"]> = []
      for (const [adIndex, ad] of ads.entries()) {
        const made = await this.makeCreative(token, {
          ...ad,
          adAccountId: account,
          brandName: input.brandName,
          profileId,
          app: appShown,
        })
        for (const adSquadId of adSquadIds) {
          const put = await this.placeAd(token, {
            adSquadId,
            creativeId: made.creativeId,
            name: ad.name,
            type: adType,
          })
          placed.push({ adId: put.id as string, adSquadId, ...made, adIndex })
        }
      }
      const first = placed[0]
      return {
        campaignId,
        adSquadId: adSquadIds[0],
        mediaId: first.mediaId,
        creativeId: first.creativeId,
        adId: first.adId,
        ...(placed.length > 1 ? { adSquadIds, ads: placed } : {}),
      }
    } catch (error) {
      // Nothing half-built stays on the account. Deleting the campaign takes its ad sets and ads
      // with it; a failure to delete must not hide the original reason.
      await this.call("campaign", token, "DELETE", `/campaigns/${campaignId}`).catch(
        () => undefined
      )
      throw error
    }
  }

  // The file, the creative that shows it, and the ad that puts the creative in an ad set: the
  // last three pieces of a publish, and all of "add an ad to an ad set that already exists".
  private async createAd(
    token: string,
    input: Pick<
      SnapchatPublishInput,
      "adAccountId" | "name" | "media" | "brandName" | "headline" | "callToAction" | "url"
    > & { adSquadId: string; profileId: string }
  ): Promise<{ mediaId: string; creativeId: string; adId: string; ad: Json }> {
    const made = await this.makeCreative(token, input)
    const ad = await this.placeAd(token, { ...input, creativeId: made.creativeId })
    return { ...made, adId: ad.id as string, ad }
  }

  // An ad's file and the creative that shows it. A creative belongs to the ad account, so one
  // can be placed in several ad sets.
  private async makeCreative(
    token: string,
    input: Pick<
      SnapchatPublishInput,
      "adAccountId" | "name" | "media" | "brandName" | "headline" | "callToAction" | "url"
    > & {
      profileId: string
      // Given: an app-install creative, which opens the app's store page instead of a link.
      app?: {
        name: string
        iosAppId: string | null
        androidPackage: string | null
        iconMediaId: string
      } | null
    }
  ): Promise<{ mediaId: string; creativeId: string }> {
    const mediaId = await this.uploadMedia(token, input)
    const creative = this.created(
      "creative",
      await this.call("creative", token, "POST", `/adaccounts/${input.adAccountId}/creatives`, {
        creatives: [
          {
            ad_account_id: input.adAccountId,
            name: input.name,
            type: input.app ? "APP_INSTALL" : "WEB_VIEW",
            headline: input.headline,
            brand_name: input.brandName,
            shareable: true,
            call_to_action: input.callToAction,
            top_snap_media_id: mediaId,
            ...(input.app
              ? {
                  app_install_properties: {
                    app_name: input.app.name,
                    ...(input.app.iosAppId ? { ios_app_id: input.app.iosAppId } : {}),
                    ...(input.app.androidPackage
                      ? { android_app_url: input.app.androidPackage }
                      : {}),
                    icon_media_id: input.app.iconMediaId,
                  },
                }
              : { web_view_properties: { url: input.url } }),
            profile_properties: { profile_id: input.profileId },
          },
        ],
      }),
      "creatives",
      "creative"
    )
    return { mediaId, creativeId: creative.id as string }
  }

  // The ad that puts a creative in an ad set.
  private async placeAd(
    token: string,
    input: { adSquadId: string; creativeId: string; name: string; type?: string }
  ): Promise<Json> {
    return this.created(
      "ad",
      await this.call("ad", token, "POST", `/adsquads/${input.adSquadId}/ads`, {
        ads: [
          {
            ad_squad_id: input.adSquadId,
            creative_id: input.creativeId,
            name: input.name,
            type: input.type ?? "REMOTE_WEBPAGE",
            status: "ACTIVE",
          },
        ],
      }),
      "ads",
      "ad"
    )
  }

  // A new ad in an ad set that already exists. Returns the ad as Snapchat now holds it.
  async addAd(input: {
    accessToken: string
    adAccountId: string
    adSquadId: string
    name: string
    media: SnapchatPublishInput["media"]
    brandName: string
    headline: string
    callToAction: SnapchatCallToAction
    url: string
  }): Promise<{ mediaId: string; creativeId: string; adId: string; ad: Json }> {
    const profileId = await this.publicProfileId(input.accessToken, input.adAccountId)
    return this.createAd(input.accessToken, { ...input, profileId })
  }

  // Changes an ad set's daily budget. Like its switch, an ad set is updated by sending the
  // whole of it back through its campaign with the one field changed. Returns the ad set as
  // Snapchat now holds it.
  async setAdSquadBudget(input: {
    accessToken: string
    adSquadId: string
    dailyBudget: number
  }): Promise<Json> {
    const shape = ENTITY_SHAPES.ad_set
    const body = await this.call(
      "ad_set",
      input.accessToken,
      "GET",
      `/${shape.list}/${input.adSquadId}`
    )
    const current = (Array.isArray(body[shape.list]) ? (body[shape.list] as Json[]) : [])[0]?.[
      shape.item
    ] as Json | undefined
    const campaignId = current?.[shape.parentKey]
    if (!current || typeof campaignId !== "string") {
      throw new SnapchatPublishError("ad_set", "It is no longer on Snapchat.", "SNAPCHAT_GONE")
    }
    const next: Json = Object.fromEntries(
      Object.entries(current).filter(([key]) => !shape.readOnly.has(key))
    )
    next.daily_budget_micro = Math.round(input.dailyBudget * 1_000_000)
    const saved = this.created(
      "ad_set",
      await this.call(
        "ad_set",
        input.accessToken,
        "PUT",
        `/${shape.parentList}/${campaignId}/${shape.list}`,
        { [shape.list]: [next] }
      ),
      shape.list,
      shape.item
    )
    return { ...current, ...saved }
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

  // Switches a campaign, an ad set or an ad on or off. Snapchat updates any of them by taking the
  // whole object back through its parent, so it is read first and returned with only its status
  // changed -- minus the fields Snapchat fills itself and refuses to be sent (the lists below were
  // each used against a live account). Returns the object as Snapchat now holds it.
  async setEntityStatus(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
    active: boolean
  }): Promise<Json> {
    const shape = ENTITY_SHAPES[input.level]
    const body = await this.call(
      "status",
      input.accessToken,
      "GET",
      `/${shape.list}/${input.id}`
    ).catch((error: unknown) => {
      if (error instanceof SnapchatPublishError && error.code === "SNAPCHAT_ACCESS_DENIED") {
        throw error
      }
      throw new SnapchatPublishError("status", "It is no longer on Snapchat.", "SNAPCHAT_GONE")
    })
    const current = (Array.isArray(body[shape.list]) ? (body[shape.list] as Json[]) : [])[0]?.[
      shape.item
    ] as Json | undefined
    if (!current) {
      throw new SnapchatPublishError("status", "It is no longer on Snapchat.", "SNAPCHAT_GONE")
    }
    const parentId = current[shape.parentKey]
    if (typeof parentId !== "string") {
      throw new SnapchatPublishError("status", "Snapchat did not say what it belongs to.")
    }
    const next: Json = Object.fromEntries(
      Object.entries(current).filter(([key]) => !shape.readOnly.has(key))
    )
    next.status = input.active ? "ACTIVE" : "PAUSED"
    const saved = this.created(
      "status",
      await this.call(
        "status",
        input.accessToken,
        "PUT",
        `/${shape.parentList}/${parentId}/${shape.list}`,
        { [shape.list]: [next] }
      ),
      shape.list,
      shape.item
    )
    return { ...current, ...saved }
  }

  // Deletes a campaign (with its ad sets and ads), an ad set (with its ads) or one ad. One that
  // is already gone counts as deleted -- see deleteCampaign.
  async deleteEntity(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
  }): Promise<void> {
    const path = `/${ENTITY_SHAPES[input.level].list}/${input.id}`
    try {
      await this.call("campaign", input.accessToken, "DELETE", path)
    } catch (error) {
      if (error instanceof SnapchatPublishError && error.code === "SNAPCHAT_ACCESS_DENIED") {
        throw error
      }
      const list = ENTITY_SHAPES[input.level].list
      const stillThere = await this.call("campaign", input.accessToken, "GET", path).then(
        (body) => Array.isArray(body[list]) && (body[list] as unknown[]).length > 0,
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

  // ---- Viewing, editing and copying what is already on the account ----

  // One campaign, ad set or ad as Snapchat holds it now.
  async readEntity(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
  }): Promise<Json> {
    const shape = ENTITY_SHAPES[input.level]
    const gone = () =>
      new SnapchatPublishError("status", "It is no longer on Snapchat.", "SNAPCHAT_GONE")
    const body = await this.call(
      "status",
      input.accessToken,
      "GET",
      `/${shape.list}/${input.id}`
    ).catch((error: unknown) => {
      if (error instanceof SnapchatPublishError && error.code === "SNAPCHAT_ACCESS_DENIED") {
        throw error
      }
      throw gone()
    })
    const current = (Array.isArray(body[shape.list]) ? (body[shape.list] as Json[]) : [])[0]?.[
      shape.item
    ] as Json | undefined
    if (!current) throw gone()
    return current
  }

  // The creative an ad shows: its text, its button and its link.
  async readCreative(input: { accessToken: string; creativeId: string }): Promise<Json> {
    const body = await this.call(
      "creative",
      input.accessToken,
      "GET",
      `/creatives/${input.creativeId}`
    )
    const creative = (Array.isArray(body.creatives) ? (body.creatives as Json[]) : [])[0]
      ?.creative as Json | undefined
    if (!creative) {
      throw new SnapchatPublishError("creative", "The ad's creative was not found on Snapchat.")
    }
    return creative
  }

  // The regions Snapchat knows in a country, for choosing where an ad set is shown.
  async listRegions(input: {
    accessToken: string
    countryCode: string
  }): Promise<SnapchatRegion[]> {
    const country = input.countryCode.toLowerCase()
    const body = await this.call(
      "account",
      input.accessToken,
      "GET",
      `/targeting/geo/${encodeURIComponent(country)}/region`
    )
    const found: SnapchatRegion[] = []
    for (const entry of Array.isArray(body.targeting_dimensions)
      ? (body.targeting_dimensions as Json[])
      : []) {
      const region = (entry.region as Json | undefined)?.region as Json | undefined
      if (!region?.id) continue
      found.push({
        id: String(region.id),
        name: String(region.name ?? region.id),
        nameAr: regionNameAr(country, String(region.code ?? "")),
      })
    }
    return found
  }

  // The languages Snapchat can aim an ad set at (the language people use the app in).
  async listLanguages(input: { accessToken: string }): Promise<SnapchatLanguage[]> {
    const body = await this.call(
      "account",
      input.accessToken,
      "GET",
      "/targeting/demographics/languages"
    )
    const found: SnapchatLanguage[] = []
    for (const entry of Array.isArray(body.targeting_dimensions)
      ? (body.targeting_dimensions as Json[])
      : []) {
      const language = entry.languages as Json | undefined
      if (!language?.id) continue
      const id = String(language.id)
      found.push({ id, name: String(language.name ?? id), nameAr: languageNameAr(id) })
    }
    return found
  }

  // The interests Snapchat offers in a country (its "lifestyle categories"), the wide ones and
  // the narrower ones under them.
  async listInterests(input: {
    accessToken: string
    countryCode: string
  }): Promise<SnapchatInterest[]> {
    const country = input.countryCode.toLowerCase()
    const body = await this.call(
      "account",
      input.accessToken,
      "GET",
      `/targeting/v1/interests/scls?country_code=${encodeURIComponent(country)}&is_hec=false&limit=1000`
    )
    const found: SnapchatInterest[] = []
    for (const entry of Array.isArray(body.targeting_dimensions)
      ? (body.targeting_dimensions as Json[])
      : []) {
      const interest = entry.scls as Json | undefined
      if (!interest?.id) continue
      const id = String(interest.id)
      // Snapchat sends the parent as "parentId" (its documentation says "parent_id"); the
      // widest ones hang under "SLC_0", which is not an interest itself.
      const parent = String(interest.parentId ?? interest.parent_id ?? "")
      found.push({
        id,
        name: String(interest.name ?? id),
        nameAr: interestNameAr(id),
        parentId: parent && parent !== "SLC_0" ? parent : null,
      })
    }
    return found
  }

  // The file a creative shows (its image or video): its kind, its size on screen and the link
  // Snapchat serves it from.
  async readMedia(input: { accessToken: string; mediaId: string }): Promise<Json> {
    const body = await this.call("media", input.accessToken, "GET", `/media/${input.mediaId}`)
    const media = (Array.isArray(body.media) ? (body.media as Json[]) : [])[0]?.media as
      | Json
      | undefined
    if (!media) throw new SnapchatPublishError("media", "The ad's file was not found on Snapchat.")
    return media
  }

  // Everything under a parent (a campaign's ad sets, an ad set's ads), following Snapchat's pages.
  private async listUnder(
    token: string,
    step: SnapchatPublishStep,
    path: string,
    listKey: string,
    itemKey: string
  ): Promise<Json[]> {
    const found: Json[] = []
    let next: string | null = `${path}?limit=100`
    for (let page = 0; next && page < 20; page += 1) {
      const body: Json = await this.call(step, token, "GET", next)
      for (const entry of Array.isArray(body[listKey]) ? (body[listKey] as Json[]) : []) {
        const item = entry[itemKey] as Json | undefined
        if (item?.id) found.push(item)
      }
      const link = (body.paging as Json | undefined)?.next_link
      // The next page comes as a whole address; only what follows the API's base is kept.
      next =
        typeof link === "string" && link.startsWith(this.base) ? link.slice(this.base.length) : null
    }
    return found
  }

  // Changes a campaign, an ad set or an ad. Snapchat takes the whole object back through its
  // parent, so it is read first and `change` is given that copy (minus the fields only Snapchat
  // writes) to return as it should be. Returns the object as Snapchat now holds it.
  async updateEntity(input: {
    accessToken: string
    level: SnapchatEntityLevel
    id: string
    change: (current: Json) => Json
  }): Promise<Json> {
    const shape = ENTITY_SHAPES[input.level]
    const step: SnapchatPublishStep = input.level
    const current = await this.readEntity(input)
    const parentId = current[shape.parentKey]
    if (typeof parentId !== "string") {
      throw new SnapchatPublishError(step, "Snapchat did not say what it belongs to.")
    }
    const next = input.change(
      Object.fromEntries(Object.entries(current).filter(([key]) => !shape.readOnly.has(key)))
    )
    const saved = this.created(
      step,
      await this.call(
        step,
        input.accessToken,
        "PUT",
        `/${shape.parentList}/${parentId}/${shape.list}`,
        {
          [shape.list]: [next],
        }
      ),
      shape.list,
      shape.item
    )
    return { ...current, ...saved }
  }

  // Changes the text or the button of a creative. Snapchat reviews the ads that show it again.
  async updateCreative(input: {
    accessToken: string
    creativeId: string
    change: (current: Json) => Json
  }): Promise<Json> {
    const current = await this.readCreative(input)
    const accountId = current.ad_account_id
    if (typeof accountId !== "string") {
      throw new SnapchatPublishError("creative", "Snapchat did not say whose creative it is.")
    }
    const next = input.change(writableCreative(current))
    const saved = this.created(
      "creative",
      await this.call("creative", input.accessToken, "PUT", `/adaccounts/${accountId}/creatives`, {
        creatives: [next],
      }),
      "creatives",
      "creative"
    )
    return { ...current, ...saved }
  }

  // A copy of an ad in an ad set: a new creative with the same file (and whatever text, button
  // or link was changed for the copy), and a new ad that shows it. The copy has a creative of
  // its own so changing it later never changes the ad it was copied from.
  async cloneAd(input: {
    accessToken: string
    // The ad to copy, as Snapchat holds it (or its id, to be read).
    source: Json | string
    adSquadId: string
    name?: string
    status?: "ACTIVE" | "PAUSED"
    creative?: { headline?: string; brandName?: string; callToAction?: string; url?: string }
  }): Promise<{ ad: Json; creative: Json }> {
    const token = input.accessToken
    const source =
      typeof input.source === "string"
        ? await this.readEntity({ accessToken: token, level: "ad", id: input.source })
        : input.source
    const creativeId = source.creative_id
    if (typeof creativeId !== "string") {
      throw new SnapchatPublishError("ad", "The ad has no creative to copy.")
    }
    const original = await this.readCreative({ accessToken: token, creativeId })
    const name = input.name ?? String(source.name ?? "")
    const copy = writableCreative(original)
    delete copy.id
    copy.name = name
    const changed = input.creative ?? {}
    if (changed.headline) copy.headline = changed.headline
    if (changed.brandName) copy.brand_name = changed.brandName
    if (changed.callToAction) copy.call_to_action = changed.callToAction
    if (changed.url) {
      copy.web_view_properties = {
        ...((original.web_view_properties as Json) ?? {}),
        url: changed.url,
      }
    }
    const creative = this.created(
      "creative",
      await this.call(
        "creative",
        token,
        "POST",
        `/adaccounts/${original.ad_account_id}/creatives`,
        {
          creatives: [copy],
        }
      ),
      "creatives",
      "creative"
    )
    const ad: Json = Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== "id" && !ENTITY_SHAPES.ad.readOnly.has(key))
    )
    ad.ad_squad_id = input.adSquadId
    ad.creative_id = creative.id
    ad.name = name
    ad.status = input.status ?? (source.status === "ACTIVE" ? "ACTIVE" : "PAUSED")
    const made = this.created(
      "ad",
      await this.call("ad", token, "POST", `/adsquads/${input.adSquadId}/ads`, { ads: [ad] }),
      "ads",
      "ad"
    )
    return { ad: made, creative }
  }

  // A copy of an ad set with all its ads, in the same campaign or another. `change` is given the
  // copy before it is sent (its name, budget, audience). If an ad cannot be copied, the new ad
  // set is deleted so nothing half-built stays on the account.
  async cloneAdSquad(input: {
    accessToken: string
    source: Json | string
    campaignId?: string
    status?: "ACTIVE" | "PAUSED"
    change?: (copy: Json) => Json
  }): Promise<{ adSquad: Json; ads: Json[] }> {
    const token = input.accessToken
    const source =
      typeof input.source === "string"
        ? await this.readEntity({ accessToken: token, level: "ad_set", id: input.source })
        : input.source
    const campaignId = input.campaignId ?? source.campaign_id
    if (typeof campaignId !== "string") {
      throw new SnapchatPublishError("ad_set", "Snapchat did not say which campaign it is in.")
    }
    let copy = freshCopy(source, ENTITY_SHAPES.ad_set.readOnly)
    copy.campaign_id = campaignId
    copy.status = input.status ?? (source.status === "ACTIVE" ? "ACTIVE" : "PAUSED")
    if (input.change) copy = input.change(copy)
    const adSquad = this.created(
      "ad_set",
      await this.call("ad_set", token, "POST", `/campaigns/${campaignId}/adsquads`, {
        adsquads: [copy],
      }),
      "adsquads",
      "adsquad"
    )
    try {
      const ads: Json[] = []
      const sources = await this.listUnder(token, "ad", `/adsquads/${source.id}/ads`, "ads", "ad")
      for (const ad of sources) {
        const made = await this.cloneAd({
          accessToken: token,
          source: ad,
          adSquadId: adSquad.id as string,
        })
        ads.push(made.ad)
      }
      return { adSquad, ads }
    } catch (error) {
      await this.call("ad_set", token, "DELETE", `/adsquads/${adSquad.id}`).catch(() => undefined)
      throw error
    }
  }

  // A copy of a whole campaign: the campaign, its ad sets and their ads. The copy starts switched
  // off, so nothing is spent until it is looked over and switched on. If any piece cannot be
  // copied, the new campaign is deleted.
  async cloneCampaign(input: {
    accessToken: string
    campaignId: string
    name: string
  }): Promise<{ campaign: Json; adSquads: Json[]; ads: Json[] }> {
    const token = input.accessToken
    const source = await this.readEntity({
      accessToken: token,
      level: "campaign",
      id: input.campaignId,
    })
    const accountId = source.ad_account_id
    if (typeof accountId !== "string") {
      throw new SnapchatPublishError("campaign", "Snapchat did not say whose campaign it is.")
    }
    const copy = freshCopy(source, ENTITY_SHAPES.campaign.readOnly)
    copy.name = input.name
    copy.status = "PAUSED"
    const campaign = this.created(
      "campaign",
      await this.call("campaign", token, "POST", `/adaccounts/${accountId}/campaigns`, {
        campaigns: [copy],
      }),
      "campaigns",
      "campaign"
    )
    try {
      const adSquads: Json[] = []
      const ads: Json[] = []
      const sources = await this.listUnder(
        token,
        "ad_set",
        `/campaigns/${input.campaignId}/adsquads`,
        "adsquads",
        "adsquad"
      )
      for (const adSquad of sources) {
        const made = await this.cloneAdSquad({
          accessToken: token,
          source: adSquad,
          campaignId: campaign.id as string,
        })
        adSquads.push(made.adSquad)
        ads.push(...made.ads)
      }
      return { campaign, adSquads, ads }
    } catch (error) {
      await this.call("campaign", token, "DELETE", `/campaigns/${campaign.id}`).catch(
        () => undefined
      )
      throw error
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
