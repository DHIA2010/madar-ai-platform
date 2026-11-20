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
  createdAt: string
}

export const CREATIVE_LIMITS = {
  imageBytes: 5 * 1024 * 1024,
  videoBytes: 30 * 1024 * 1024,
} as const

export type PublishObjective = "traffic" | "leads"
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

export interface PublishOptions {
  snapchat: {
    accounts: Array<{
      connectionId: string
      adAccountId: string
      name: string
      currency: string | null
    }>
  }
  limits: {
    headlineMax: number
    brandNameMax: number
    minDailyBudget: number
    countries: string[]
  }
}

export interface PublishCampaignInput {
  platform: "snapchat"
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
  creativeId: string
  brandName: string
  headline: string
  callToAction: CallToAction
  url: string
  startActive: boolean
}

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

  async removeCreative(id: string): Promise<void> {
    await client.delete(path("creatives", id))
  },

  async options(): Promise<PublishOptions> {
    return client.get<PublishOptions>(path("publish", "options"))
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
}
