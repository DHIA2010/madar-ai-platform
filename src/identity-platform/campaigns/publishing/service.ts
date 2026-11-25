import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../../application/dto/identity-dtos"
import { IdentityError } from "../../application/errors/IdentityError"
import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import type { CampaignCreativesService, CreativeView } from "../creatives"

import { googleTextProblem } from "./google-publisher"
import {
  GOOGLE_DESCRIPTION_MAX,
  GOOGLE_HEADLINE_MAX,
  META_HEADLINE_MAX,
  META_TEXT_MAX,
  PlatformPublishError,
  TIKTOK_TEXT_MAX,
  type GooglePublishedIds,
  type GooglePublishInput,
  type MetaCallToAction,
  type MetaPublishedIds,
  type MetaPublishInput,
  type TikTokCallToAction,
  type TikTokPublishedIds,
  type TikTokPublishInput,
} from "./platform"
import type {
  SnapchatDeviceConnection,
  SnapchatDeviceSystem,
  SnapchatInterest,
  SnapchatLanguage,
} from "./snapchat-audience"
import {
  snapchatCities,
  snapchatPlacesProblem,
  type SnapchatCity,
  type SnapchatRegion,
} from "./snapchat-geo"
import {
  SNAPCHAT_BRAND_NAME_MAX,
  SNAPCHAT_HEADLINE_MAX,
  SnapchatPublishError,
  SNAPCHAT_GOALS,
  SNAPCHAT_MIN_SPEND_CAP,
  SNAPCHAT_TARGET_COST_GOALS,
  type SnapchatBidStrategy,
  type SnapchatConversionWindow,
  SNAPCHAT_WINDOW_GOALS,
  type SnapchatCallToAction,
  type SnapchatGoal,
  type SnapchatObjective,
  type SnapchatPublishedIds,
  type SnapchatPublishInput,
  SNAPCHAT_APP_CALLS_TO_ACTION,
  SNAPCHAT_APP_ICON_MAX,
  SNAPCHAT_APP_ICON_MIN,
  SNAPCHAT_APP_NAME_MAX,
  SNAPCHAT_APP_ONLY_CALLS_TO_ACTION,
} from "./snapchat-publisher"

// Publishing a campaign from Madar to an ad platform: Snapchat, TikTok, Meta (Facebook and
// Instagram) and Google Ads. The merchant fills one short form; Madar creates the campaign, its
// ad set and its ad on the platform and keeps a record of what was asked for and what the
// platform gave back.
//
// Three of them show a picture or a video from the creative library with a line or two of text.
// Google is different: a search campaign, whose ad is text only (headlines and descriptions)
// shown to people searching the keywords the merchant lists -- so it takes no creative, and no
// age or gender (search ads are aimed by what is searched, not by who searches).
//
// Meta answers only for a connection that was granted the permission to manage ads; a connection
// with reading rights only is not offered as a place to publish to.
//
// Publishing takes from a few seconds (an image) to about a minute (a video Snapchat has to
// process), longer than a request should stay open -- so `publish` records the campaign as
// "publishing", answers at once and carries on in the background; the screen then asks for the
// record until it says "published" or "failed".

export type PublicationStatus = "publishing" | "published" | "failed"

export const PUBLISH_COUNTRIES = ["sa", "ae", "kw", "qa", "bh", "om", "eg", "jo"] as const
export type PublishCountry = (typeof PUBLISH_COUNTRIES)[number]

export type PublishPlatform = "snapchat" | "tiktok" | "meta" | "google"
export const PUBLISH_PLATFORMS: readonly PublishPlatform[] = [
  "snapchat",
  "tiktok",
  "meta",
  "google",
]

interface PublishCommonInput {
  connectionId: string
  adAccountId: string
  name: string
  objective: SnapchatObjective
  dailyBudget: number
  // Date-only, Riyadh days. A campaign that starts today starts a few minutes from now.
  startDate: string
  endDate?: string | null
  countryCode: PublishCountry
  minAge: number
  maxAge?: number | null
  gender: "all" | "male" | "female"
  url: string
  // The tracking words for the link, when the form's boxes were sent.
  tracking?: LinkTracking | null
  startActive: boolean
}

// One more ad group of a Snapchat campaign: its own budget and audience. The country, the dates,
// the goal and the bid are the campaign's.
export interface PublishAdGroupInput {
  name: string
  dailyBudget: number
  lifetimeBudget?: number | null
  minAge: number
  maxAge?: number | null
  gender: "all" | "male" | "female"
  regionIds?: string[] | null
  cityKeys?: string[] | null
  languages?: string[] | null
  interestIds?: string[] | null
  deviceSystem?: SnapchatDeviceSystem | null
  deviceConnection?: SnapchatDeviceConnection | null
}

// One more ad of a Snapchat campaign: its own creative, text, button and link.
export interface PublishAdInput {
  name: string
  creativeId: string
  headline: string
  callToAction: SnapchatCallToAction
  url: string
}

// The app an app-promotion campaign is for. One store is enough; the icon is a creative from
// the library: a square PNG.
export interface PublishAppInput {
  name: string
  iosAppId?: string | null
  androidPackage?: string | null
  iconCreativeId: string
}

// The app's page in its store: where an app-install ad leads, kept as the record's link.
export function appStoreUrl(app: Pick<PublishAppInput, "iosAppId" | "androidPackage">): string {
  return app.iosAppId
    ? `https://apps.apple.com/app/id${app.iosAppId}`
    : `https://play.google.com/store/apps/details?id=${app.androidPackage ?? ""}`
}

// Whether an app's details and icon fit Snapchat, or what is wrong.
export function snapchatAppProblem(
  app: PublishAppInput | null | undefined,
  icon: CreativeView | null
): "app" | "store" | "ios_id" | "android_package" | "icon" | null {
  if (!app || !app.name.trim() || app.name.trim().length > SNAPCHAT_APP_NAME_MAX) return "app"
  if (!app.iosAppId && !app.androidPackage) return "store"
  if (app.iosAppId && !/^\d{5,15}$/.test(app.iosAppId)) return "ios_id"
  if (app.androidPackage && !/^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/.test(app.androidPackage)) {
    return "android_package"
  }
  if (
    !icon ||
    icon.kind !== "image" ||
    icon.contentType !== "image/png" ||
    !icon.width ||
    !icon.height ||
    Math.abs(icon.width / icon.height - 1) > 0.02 ||
    icon.width < SNAPCHAT_APP_ICON_MIN ||
    icon.width > SNAPCHAT_APP_ICON_MAX
  ) {
    return "icon"
  }
  return null
}

export const PUBLISH_MAX_AD_GROUPS = 5
export const PUBLISH_MAX_ADS = 5

export type PublishCampaignInput =
  | (PublishCommonInput & {
      platform: "snapchat"
      creativeId: string
      brandName: string
      headline: string
      callToAction: SnapchatCallToAction
      goal?: SnapchatGoal | null
      campaignDailyCap?: number | null
      campaignLifetimeCap?: number | null
      bidStrategy?: SnapchatBidStrategy | null
      bidAmount?: number | null
      // Over how long a result counts (pixel and app goals only); Snapchat's default when left out.
      conversionWindow?: SnapchatConversionWindow | null
      // Where inside the country: some regions or some cities. Empty: the whole country.
      regionIds?: string[] | null
      cityKeys?: string[] | null
      // The languages and Snapchat interests to narrow to. Empty: everyone.
      languages?: string[] | null
      interestIds?: string[] | null
      // The phones it is shown on. Left out or "all": every phone on any connection.
      deviceSystem?: SnapchatDeviceSystem | null
      deviceConnection?: SnapchatDeviceConnection | null
      // One amount for the whole run instead of an amount a day; needs an end date. The daily
      // budget kept with the record is then the average a day.
      lifetimeBudget?: number | null
      // The app, for the app-promotion objective. The ads then open the app's store page and
      // the link sent is not used.
      app?: PublishAppInput | null
      // The names of the first ad group and the first ad; left out, the campaign's name.
      adGroupName?: string | null
      adName?: string | null
      // More ad groups (each its own budget and audience) and more ads. Every ad is placed in
      // every ad group.
      moreAdGroups?: PublishAdGroupInput[] | null
      moreAds?: PublishAdInput[] | null
    })
  | (PublishCommonInput & {
      platform: "tiktok"
      creativeId: string
      // The name the ad is shown under when the account has no TikTok identity yet.
      brandName: string
      // The text shown with the video.
      headline: string
      callToAction: TikTokCallToAction
    })
  | (PublishCommonInput & {
      platform: "meta"
      creativeId: string
      // The bold line under the picture, and the text above it.
      headline: string
      text: string
      callToAction: MetaCallToAction
    })
  | (PublishCommonInput & {
      platform: "google"
      headlines: string[]
      descriptions: string[]
      keywords: string[]
    })

// What only some platforms ask for, kept with the record.
export interface PublicationDetails {
  text?: string
  headlines?: string[]
  descriptions?: string[]
  keywords?: string[]
  // Snapchat's own settings, when they were chosen.
  goal?: string
  campaignDailyCap?: number
  campaignLifetimeCap?: number
  bidStrategy?: string
  bidAmount?: number
  conversionWindow?: string
  regionIds?: string[]
  cityKeys?: string[]
  languages?: string[]
  interestIds?: string[]
  deviceSystem?: string
  deviceConnection?: string
  lifetimeBudget?: number
  // A campaign made with several ad groups or ads: the names of the first ones, and the rest.
  adGroupName?: string
  adName?: string
  adGroups?: PublishAdGroupInput[]
  ads?: PublishAdInput[]
  // The app an app-promotion campaign is for.
  app?: PublishAppInput
}

export interface PublicationView {
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
  details: PublicationDetails | null
  status: PublicationStatus
  // The campaign's own switch on the platform.
  platformStatus: "active" | "paused"
  // Why a failed publish failed: a code the screen has words for, and the platform's own reason.
  error: { code: string; step: string | null; reason: string } | null
  externalCampaignId: string | null
  createdAt: string
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
  // needsPermission: Meta is connected, but for reading only -- nothing can be published to it
  // until the connection is granted the permission to manage ads.
  meta: { accounts: PublishAccount[]; needsPermission: boolean }
  google: { accounts: PublishAccount[] }
  limits: {
    // Snapchat's, kept under their first names.
    headlineMax: number
    brandNameMax: number
    minDailyBudget: number
    countries: readonly string[]
    minDailyBudgets: Record<PublishPlatform, number>
    tiktokTextMax: number
    metaHeadlineMax: number
    metaTextMax: number
    googleHeadlineMax: number
    googleDescriptionMax: number
  }
}

// What Snapchat needs to be handed, kept narrow so tests can stand in for it.
export interface SnapchatAccess {
  resolveAccessToken(connectionId: string): Promise<string>
}
export interface SnapchatPublisher {
  publish(input: SnapchatPublishInput): Promise<SnapchatPublishedIds>
  setCampaignStatus(input: {
    accessToken: string
    adAccountId: string
    campaignId: string
    active: boolean
  }): Promise<void>
  deleteCampaign(input: { accessToken: string; campaignId: string }): Promise<void>
  listRegions?(input: { accessToken: string; countryCode: string }): Promise<SnapchatRegion[]>
  listLanguages?(input: { accessToken: string }): Promise<SnapchatLanguage[]>
  listInterests?(input: { accessToken: string; countryCode: string }): Promise<SnapchatInterest[]>
}

// The languages and interests a Snapchat campaign can be narrowed to.
export interface PublishAudiences {
  languages: SnapchatLanguage[]
  interests: SnapchatInterest[]
}

// The places inside a country a Snapchat campaign can be narrowed to.
export interface PublishLocations {
  regions: SnapchatRegion[]
  cities: Array<Pick<SnapchatCity, "key" | "name" | "nameAr">>
}

interface TokenAccess {
  resolveAccessToken(connectionId: string): Promise<string>
}
export interface TikTokPublisher {
  publish(input: TikTokPublishInput): Promise<TikTokPublishedIds>
  setCampaignStatus(input: {
    accessToken: string
    advertiserId: string
    campaignId: string
    active: boolean
  }): Promise<void>
  deleteCampaign(input: {
    accessToken: string
    advertiserId: string
    campaignId: string
  }): Promise<void>
}
export interface MetaPublisher {
  publish(input: MetaPublishInput): Promise<MetaPublishedIds>
  setCampaignStatus(input: {
    accessToken: string
    campaignId: string
    active: boolean
  }): Promise<void>
  deleteCampaign(input: { accessToken: string; campaignId: string }): Promise<void>
}
export interface GooglePublisher {
  publish(input: GooglePublishInput): Promise<GooglePublishedIds>
  setCampaignStatus(input: {
    connectionId: string
    customerId: string
    campaignId: string
    active: boolean
  }): Promise<void>
  deleteCampaign(input: {
    connectionId: string
    customerId: string
    campaignId: string
  }): Promise<void>
}
// The platforms beyond Snapchat. One that is left out is not offered.
export interface PublishingPlatforms {
  tiktok?: { access: TokenAccess; api: TikTokPublisher }
  meta?: { access: TokenAccess; api: MetaPublisher }
  google?: { api: GooglePublisher }
}

// The oldest exact ages Snapchat's targeting takes (see publishOn).
export const SNAPCHAT_MIN_AGE_TOP = 45
export const SNAPCHAT_MAX_AGE_TOP = 49

// Snapchat's floor is 5 US dollars a day; 20 covers it in riyals and the neighbouring currencies.
export const MIN_DAILY_BUDGET = 20
// Each platform's own floor for a day's budget, in riyals (TikTok's is 20 US dollars for an ad
// group). A platform still refuses an amount under its floor in another currency, in its words.
export const MIN_DAILY_BUDGETS: Record<PublishPlatform, number> = {
  snapchat: MIN_DAILY_BUDGET,
  tiktok: 75,
  meta: 20,
  google: 10,
}

// Where each platform's connections and ad accounts are kept.
const ACCOUNT_TABLES: Record<
  PublishPlatform,
  { connections: string; accounts: string; id: string; name: string }
> = {
  snapchat: {
    connections: "snapchat_oauth_connections",
    accounts: "snapchat_ads_accounts",
    id: "account_id",
    name: "account_name",
  },
  tiktok: {
    connections: "tiktok_ads_oauth_connections",
    accounts: "tiktok_ads_accounts",
    id: "account_id",
    name: "account_name",
  },
  meta: {
    connections: "meta_oauth_connections",
    accounts: "meta_ads_accounts",
    id: "account_id",
    name: "account_name",
  },
  google: {
    // Google's ad accounts hang off the shared connections table (since migration 007).
    connections: "integration_connections",
    accounts: "google_ads_customer_accounts",
    id: "customer_id",
    name: "display_name",
  },
}
const META_MANAGE_SCOPE = "ads_management"
// A publish that has not finished after this long was cut short (a restart mid-way).
const STALE_PUBLISH_MS = 10 * 60_000
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000

const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new IdentityError(code, 422, "validation", message, details)

// How many days a campaign runs, its first and last day both counted.
const runDays = (input: { startDate: string; endDate?: string | null }) =>
  Math.round(
    (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) /
      86_400_000
  ) + 1

const riyadhDay = (date: Date) =>
  new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
type SnapchatInput = Extract<PublishCampaignInput, { platform: "snapchat" }>

// Why a campaign's Snapchat settings cannot be published, judged before Snapchat is asked:
// a goal that does not belong to the objective, a spend cap under Snapchat's floor or under a
// quarter of the day's budget (Snapchat's own rule), or a bid that is missing or not allowed.
export function snapchatSettingsProblem(
  input: Pick<
    SnapchatInput,
    | "objective"
    | "goal"
    | "dailyBudget"
    | "campaignDailyCap"
    | "campaignLifetimeCap"
    | "bidStrategy"
    | "bidAmount"
    | "conversionWindow"
  > &
    Partial<Pick<SnapchatInput, "countryCode" | "regionIds" | "cityKeys">>
):
  | "goal"
  | "daily_cap"
  | "lifetime_cap"
  | "bid_amount"
  | "target_cost_goal"
  | "window_goal"
  | "places"
  | null {
  if (snapchatPlacesProblem(input.countryCode ?? "sa", input.regionIds, input.cityKeys)) {
    return "places"
  }
  const goals = SNAPCHAT_GOALS[input.objective]
  if (!goals) return "goal"
  const goal = input.goal ?? goals[0]
  if (!goals.includes(goal)) return "goal"
  if (input.campaignDailyCap != null) {
    if (
      input.campaignDailyCap < SNAPCHAT_MIN_SPEND_CAP ||
      input.campaignDailyCap < input.dailyBudget * 0.25
    ) {
      return "daily_cap"
    }
  }
  if (
    input.campaignLifetimeCap != null &&
    (input.campaignLifetimeCap < SNAPCHAT_MIN_SPEND_CAP ||
      input.campaignLifetimeCap < input.dailyBudget)
  ) {
    return "lifetime_cap"
  }
  const strategy = input.bidStrategy ?? "auto"
  if (strategy !== "auto") {
    if (!(Number(input.bidAmount) > 0)) return "bid_amount"
    if (strategy === "target_cost" && !SNAPCHAT_TARGET_COST_GOALS.has(goal)) {
      return "target_cost_goal"
    }
  }
  // Only some goals take the 7-day window.
  if (input.conversionWindow === "SWIPE_7DAY" && !SNAPCHAT_WINDOW_GOALS.has(goal)) {
    return "window_goal"
  }
  return null
}

// The Snapchat settings that were chosen, kept with the record. Nothing chosen: nothing kept.
function snapchatDetails(input: SnapchatInput): PublicationDetails | null {
  const details: PublicationDetails = {}
  if (input.goal) details.goal = input.goal
  if (input.campaignDailyCap) details.campaignDailyCap = input.campaignDailyCap
  if (input.campaignLifetimeCap) details.campaignLifetimeCap = input.campaignLifetimeCap
  if (input.bidStrategy && input.bidStrategy !== "auto") {
    details.bidStrategy = input.bidStrategy
    if (input.bidAmount) details.bidAmount = input.bidAmount
  }
  if (input.conversionWindow) details.conversionWindow = input.conversionWindow
  if (input.regionIds?.length) details.regionIds = input.regionIds
  if (input.cityKeys?.length) details.cityKeys = input.cityKeys
  if (input.languages?.length) details.languages = input.languages
  if (input.interestIds?.length) details.interestIds = input.interestIds
  if (input.deviceSystem && input.deviceSystem !== "all") details.deviceSystem = input.deviceSystem
  if (input.deviceConnection && input.deviceConnection !== "all") {
    details.deviceConnection = input.deviceConnection
  }
  if (input.lifetimeBudget) details.lifetimeBudget = input.lifetimeBudget
  if (input.objective === "app" && input.app) details.app = input.app
  if (input.moreAdGroups?.length) {
    details.adGroups = input.moreAdGroups
    if (input.adGroupName?.trim()) details.adGroupName = input.adGroupName.trim()
  }
  if (input.moreAds?.length) {
    details.ads = input.moreAds
    if (input.adName?.trim()) details.adName = input.adName.trim()
  }
  return Object.keys(details).length > 0 ? details : null
}

const riyadhMidnight = (day: string) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() - RIYADH_OFFSET_MS)

// Snapchat shows ads full-screen on a phone: an upright 9:16 file, at least 1080 wide, and a
// video between 3 seconds and 3 minutes. A creative whose size was never measured is left for
// Snapchat to judge.
export function snapchatCreativeProblem(creative: CreativeView): string | null {
  if (creative.width && creative.height) {
    const ratio = creative.width / creative.height
    if (Math.abs(ratio - 9 / 16) > 0.02) return "ratio"
    if (creative.width < 1080) return "small"
  }
  if (creative.kind === "video" && creative.durationSeconds) {
    if (creative.durationSeconds < 3 || creative.durationSeconds > 180) return "duration"
  }
  return null
}

// Whether a creative fits the platform it is going to, or what is wrong with it.
//   TikTok: video only -- upright, square or wide -- from 5 seconds to 10 minutes.
//   Meta: a picture or a video at least 600 wide, no taller than 9:16 and no wider than 1.91:1.
export function creativeProblemFor(
  platform: Exclude<PublishPlatform, "google">,
  creative: CreativeView
): string | null {
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

const TRACKING_SOURCE: Record<PublishPlatform, { source: string; medium: string }> = {
  snapchat: { source: "snapchat", medium: "paid_social" },
  tiktok: { source: "tiktok", medium: "paid_social" },
  meta: { source: "meta", medium: "paid_social" },
  google: { source: "google", medium: "cpc" },
}

// The tracking words on a link, as the form's own boxes hold them (utm_source, utm_medium,
// utm_campaign, utm_content). A box left empty is left off the link.
export interface LinkTracking {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
}

// A name as a tracking word: lower case, letters and digits, the rest as underscores.
export function trackingSlug(name: string, fallback = "campaign"): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || fallback
  )
}

// The landing page's address with the campaign named in it, so Madar's own reports (and the
// merchant's analytics) can tell which campaign a visit came from.
//   With `tracking` (the form's own boxes): exactly those words are written on the link.
//   Without it: Madar's own words are added, unless the address already carries utm_source.
export function withCampaignTracking(
  url: string,
  campaignName: string,
  platform: PublishPlatform = "snapchat",
  tracking?: LinkTracking | null
): string {
  const parsed = new URL(url)
  if (tracking) {
    for (const [key, value] of [
      ["utm_source", tracking.source],
      ["utm_medium", tracking.medium],
      ["utm_campaign", tracking.campaign],
      ["utm_content", tracking.content],
    ] as const) {
      const word = value?.trim()
      if (word) parsed.searchParams.set(key, word)
      else parsed.searchParams.delete(key)
    }
    return parsed.toString()
  }
  if (parsed.searchParams.has("utm_source")) return parsed.toString()
  parsed.searchParams.set("utm_source", TRACKING_SOURCE[platform].source)
  parsed.searchParams.set("utm_medium", TRACKING_SOURCE[platform].medium)
  parsed.searchParams.set("utm_campaign", trackingSlug(campaignName))
  return parsed.toString()
}

interface PublicationRow {
  id: string
  platform: string
  connection_id: string
  ad_account_id: string
  name: string
  objective: string
  currency: string | null
  daily_budget: number | string
  start_at: Date | string
  end_at: Date | string | null
  targeting: unknown
  creative_id: string | null
  brand_name: string
  headline: string
  call_to_action: string
  destination_url: string
  details: unknown
  status: string
  platform_status: string
  external_ids: unknown
  error: string | null
  created_at: Date | string
  updated_at: Date | string
  [key: string]: unknown
}

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value))
const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  if (typeof value !== "string") return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapPublication(row: PublicationRow, now: Date): PublicationView {
  const stale =
    row.status === "publishing" &&
    now.getTime() - new Date(iso(row.updated_at)).getTime() > STALE_PUBLISH_MS
  const targeting = json<Partial<PublicationView["targeting"]>>(row.targeting, {})
  const ids = json<{ campaignId?: string }>(row.external_ids, {})
  return {
    id: row.id,
    platform: row.platform,
    adAccountId: row.ad_account_id,
    name: row.name,
    objective: row.objective,
    currency: row.currency,
    dailyBudget: Number(row.daily_budget),
    startAt: iso(row.start_at),
    endAt: row.end_at ? iso(row.end_at) : null,
    targeting: {
      countryCode: targeting.countryCode ?? "sa",
      minAge: targeting.minAge ?? 18,
      maxAge: targeting.maxAge ?? null,
      gender: targeting.gender ?? "all",
    },
    creativeId: row.creative_id,
    brandName: row.brand_name,
    headline: row.headline,
    callToAction: row.call_to_action,
    url: row.destination_url,
    details: json<PublicationDetails | null>(row.details, null),
    status: stale ? "failed" : (row.status as PublicationStatus),
    platformStatus: row.platform_status === "active" ? "active" : "paused",
    error: stale
      ? { code: "PUBLISH_INTERRUPTED", step: null, reason: "The publish was interrupted." }
      : json<PublicationView["error"]>(row.error, null),
    externalCampaignId: ids.campaignId ?? null,
    createdAt: iso(row.created_at),
  }
}

const SELECT = `SELECT id, platform, connection_id, ad_account_id, name, objective, currency,
  daily_budget, start_at, end_at, targeting, creative_id, brand_name, headline, call_to_action,
  destination_url, details, status, platform_status, external_ids, error, created_at, updated_at
  FROM campaign_publications`

export class CampaignPublishingService {
  // Publishes still running in this process, so tests (and a graceful stop) can wait for them.
  private readonly running = new Set<Promise<void>>()
  // Snapchat's regions per country, kept for a day.
  private readonly regions = new Map<string, { regions: SnapchatRegion[]; until: number }>()
  // Snapchat's languages, and its interests per country, kept for a day too.
  private languages: { languages: SnapchatLanguage[]; until: number } | null = null
  private readonly interests = new Map<string, { interests: SnapchatInterest[]; until: number }>()

  constructor(
    private readonly db: PostgresDatabase,
    private readonly creatives: CampaignCreativesService,
    private readonly snapchatAccess: SnapchatAccess,
    private readonly snapchat: SnapchatPublisher,
    private readonly now: () => Date = () => new Date(),
    private readonly platforms: PublishingPlatforms = {}
  ) {}

  private offered(platform: PublishPlatform): boolean {
    return platform === "snapchat" || Boolean(this.platforms[platform])
  }

  // The organization's connected ad accounts on one platform (the actor's branch when one is
  // chosen). For Meta, `readOnly` says a connection exists that may only read.
  private async accounts(
    actor: AuthenticatedActor,
    platform: PublishPlatform
  ): Promise<{ accounts: PublishAccount[]; readOnly: boolean }> {
    const accounts: PublishAccount[] = []
    if (!this.offered(platform)) return { accounts, readOnly: false }
    const tables = ACCOUNT_TABLES[platform]
    const connections = await this.db.query<{
      id: string
      workspace_id: string | null
      scopes?: unknown
    }>(
      `SELECT id, workspace_id${platform === "meta" ? ", scopes" : ""} FROM ${tables.connections}
        WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'connected'`,
      [actor.organizationId]
    )
    let readOnly = false
    for (const connection of connections.rows) {
      if (actor.workspaceId && connection.workspace_id !== actor.workspaceId) continue
      if (
        platform === "meta" &&
        !json<string[]>(connection.scopes, []).includes(META_MANAGE_SCOPE)
      ) {
        readOnly = true
        continue
      }
      const result = await this.db.query<{
        id: string
        name: string | null
        currency_code: string | null
      }>(
        `SELECT ${tables.id} AS id, ${tables.name} AS name, currency_code FROM ${tables.accounts}
          WHERE connection_id = $1 AND status = 'active'
          ORDER BY is_selected DESC, ${tables.name} ASC`,
        [connection.id]
      )
      for (const row of result.rows) {
        accounts.push({
          connectionId: connection.id,
          adAccountId: row.id,
          name: row.name ?? row.id,
          currency: row.currency_code,
        })
      }
    }
    return { accounts, readOnly }
  }

  async options(actor: AuthenticatedActor): Promise<PublishOptions> {
    const [snapchat, tiktok, meta, google] = await Promise.all(
      PUBLISH_PLATFORMS.map((platform) => this.accounts(actor, platform))
    )
    return {
      snapchat: { accounts: snapchat.accounts },
      tiktok: { accounts: tiktok.accounts },
      meta: {
        accounts: meta.accounts,
        needsPermission: meta.accounts.length === 0 && meta.readOnly,
      },
      google: { accounts: google.accounts },
      limits: {
        headlineMax: SNAPCHAT_HEADLINE_MAX,
        brandNameMax: SNAPCHAT_BRAND_NAME_MAX,
        minDailyBudget: MIN_DAILY_BUDGET,
        countries: PUBLISH_COUNTRIES,
        minDailyBudgets: MIN_DAILY_BUDGETS,
        tiktokTextMax: TIKTOK_TEXT_MAX,
        metaHeadlineMax: META_HEADLINE_MAX,
        metaTextMax: META_TEXT_MAX,
        googleHeadlineMax: GOOGLE_HEADLINE_MAX,
        googleDescriptionMax: GOOGLE_DESCRIPTION_MAX,
      },
    }
  }

  // The regions and cities a Snapchat campaign in this country can be narrowed to. The regions
  // are Snapchat's own list, asked for through one of the organization's connections and kept
  // for a day (they do not change).
  async locations(
    actor: AuthenticatedActor,
    connectionId: string,
    countryCode: string
  ): Promise<PublishLocations> {
    const country = countryCode.toLowerCase()
    const cities = snapchatCities(country).map(({ key, name, nameAr }) => ({ key, name, nameAr }))
    const own = (await this.accounts(actor, "snapchat")).accounts.some(
      (entry) => entry.connectionId === connectionId
    )
    if (!own) throw invalid("PUBLISH_ACCOUNT_NOT_CONNECTED", "That ad account is not connected.")
    const kept = this.regions.get(country)
    if (kept && kept.until > this.now().getTime()) return { regions: kept.regions, cities }
    if (!this.snapchat.listRegions) return { regions: [], cities }
    const regions = await this.snapchat
      .listRegions({
        accessToken: await this.snapchatAccess.resolveAccessToken(connectionId),
        countryCode: country,
      })
      // Without the list the campaign can still be aimed at the whole country or at cities.
      .catch(() => [] as SnapchatRegion[])
    if (regions.length > 0) {
      this.regions.set(country, { regions, until: this.now().getTime() + 24 * 60 * 60_000 })
    }
    return { regions, cities }
  }

  // The languages and the interests a Snapchat campaign in this country can be narrowed to:
  // Snapchat's own lists, asked for through one of the organization's connections and kept for
  // a day. A list Snapchat did not give comes back empty, and the campaign reaches everyone.
  async audiences(
    actor: AuthenticatedActor,
    connectionId: string,
    countryCode: string
  ): Promise<PublishAudiences> {
    const country = countryCode.toLowerCase()
    const own = (await this.accounts(actor, "snapchat")).accounts.some(
      (entry) => entry.connectionId === connectionId
    )
    if (!own) throw invalid("PUBLISH_ACCOUNT_NOT_CONNECTED", "That ad account is not connected.")
    const now = this.now().getTime()
    const until = now + 24 * 60 * 60_000
    let token: Promise<string> | null = null
    const accessToken = () => (token ??= this.snapchatAccess.resolveAccessToken(connectionId))
    let languages = this.languages && this.languages.until > now ? this.languages.languages : null
    if (!languages) {
      languages = this.snapchat.listLanguages
        ? await accessToken()
            .then((key) => this.snapchat.listLanguages!({ accessToken: key }))
            .catch(() => [] as SnapchatLanguage[])
        : []
      if (languages.length > 0) this.languages = { languages, until }
    }
    const kept = this.interests.get(country)
    let interests = kept && kept.until > now ? kept.interests : null
    if (!interests) {
      interests = this.snapchat.listInterests
        ? await accessToken()
            .then((key) => this.snapchat.listInterests!({ accessToken: key, countryCode: country }))
            .catch(() => [] as SnapchatInterest[])
        : []
      if (interests.length > 0) this.interests.set(country, { interests, until })
    }
    return { languages, interests }
  }

  async list(organizationId: string): Promise<PublicationView[]> {
    const result = await this.db.query<PublicationRow>(
      `${SELECT} WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [organizationId]
    )
    return result.rows.map((row) => mapPublication(row, this.now()))
  }

  private async row(organizationId: string, id: string): Promise<PublicationRow> {
    const result = await this.db.query<PublicationRow>(
      `${SELECT} WHERE organization_id = $1 AND id = $2`,
      [organizationId, id]
    )
    if (!result.rows[0]) {
      throw new IdentityError("PUBLICATION_NOT_FOUND", 404, "business", "Campaign not found.")
    }
    return result.rows[0]
  }

  async get(organizationId: string, id: string): Promise<PublicationView> {
    return mapPublication(await this.row(organizationId, id), this.now())
  }

  // Checks the request, records the campaign as "publishing" and starts the publish. Everything
  // that can be judged without the platform is judged here, so the merchant hears about it at
  // once rather than after a wait.
  async publish(actor: AuthenticatedActor, given: PublishCampaignInput): Promise<PublicationView> {
    // A Snapchat budget for the whole run: it needs a last day, and what it comes to a day is
    // held to the same floor as a daily budget and kept as the record's daily budget.
    let input = given
    if (given.platform === "snapchat" && given.lifetimeBudget) {
      const days = given.endDate && given.endDate >= given.startDate ? runDays(given) : 0
      const minimum = MIN_DAILY_BUDGETS.snapchat * days
      if (days === 0 || given.lifetimeBudget < minimum) {
        throw invalid(
          "PUBLISH_SETTINGS_NOT_SUITABLE",
          "A budget for the whole run needs an end date and enough for each day.",
          { problem: days === 0 ? "lifetime_budget_end" : "lifetime_budget", minimum }
        )
      }
      input = { ...given, dailyBudget: Math.round((given.lifetimeBudget / days) * 100) / 100 }
    }
    // More ad groups: each held to the same rules as the first, with the same kind of budget.
    if (input.platform === "snapchat" && input.moreAdGroups?.length) {
      const first = input
      const days = first.lifetimeBudget ? runDays(first) : 0
      const unsuitable = (problem: string) =>
        invalid("PUBLISH_SETTINGS_NOT_SUITABLE", "An ad group's settings do not fit Snapchat.", {
          problem,
        })
      const groups = input.moreAdGroups.map((group) => {
        if (Boolean(group.lifetimeBudget) !== Boolean(first.lifetimeBudget)) {
          throw unsuitable("budget_kind")
        }
        const dailyBudget = group.lifetimeBudget
          ? Math.round((group.lifetimeBudget / days) * 100) / 100
          : group.dailyBudget
        if (dailyBudget < MIN_DAILY_BUDGETS.snapchat) {
          throw invalid("PUBLISH_BUDGET_TOO_LOW", "An ad group's budget is too low.", {
            minimum: MIN_DAILY_BUDGETS.snapchat,
          })
        }
        if (group.maxAge && group.maxAge <= group.minAge) {
          throw invalid("PUBLISH_AGE_RANGE", "The oldest age has to be above the youngest.")
        }
        if (snapchatPlacesProblem(first.countryCode, group.regionIds, group.cityKeys)) {
          throw unsuitable("places")
        }
        return { ...group, name: group.name.trim(), dailyBudget }
      })
      if (groups.length + 1 > PUBLISH_MAX_AD_GROUPS) throw unsuitable("too_many_ad_groups")
      input = { ...first, moreAdGroups: groups }
    }
    if (input.platform === "snapchat" && (input.moreAds?.length ?? 0) + 1 > PUBLISH_MAX_ADS) {
      throw invalid("PUBLISH_SETTINGS_NOT_SUITABLE", "Too many ads.", { problem: "too_many_ads" })
    }
    // What the whole campaign may spend in a day: every ad group's budget together.
    const totalDailyBudget =
      input.platform === "snapchat"
        ? Math.round(
            (input.dailyBudget +
              (input.moreAdGroups ?? []).reduce((sum, group) => sum + group.dailyBudget, 0)) *
              100
          ) / 100
        : input.dailyBudget
    const account = (await this.accounts(actor, input.platform)).accounts.find(
      (entry) =>
        entry.connectionId === input.connectionId && entry.adAccountId === input.adAccountId
    )
    if (!account) {
      throw invalid("PUBLISH_ACCOUNT_NOT_CONNECTED", "That ad account is not connected.")
    }
    const minimum = MIN_DAILY_BUDGETS[input.platform]
    if (input.dailyBudget < minimum) {
      throw invalid("PUBLISH_BUDGET_TOO_LOW", `The daily budget starts at ${minimum}.`, {
        minimum,
      })
    }
    const now = this.now()
    const today = riyadhDay(now)
    if (input.startDate < today) {
      throw invalid("PUBLISH_START_IN_PAST", "The start date has passed.")
    }
    if (input.endDate && input.endDate < input.startDate) {
      throw invalid("PUBLISH_END_BEFORE_START", "The end date is before the start date.")
    }
    if (input.maxAge && input.maxAge <= input.minAge) {
      throw invalid("PUBLISH_AGE_RANGE", "The oldest age has to be above the youngest.")
    }
    if (input.platform === "snapchat") {
      const problem = snapchatSettingsProblem({ ...input, dailyBudget: totalDailyBudget })
      if (problem) {
        throw invalid(
          "PUBLISH_SETTINGS_NOT_SUITABLE",
          "A campaign setting does not fit Snapchat.",
          {
            problem,
          }
        )
      }
    } else if (input.objective !== "traffic" && input.objective !== "leads") {
      // The other platforms are published with two objectives for now.
      throw invalid("PUBLISH_OBJECTIVE_NOT_SUPPORTED", "That objective is not available there yet.")
    }
    // An app campaign: the app's details and icon have to fit, its ads carry an app button, and
    // they lead to the app's store page rather than to a link. Any other campaign: no app button.
    const isApp = input.platform === "snapchat" && input.objective === "app"
    if (input.platform === "snapchat") {
      const buttons = [input.callToAction, ...(input.moreAds ?? []).map((ad) => ad.callToAction)]
      if (isApp) {
        const icon = input.app?.iconCreativeId
          ? await this.creatives.get(actor.organizationId, input.app.iconCreativeId)
          : null
        const problem = snapchatAppProblem(input.app, icon)
        if (problem) {
          throw invalid("PUBLISH_APP_NOT_SUITABLE", "The app's details do not fit Snapchat.", {
            problem,
          })
        }
        const store = appStoreUrl(input.app!)
        input = {
          ...input,
          app: {
            name: input.app!.name.trim(),
            iosAppId: input.app!.iosAppId || null,
            androidPackage: input.app!.androidPackage || null,
            iconCreativeId: input.app!.iconCreativeId,
          },
          url: store,
          moreAds: input.moreAds?.map((ad) => ({ ...ad, url: store })) ?? null,
        }
      }
      const allowed = isApp
        ? (button: SnapchatCallToAction) => SNAPCHAT_APP_CALLS_TO_ACTION.includes(button)
        : (button: SnapchatCallToAction) => !SNAPCHAT_APP_ONLY_CALLS_TO_ACTION.includes(button)
      if (!buttons.every(allowed)) {
        throw invalid("PUBLISH_SETTINGS_NOT_SUITABLE", "That button does not fit the ad.", {
          problem: "call_to_action",
        })
      }
    }
    let url: string
    try {
      const parsed = new URL(input.url)
      if (parsed.protocol !== "https:") throw new Error("not https")
      url = isApp
        ? input.url
        : withCampaignTracking(input.url, input.name, input.platform, input.tracking)
    } catch {
      throw invalid("PUBLISH_INVALID_URL", "The website address has to start with https://.")
    }
    if (input.platform === "google") {
      const problem = googleTextProblem(input)
      if (problem) {
        throw invalid("PUBLISH_TEXT_NOT_SUITABLE", "The ad's text does not fit Google.", {
          problem,
        })
      }
    } else {
      const creative = await this.creatives.get(actor.organizationId, input.creativeId)
      const problem = creativeProblemFor(input.platform, creative)
      if (problem) {
        throw invalid("PUBLISH_CREATIVE_NOT_SUITABLE", "The creative does not fit the platform.", {
          problem,
        })
      }
    }
    // More ads: each with a creative that fits and a secure link, tracked like the first.
    if (input.platform === "snapchat" && input.moreAds?.length) {
      const ads: PublishAdInput[] = []
      for (const ad of input.moreAds) {
        const creative = await this.creatives.get(actor.organizationId, ad.creativeId)
        const problem = creativeProblemFor("snapchat", creative)
        if (problem) {
          throw invalid("PUBLISH_CREATIVE_NOT_SUITABLE", "A creative does not fit the platform.", {
            problem,
          })
        }
        let adUrl: string
        try {
          if (new URL(ad.url).protocol !== "https:") throw new Error("not https")
          adUrl = isApp
            ? ad.url
            : withCampaignTracking(ad.url, input.name, "snapchat", input.tracking)
        } catch {
          throw invalid("PUBLISH_INVALID_URL", "The website address has to start with https://.")
        }
        ads.push({ ...ad, name: ad.name.trim(), headline: ad.headline.trim(), url: adUrl })
      }
      input = { ...input, moreAds: ads }
    }
    const details: PublicationDetails | null =
      input.platform === "google"
        ? {
            headlines: input.headlines.map((entry) => entry.trim()).filter(Boolean),
            descriptions: input.descriptions.map((entry) => entry.trim()).filter(Boolean),
            keywords: input.keywords.map((entry) => entry.trim()).filter(Boolean),
          }
        : input.platform === "meta"
          ? { text: input.text.trim() }
          : input.platform === "snapchat"
            ? snapchatDetails(input)
            : null

    // Today: a few minutes from now, so the start is never already in the past when Snapchat
    // reads it. A later day: its first minute in Riyadh.
    const startAt =
      input.startDate === today
        ? new Date(now.getTime() + 5 * 60_000)
        : riyadhMidnight(input.startDate)
    // The end date is the last day the campaign runs, through to its last minute.
    const endAt = input.endDate
      ? new Date(riyadhMidnight(input.endDate).getTime() + 24 * 60 * 60_000 - 60_000)
      : null

    const id = randomUUID()
    await this.db.query(
      `INSERT INTO campaign_publications
         (id, organization_id, workspace_id, platform, connection_id, ad_account_id, name,
          objective, currency, daily_budget, start_at, end_at, targeting, creative_id, brand_name,
          headline, call_to_action, destination_url, status, platform_status, created_by,
          details)
       VALUES ($1, $2, $3, $20, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
               $16, $17, 'publishing', $18, $19, $21)`,
      [
        id,
        actor.organizationId,
        actor.workspaceId ?? null,
        input.connectionId,
        input.adAccountId,
        input.name.trim(),
        input.objective,
        account.currency,
        totalDailyBudget,
        startAt.toISOString(),
        endAt ? endAt.toISOString() : null,
        JSON.stringify({
          countryCode: input.countryCode,
          minAge: input.minAge,
          maxAge: input.maxAge ?? null,
          gender: input.gender,
        }),
        input.platform === "google" ? null : input.creativeId,
        input.platform === "snapchat" || input.platform === "tiktok" ? input.brandName.trim() : "",
        input.platform === "google" ? (details?.headlines?.[0] ?? "") : input.headline.trim(),
        input.platform === "google" ? "" : input.callToAction,
        url,
        input.startActive ? "active" : "paused",
        actor.userId,
        input.platform,
        details ? JSON.stringify(details) : null,
      ]
    )

    const work = this.run(actor.organizationId, id, input, url, startAt, endAt).finally(() =>
      this.running.delete(work)
    )
    this.running.add(work)
    return this.get(actor.organizationId, id)
  }

  // The publish itself. Never throws: the outcome is written to the record.
  private async run(
    organizationId: string,
    id: string,
    input: PublishCampaignInput,
    url: string,
    startAt: Date,
    endAt: Date | null
  ): Promise<void> {
    try {
      const ids = await this.publishOn(organizationId, input, url, startAt, endAt)
      await this.db.query(
        `UPDATE campaign_publications
            SET status = 'published', external_ids = $2::jsonb, error = NULL, updated_at = now()
          WHERE id = $1`,
        [id, JSON.stringify(ids)]
      )
      await this.tieAds(organizationId, input, ids)
    } catch (caught) {
      const error =
        caught instanceof SnapchatPublishError || caught instanceof PlatformPublishError
          ? { code: caught.code, step: caught.step, reason: caught.reason }
          : {
              code: caught instanceof IdentityError ? caught.code : "PUBLISH_FAILED",
              step: null,
              reason: caught instanceof Error ? caught.message.slice(0, 400) : String(caught),
            }
      console.error("campaigns.publish_failed", { id, organizationId, ...error })
      await this.db
        .query(
          `UPDATE campaign_publications SET status = 'failed', error = $2, updated_at = now()
            WHERE id = $1`,
          [id, JSON.stringify(error)]
        )
        .catch((dbError: unknown) =>
          console.error("campaigns.publish_record_failed", { id, dbError })
        )
    }
  }

  // Hands the campaign to its platform's publisher and answers with the ids the platform gave.
  private async publishOn(
    organizationId: string,
    input: PublishCampaignInput,
    url: string,
    startAt: Date,
    endAt: Date | null
  ): Promise<{ campaignId: string }> {
    const common = {
      name: input.name.trim(),
      // Checked in publish(): only Snapchat is given the wider choice.
      objective: (input.objective === "leads" ? "leads" : "traffic") as "traffic" | "leads",
      dailyBudget: input.dailyBudget,
      url,
      startActive: input.startActive,
    }
    if (input.platform === "google") {
      const google = this.platforms.google
      if (!google) throw new IdentityError("PUBLISH_FAILED", 422, "business", "Not available.")
      return google.api.publish({
        ...common,
        connectionId: input.connectionId,
        customerId: input.adAccountId.replace(/\D/g, ""),
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        countryCode: input.countryCode,
        headlines: input.headlines.map((entry) => entry.trim()).filter(Boolean),
        descriptions: input.descriptions.map((entry) => entry.trim()).filter(Boolean),
        keywords: input.keywords.map((entry) => entry.trim()).filter(Boolean),
      })
    }
    const file = await this.creatives.readFile(organizationId, input.creativeId)
    const shown = {
      ...common,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      countryCode: input.countryCode,
      minAge: input.minAge,
      maxAge: input.maxAge ?? null,
      gender: input.gender,
      media: {
        kind: file.creative.kind,
        bytes: file.bytes,
        contentType: file.creative.contentType,
        fileName: file.fileName,
      },
    }
    if (input.platform === "tiktok") {
      const tiktok = this.platforms.tiktok
      if (!tiktok) throw new IdentityError("PUBLISH_FAILED", 422, "business", "Not available.")
      return tiktok.api.publish({
        ...shown,
        accessToken: await tiktok.access.resolveAccessToken(input.connectionId),
        advertiserId: input.adAccountId,
        brandName: input.brandName.trim(),
        text: input.headline.trim(),
        callToAction: input.callToAction,
      })
    }
    if (input.platform === "meta") {
      const meta = this.platforms.meta
      if (!meta) throw new IdentityError("PUBLISH_FAILED", 422, "business", "Not available.")
      return meta.api.publish({
        ...shown,
        accessToken: await meta.access.resolveAccessToken(input.connectionId),
        adAccountId: input.adAccountId,
        text: input.text.trim(),
        headline: input.headline.trim(),
        callToAction: input.callToAction,
      })
    }
    // Snapchat takes an exact youngest age up to 45 and an exact oldest age up to 49; anything
    // above that is "and older", which is said by leaving the oldest age out.
    return this.snapchat.publish({
      ...shown,
      objective: input.objective,
      goal: input.goal ?? null,
      campaignDailyCap: input.campaignDailyCap ?? null,
      campaignLifetimeCap: input.campaignLifetimeCap ?? null,
      bidStrategy: input.bidStrategy ?? null,
      bidAmount: input.bidAmount ?? null,
      conversionWindow: input.conversionWindow ?? null,
      regionIds: input.regionIds ?? null,
      cityKeys: input.cityKeys ?? null,
      languages: input.languages ?? null,
      interestIds: input.interestIds ?? null,
      deviceSystem: input.deviceSystem ?? null,
      deviceConnection: input.deviceConnection ?? null,
      lifetimeBudget: input.lifetimeBudget ?? null,
      app:
        input.objective === "app" && input.app
          ? await this.creatives
              .readFile(organizationId, input.app.iconCreativeId)
              .then((icon) => ({
                name: input.app!.name,
                iosAppId: input.app!.iosAppId ?? null,
                androidPackage: input.app!.androidPackage ?? null,
                icon: {
                  kind: icon.creative.kind,
                  bytes: icon.bytes,
                  contentType: icon.creative.contentType,
                  fileName: icon.fileName,
                },
              }))
          : null,
      adGroupName: input.adGroupName ?? null,
      adName: input.adName ?? null,
      moreAdGroups: (input.moreAdGroups ?? []).map((group) => ({
        ...group,
        minAge: Math.min(group.minAge, SNAPCHAT_MIN_AGE_TOP),
        maxAge: group.maxAge && group.maxAge <= SNAPCHAT_MAX_AGE_TOP ? group.maxAge : null,
      })),
      moreAds: await Promise.all(
        (input.moreAds ?? []).map(async (ad) => {
          const adFile = await this.creatives.readFile(organizationId, ad.creativeId)
          return {
            name: ad.name,
            headline: ad.headline,
            callToAction: ad.callToAction,
            url: ad.url,
            media: {
              kind: adFile.creative.kind,
              bytes: adFile.bytes,
              contentType: adFile.creative.contentType,
              fileName: adFile.fileName,
            },
          }
        })
      ),
      minAge: Math.min(shown.minAge, SNAPCHAT_MIN_AGE_TOP),
      maxAge: shown.maxAge && shown.maxAge <= SNAPCHAT_MAX_AGE_TOP ? shown.maxAge : null,
      accessToken: await this.snapchatAccess.resolveAccessToken(input.connectionId),
      adAccountId: input.adAccountId,
      brandName: input.brandName.trim(),
      headline: input.headline.trim(),
      callToAction: input.callToAction,
    })
  }

  // A campaign made with several ad groups or ads: every ad but the first (which the record
  // itself names) is tied to the library creative it was made from (campaign_creative_ads), so
  // the library counts it and its file is never brought in again as a new one. A tie that could
  // not be written does not undo the publish.
  private async tieAds(
    organizationId: string,
    input: PublishCampaignInput,
    ids: { campaignId: string } & Partial<SnapchatPublishedIds>
  ): Promise<void> {
    if (input.platform !== "snapchat" || !ids.ads) return
    const creativeIds = [input.creativeId, ...(input.moreAds ?? []).map((ad) => ad.creativeId)]
    for (const ad of ids.ads) {
      const creativeId = creativeIds[ad.adIndex]
      if (ad.adId === ids.adId || !creativeId) continue
      await this.db
        .query(
          `INSERT INTO campaign_creative_ads
             (id, organization_id, creative_id, platform, connection_id, account_id, ad_id,
              platform_creative_id, media_id)
           VALUES ($1, $2, $3, 'snapchat', $4, $5, $6, $7, $8)
           ON CONFLICT (platform, connection_id, ad_id) DO NOTHING`,
          [
            randomUUID(),
            organizationId,
            creativeId,
            input.connectionId,
            input.adAccountId,
            ad.adId,
            ad.creativeId,
            ad.mediaId,
          ]
        )
        .catch((error: unknown) =>
          console.error("campaigns.publish_ad_tie_failed", {
            message: error instanceof Error ? error.message : String(error),
          })
        )
    }
  }

  // One published campaign's switch or removal, on whichever platform holds it.
  private async onPlatform(
    row: PublicationRow,
    campaignId: string,
    action: { active: boolean } | "delete"
  ): Promise<void> {
    try {
      if (row.platform === "tiktok" && this.platforms.tiktok) {
        const target = {
          accessToken: await this.platforms.tiktok.access.resolveAccessToken(row.connection_id),
          advertiserId: row.ad_account_id,
          campaignId,
        }
        return action === "delete"
          ? await this.platforms.tiktok.api.deleteCampaign(target)
          : await this.platforms.tiktok.api.setCampaignStatus({ ...target, ...action })
      }
      if (row.platform === "meta" && this.platforms.meta) {
        const target = {
          accessToken: await this.platforms.meta.access.resolveAccessToken(row.connection_id),
          campaignId,
        }
        return action === "delete"
          ? await this.platforms.meta.api.deleteCampaign(target)
          : await this.platforms.meta.api.setCampaignStatus({ ...target, ...action })
      }
      if (row.platform === "google" && this.platforms.google) {
        const target = {
          connectionId: row.connection_id,
          customerId: row.ad_account_id.replace(/\D/g, ""),
          campaignId,
        }
        return action === "delete"
          ? await this.platforms.google.api.deleteCampaign(target)
          : await this.platforms.google.api.setCampaignStatus({ ...target, ...action })
      }
      const accessToken = await this.snapchatAccess.resolveAccessToken(row.connection_id)
      return action === "delete"
        ? await this.snapchat.deleteCampaign({ accessToken, campaignId })
        : await this.snapchat.setCampaignStatus({
            accessToken,
            adAccountId: row.ad_account_id,
            campaignId,
            ...action,
          })
    } catch (caught) {
      if (caught instanceof SnapchatPublishError || caught instanceof PlatformPublishError) {
        throw new IdentityError(caught.code, 422, "external", caught.reason, { step: caught.step })
      }
      throw caught
    }
  }

  // Switches a published campaign on or off on the platform.
  async setActive(
    actor: AuthenticatedActor,
    id: string,
    active: boolean
  ): Promise<PublicationView> {
    const row = await this.row(actor.organizationId, id)
    const ids = json<{ campaignId?: string }>(row.external_ids, {})
    if (row.status !== "published" || !ids.campaignId) {
      throw new IdentityError(
        "PUBLICATION_NOT_PUBLISHED",
        409,
        "business",
        "Only a published campaign can be switched on or off."
      )
    }
    await this.onPlatform(row, ids.campaignId, { active })
    await this.db.query(
      `UPDATE campaign_publications SET platform_status = $2, updated_at = now() WHERE id = $1`,
      [id, active ? "active" : "paused"]
    )
    return this.get(actor.organizationId, id)
  }

  // Removes a campaign published from Madar: deleted on the platform first (so nothing keeps
  // spending), then taken off Madar's list. A publish that failed left nothing on the platform
  // and is only taken off the list; one still being published cannot be removed yet.
  async remove(actor: AuthenticatedActor, id: string): Promise<void> {
    const row = await this.row(actor.organizationId, id)
    const view = mapPublication(row, this.now())
    if (view.status === "publishing") {
      throw new IdentityError(
        "PUBLICATION_STILL_PUBLISHING",
        409,
        "business",
        "The campaign is still being published."
      )
    }
    const ids = json<{ campaignId?: string }>(row.external_ids, {})
    if (view.status === "published" && ids.campaignId) {
      await this.onPlatform(row, ids.campaignId, "delete")
    }
    await this.db.query(
      `DELETE FROM campaign_publications WHERE organization_id = $1 AND id = $2`,
      [actor.organizationId, id]
    )
  }

  // Waits for the publishes this process started (tests).
  async settled(): Promise<void> {
    await Promise.all([...this.running])
  }
}
