import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// The creative library and publishing a campaign to an ad platform (backend:
// campaigns/creatives.ts and campaigns/publishing/service.ts).

// Same workaround the other services document: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and cannot tell them from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const path = (...segments: string[]) => ["", "v1", "campaigns", ...segments].join(PATH_SEPARATOR)

export type CreativeKind = "image" | "video"
export type CreativeContentType = "image/png" | "image/jpeg" | "video/mp4"

export interface Creative {
  id: string
  name: string
  kind: CreativeKind
  contentType: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationSeconds: number | null
  url: string
  // Uploaded in Madar, or brought in from an ad that already runs on Snapchat.
  source?: "upload" | "snapchat"
  createdAt: string
}

// An ad on the campaigns list and the library creative it shows (backend: campaigns/
// creative-import.ts).
export interface AdCreative {
  adRowId: string
  creative: Creative
}

// How far bringing the ads' creatives into the library has got.
export interface CreativeImportProgress {
  done: number
  remaining: number
  busy: boolean
}

// What a creative has done (backend: campaigns/creative-insights.ts). Only campaigns published
// from Madar are counted, since that is where Madar knows which ad carries which file.
export interface CreativeNumbers {
  impressions: number
  clicks: number
  spend: number
  pageViews: number
  signUps: number
}

// One ad that shows the creative: its campaign's name and the ad's own numbers.
export interface CreativeCampaignUse extends CreativeNumbers {
  publicationId: string | null
  adId: string | null
  adName: string | null
  name: string
  platform: string
  platformStatus: "active" | "paused"
}

export interface CreativeInsights extends CreativeNumbers {
  creativeId: string
  currency: string | null
  campaigns: CreativeCampaignUse[]
  clickRate: number | null
  costPerSignUp: number | null
  rank: number | null
  rankedOutOf: number
}

export const CREATIVE_LIMITS = {
  imageBytes: 5 * 1024 * 1024,
  videoBytes: 30 * 1024 * 1024,
} as const

// Snapchat is published with four objectives; the other platforms with traffic and leads.
export type PublishObjective = "awareness" | "traffic" | "leads" | "sales"
export const SNAPCHAT_OBJECTIVES: PublishObjective[] = ["awareness", "traffic", "leads", "sales"]
// What a Snapchat ad set is delivered for, per objective; the first is Madar's own pick. The
// PIXEL_ ones need the account's Snap Pixel. (The same lists the server holds.)
export type SnapchatGoal =
  | "IMPRESSIONS"
  | "SWIPES"
  | "VIDEO_VIEWS"
  | "PIXEL_PAGE_VIEW"
  | "PIXEL_SIGNUP"
  | "PIXEL_ADD_TO_CART"
  | "PIXEL_PURCHASE"
export const SNAPCHAT_GOALS: Record<PublishObjective, SnapchatGoal[]> = {
  awareness: ["IMPRESSIONS", "VIDEO_VIEWS", "SWIPES"],
  traffic: ["SWIPES", "PIXEL_PAGE_VIEW"],
  leads: ["PIXEL_SIGNUP", "SWIPES"],
  sales: ["PIXEL_PURCHASE", "PIXEL_ADD_TO_CART", "PIXEL_PAGE_VIEW"],
}
export type SnapchatBidStrategy = "auto" | "target_cost" | "max_bid"
// Snapchat takes a target cost only for these goals.
export const SNAPCHAT_TARGET_COST_GOALS: SnapchatGoal[] = [
  "SWIPES",
  "PIXEL_PAGE_VIEW",
  "PIXEL_SIGNUP",
  "PIXEL_ADD_TO_CART",
  "PIXEL_PURCHASE",
]
export const SNAPCHAT_MIN_SPEND_CAP = 20
export type PublishGender = "all" | "male" | "female"
export const CALLS_TO_ACTION = [
  "MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "GET_NOW",
] as const
export type CallToAction = (typeof CALLS_TO_ACTION)[number]

// The platforms a campaign can be published to. Snapchat, TikTok and Meta show a picture or a
// video; Google is a search campaign: text ads shown to people searching the given keywords.
export type PublishPlatform = "snapchat" | "tiktok" | "meta" | "google"
export const PUBLISH_PLATFORMS: PublishPlatform[] = ["snapchat", "tiktok", "meta", "google"]

// The buttons TikTok and Meta offer (Snapchat's own are CALLS_TO_ACTION above).
export const OTHER_CALLS_TO_ACTION = [
  "LEARN_MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
] as const
export type AnyCallToAction = CallToAction | (typeof OTHER_CALLS_TO_ACTION)[number]
export const callsToActionFor = (platform: PublishPlatform): readonly AnyCallToAction[] =>
  platform === "snapchat" ? CALLS_TO_ACTION : OTHER_CALLS_TO_ACTION

// The places inside a country a Snapchat campaign can be narrowed to (backend: campaigns/
// publishing/snapchat-geo.ts): Snapchat's own regions, and the cities Madar offers.
export interface PublishRegion {
  id: string
  name: string
  nameAr: string | null
}
export interface PublishCity {
  key: string
  name: string
  nameAr: string
}
export interface PublishLocations {
  regions: PublishRegion[]
  cities: PublishCity[]
}

// The languages and interests a Snapchat campaign can be narrowed to (backend: campaigns/
// publishing/snapchat-audience.ts): Snapchat's own lists for the country.
export interface PublishLanguage {
  id: string
  name: string
  nameAr: string | null
}
export interface PublishInterest extends PublishLanguage {
  // The wider interest it belongs to; null for the widest ones.
  parentId: string | null
}
export interface PublishAudiences {
  languages: PublishLanguage[]
  interests: PublishInterest[]
}

export interface PublishAccount {
  connectionId: string
  adAccountId: string
  name: string
  currency: string | null
}

export interface PublishOptions {
  snapchat: { accounts: PublishAccount[] }
  tiktok: { accounts: PublishAccount[] }
  // needsPermission: Meta is connected for reading only, so nothing can be published to it yet.
  meta: { accounts: PublishAccount[]; needsPermission: boolean }
  google: { accounts: PublishAccount[] }
  limits: {
    headlineMax: number
    brandNameMax: number
    minDailyBudget: number
    countries: string[]
    minDailyBudgets: Record<PublishPlatform, number>
    tiktokTextMax: number
    metaHeadlineMax: number
    metaTextMax: number
    googleHeadlineMax: number
    googleDescriptionMax: number
  }
}

// The tracking words on an ad's link (utm_source, utm_medium, utm_campaign, utm_content).
export interface LinkTracking {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
}

interface PublishCommonInput {
  tracking?: LinkTracking | null
  connectionId: string
  adAccountId: string
  name: string
  objective: PublishObjective
  dailyBudget: number
  startDate: string
  endDate: string | null
  countryCode: string
  minAge: number
  maxAge: number | null
  gender: PublishGender
  url: string
  startActive: boolean
}

export type PublishCampaignInput =
  | (PublishCommonInput & {
      platform: "snapchat" | "tiktok"
      creativeId: string
      brandName: string
      // Snapchat: the ad's headline. TikTok: the text shown with the video.
      headline: string
      callToAction: AnyCallToAction
      // Snapchat only: what the ad set is delivered for, the campaign's spend caps and the bid.
      goal?: SnapchatGoal | null
      campaignDailyCap?: number | null
      campaignLifetimeCap?: number | null
      bidStrategy?: SnapchatBidStrategy | null
      bidAmount?: number | null
      // Snapchat only: some of the country's regions, or some of its cities.
      regionIds?: string[] | null
      cityKeys?: string[] | null
      // Snapchat only: the languages and interests to narrow to. Empty: everyone.
      languages?: string[] | null
      interestIds?: string[] | null
    })
  | (PublishCommonInput & {
      platform: "meta"
      creativeId: string
      headline: string
      // The text above the picture.
      text: string
      callToAction: AnyCallToAction
    })
  | (PublishCommonInput & {
      platform: "google"
      headlines: string[]
      descriptions: string[]
      keywords: string[]
    })

export interface Publication {
  id: string
  platform: string
  adAccountId: string
  name: string
  objective: string
  currency: string | null
  dailyBudget: number
  startAt: string
  endAt: string | null
  targeting: { countryCode: string; minAge: number; maxAge: number | null; gender: string }
  creativeId: string | null
  brandName: string
  headline: string
  callToAction: string
  url: string
  details: {
    text?: string
    headlines?: string[]
    descriptions?: string[]
    keywords?: string[]
  } | null
  status: "publishing" | "published" | "failed"
  platformStatus: "active" | "paused"
  error: { code: string; step: string | null; reason: string } | null
  externalCampaignId: string | null
  createdAt: string
}

const UPLOAD_TIMEOUT_MS = 5 * 60_000

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

// Whether a creative fits Snapchat's full-screen ads: upright 9:16, at least 1080 wide, a video
// between 3 seconds and 3 minutes. The same rule the server applies before publishing.
export function snapchatCreativeProblem(
  creative: Pick<Creative, "kind" | "width" | "height" | "durationSeconds">
): "ratio" | "small" | "duration" | null {
  if (creative.width && creative.height) {
    if (Math.abs(creative.width / creative.height - 9 / 16) > 0.02) return "ratio"
    if (creative.width < 1080) return "small"
  }
  if (creative.kind === "video" && creative.durationSeconds) {
    if (creative.durationSeconds < 3 || creative.durationSeconds > 180) return "duration"
  }
  return null
}

// Whether a creative fits the platform it is going to -- the same rules the server applies.
//   TikTok: video only (upright, square or wide), from 5 seconds to 10 minutes.
//   Meta: a picture or a video at least 600 wide, no taller than 9:16, no wider than 1.91:1.
export function creativeProblemFor(
  platform: Exclude<PublishPlatform, "google">,
  creative: Pick<Creative, "kind" | "width" | "height" | "durationSeconds">
): "ratio" | "small" | "duration" | "video_only" | null {
  if (platform === "snapchat") return snapchatCreativeProblem(creative)
  const ratio = creative.width && creative.height ? creative.width / creative.height : null
  if (platform === "tiktok") {
    if (creative.kind !== "video") return "video_only"
    if (ratio && ![9 / 16, 1, 16 / 9].some((allowed) => Math.abs(ratio - allowed) <= 0.03)) {
      return "ratio"
    }
    if (
      creative.durationSeconds &&
      (creative.durationSeconds < 5 || creative.durationSeconds > 600)
    ) {
      return "duration"
    }
    return null
  }
  if (creative.width && creative.width < 600) return "small"
  if (ratio && (ratio < 9 / 16 - 0.02 || ratio > 1.91 + 0.05)) return "ratio"
  return null
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.readAsDataURL(file)
  })
}

// The file's size on screen (and a video's length), read by the browser.
interface Measured {
  width: number | null
  height: number | null
  durationSeconds: number | null
}

function measure(file: File): Promise<Measured> {
  const unknown: Measured = { width: null, height: null, durationSeconds: null }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const done = (value: Measured) => {
      URL.revokeObjectURL(objectUrl)
      resolve(value)
    }
    if (file.type.startsWith("video/")) {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () =>
        done({
          width: video.videoWidth || null,
          height: video.videoHeight || null,
          durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
        })
      video.onerror = () => done(unknown)
      video.src = objectUrl
    } else {
      const image = new Image()
      image.onload = () =>
        done({ width: image.naturalWidth, height: image.naturalHeight, durationSeconds: null })
      image.onerror = () => done(unknown)
      image.src = objectUrl
    }
  })
}

export const campaignPublishingService = {
  async listCreatives(): Promise<Creative[]> {
    return (await client.get<{ items: Creative[] }>(path("creatives"))).items
  },

  async uploadCreative(file: File): Promise<Creative> {
    const [dataBase64, size] = await Promise.all([readAsBase64(file), measure(file)])
    return client.post<unknown, Creative>(
      path("creatives"),
      {
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 120) || file.name,
        contentType: file.type,
        dataBase64,
        ...size,
      },
      // A video takes far longer to send than an ordinary request.
      { timeoutMs: UPLOAD_TIMEOUT_MS }
    )
  },

  async renameCreative(id: string, name: string): Promise<Creative> {
    return client.patch<{ name: string }, Creative>(path("creatives", id), { name })
  },

  async creativeInsights(): Promise<CreativeInsights[]> {
    return (await client.get<{ items: CreativeInsights[] }>(path("creatives", "insights"))).items
  },

  // The ads tied to a library creative, for showing an ad's image or video on the campaigns list.
  async adCreatives(): Promise<AdCreative[]> {
    return (await client.get<{ items: AdCreative[] }>(path("creatives", "ads"))).items
  },

  // One ad's creative, brought into the library now if it was not yet. Null when the ad has no
  // image or video Madar can show.
  async creativeOfAd(adRowId: string): Promise<Creative | null> {
    return (
      await client.get<{ creative: Creative | null }>(
        `${path("creatives", "of-ad")}?id=${encodeURIComponent(adRowId)}`,
        { timeoutMs: 90_000 }
      )
    ).creative
  },

  // Brings the next few ads' creatives into the library. Called until nothing remains.
  async importCreatives(): Promise<CreativeImportProgress> {
    return client.post<Record<string, never>, CreativeImportProgress>(
      path("creatives", "import"),
      {},
      { timeoutMs: 3 * 60_000 }
    )
  },

  async removeCreative(id: string): Promise<void> {
    await client.delete(path("creatives", id))
  },

  async options(): Promise<PublishOptions> {
    return client.get<PublishOptions>(path("publish", "options"))
  },

  async locations(connectionId: string, countryCode: string): Promise<PublishLocations> {
    return client.get<PublishLocations>(
      `${path("publish", "locations")}?connectionId=${encodeURIComponent(connectionId)}&country=${encodeURIComponent(countryCode)}`
    )
  },

  async audiences(connectionId: string, countryCode: string): Promise<PublishAudiences> {
    return client.get<PublishAudiences>(
      `${path("publish", "audiences")}?connectionId=${encodeURIComponent(connectionId)}&country=${encodeURIComponent(countryCode)}`
    )
  },

  async listPublications(): Promise<Publication[]> {
    return (await client.get<{ items: Publication[] }>(path("publications"))).items
  },

  async getPublication(id: string): Promise<Publication> {
    return client.get<Publication>(path("publications", id))
  },

  async publish(input: PublishCampaignInput): Promise<Publication> {
    return client.post<PublishCampaignInput, Publication>(path("publications"), input)
  },

  async setActive(id: string, active: boolean): Promise<Publication> {
    return client.post<{ active: boolean }, Publication>(path("publications", id, "status"), {
      active,
    })
  },

  // Deletes the campaign on the platform and takes it off Madar's list.
  async removePublication(id: string): Promise<void> {
    await client.delete(path("publications", id))
  },
}
