// What the publishers for TikTok, Meta and Google Ads share with the publishing service
// (service.ts): the shape of a refusal, the file being published, and what each one is handed
// and gives back. (Snapchat's publisher was written first and keeps its own types in
// snapchat-publisher.ts.)
//
// Each publisher creates the pieces of one campaign in the order its platform needs them and, if
// a later piece is refused, deletes the campaign created so far -- a failed publish leaves
// nothing behind on the account.

export type PublishObjective = "traffic" | "leads"

export type PublishStep = "account" | "campaign" | "ad_set" | "media" | "creative" | "ad" | "status"

export type PublishErrorCode =
  // The platform refused a step; `reason` is its own explanation.
  | "REFUSED"
  // The connection is not allowed to do this (missing permission, expired login).
  | "ACCESS_DENIED"
  // A sign-ups campaign needs the account's pixel and there is none.
  | "NO_PIXEL"
  // Meta: no Facebook page to show the ad under.
  | "NO_PAGE"
  // TikTok: no identity (the name and picture an ad is shown under) could be found or made.
  | "NO_IDENTITY"
  // The platform is still processing the uploaded file.
  | "MEDIA_NOT_READY"
  // It is no longer on the platform.
  | "GONE"

// A step a platform refused. `code` is "<PLATFORM>_<PublishErrorCode>", e.g. "TIKTOK_NO_PIXEL",
// which is what the screen has words for.
export class PlatformPublishError extends Error {
  readonly code: string

  constructor(
    readonly platform: "tiktok" | "meta" | "google",
    readonly step: PublishStep,
    readonly reason: string,
    kind: PublishErrorCode = "REFUSED"
  ) {
    super(`${platform} refused the ${step} step: ${reason}`)
    this.name = "PlatformPublishError"
    this.code = `${platform.toUpperCase()}_${kind}`
  }
}

export interface PublishMedia {
  kind: "image" | "video"
  bytes: Buffer
  contentType: string
  fileName: string
}

export interface PublishAudience {
  // Two letters, lower case: "sa", "ae", "kw", "qa", "bh", "om", "eg", "jo".
  countryCode: string
  minAge: number
  maxAge: number | null
  gender: "all" | "male" | "female"
}

// ---- TikTok ----

export const TIKTOK_CALLS_TO_ACTION = [
  "LEARN_MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
] as const
export type TikTokCallToAction = (typeof TIKTOK_CALLS_TO_ACTION)[number]
// TikTok's limit for the text shown with an ad.
export const TIKTOK_TEXT_MAX = 100

export interface TikTokPublishInput extends PublishAudience {
  accessToken: string
  advertiserId: string
  name: string
  objective: PublishObjective
  // In the ad account's currency.
  dailyBudget: number
  // ISO instants (UTC).
  startAt: string
  endAt: string | null
  // TikTok shows video ads; a picture is refused before anything is created.
  media: PublishMedia
  // The name the ad is shown under when the account has no TikTok identity of its own yet.
  brandName: string
  // The text shown with the video.
  text: string
  callToAction: TikTokCallToAction
  url: string
  startActive: boolean
}

export interface TikTokPublishedIds {
  campaignId: string
  adGroupId: string
  videoId: string
  adId: string
}

// ---- Meta (Facebook and Instagram) ----

export const META_CALLS_TO_ACTION = [
  "LEARN_MORE",
  "SHOP_NOW",
  "ORDER_NOW",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
] as const
export type MetaCallToAction = (typeof META_CALLS_TO_ACTION)[number]
export const META_HEADLINE_MAX = 40
export const META_TEXT_MAX = 125

export interface MetaPublishInput extends PublishAudience {
  accessToken: string
  // With or without the "act_" prefix.
  adAccountId: string
  name: string
  objective: PublishObjective
  // In the ad account's currency (whole units, e.g. 50 = 50 SAR).
  dailyBudget: number
  startAt: string
  endAt: string | null
  media: PublishMedia
  // The text above the picture or video.
  text: string
  // The bold line under it.
  headline: string
  callToAction: MetaCallToAction
  url: string
  startActive: boolean
}

export interface MetaPublishedIds {
  campaignId: string
  adSetId: string
  creativeId: string
  adId: string
}

// ---- Google Ads (a search campaign: text ads shown to people searching the keywords) ----

export const GOOGLE_HEADLINE_MAX = 30
export const GOOGLE_DESCRIPTION_MAX = 90
export const GOOGLE_MIN_HEADLINES = 3
export const GOOGLE_MIN_DESCRIPTIONS = 2

export interface GooglePublishInput {
  connectionId: string
  // Digits only.
  customerId: string
  name: string
  objective: PublishObjective
  dailyBudget: number
  // Date-only (YYYY-MM-DD), in the account's own time zone.
  startDate: string
  endDate: string | null
  countryCode: string
  headlines: string[]
  descriptions: string[]
  keywords: string[]
  url: string
  startActive: boolean
}

export interface GooglePublishedIds {
  campaignId: string
  budgetResourceName: string
  adGroupId: string
  adId: string
}
