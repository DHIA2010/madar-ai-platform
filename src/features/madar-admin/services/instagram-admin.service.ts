import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Madar Admin → إنستقرام: the connected account, the agent's weekly posts, approval and results.

export type AdminInstagramTemplate = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j"
export type AdminInstagramIcon =
  | "pos"
  | "store"
  | "ads"
  | "booking"
  | "inventory"
  | "invoice"
  | "loyalty"
  | "accounting"
  | "whatsapp"
  | "report"
  | "ai"
export type AdminInstagramScreen = "cashier" | "products" | "close"
export type AdminInstagramScene =
  | "shop-night"
  | "cafe-cashier"
  | "phone-stock"
  | "salon"
  | "laundry"
  | "online-store"
  | "supermarket"
  | "boutique"
  | "ads"
  | "stocktake"
  | "ramadan"
  | "payment"

export interface AdminInstagramDesign {
  titleTop: string
  titleBottom: string
  search?: string
  sub?: string
  points?: string[]
  chips?: string[]
  screen?: AdminInstagramScreen
  cards?: Array<{ icon: AdminInstagramIcon; title: string; text: string }>
  kicker?: string
  number?: string
  options?: string[]
  wrong?: string[]
  right?: string[]
  steps?: Array<{ title: string; text: string }>
  scene?: AdminInstagramScene
  cta: string
}

export interface AdminInstagramInsights {
  reach: number
  likes: number
  comments: number
  saved: number
  shares: number
  views: number
}

export interface AdminInstagramPost {
  id: string
  template: AdminInstagramTemplate
  design: AdminInstagramDesign
  caption: string
  hashtags: string[]
  firstComment: string | null
  topic: string | null
  kind: "news" | "tip" | "feature" | "question"
  featureKeys: string[]
  warnings: string[]
  imageUrl: string | null
  status: "draft" | "approved" | "publishing" | "published" | "failed" | "rejected"
  source: "agent" | "manual"
  weekStart: string | null
  scheduledAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  igMediaId: string | null
  permalink: string | null
  publishAttempts: number
  lastError: string | null
  insights: AdminInstagramInsights | null
  createdAt: string
  updatedAt: string
}

export type AdminInstagramPostPatch = Partial<
  Pick<AdminInstagramPost, "template" | "design" | "caption" | "hashtags" | "firstComment">
>

export interface AdminInstagramSettings {
  agentEnabled: boolean
  postsPerWeek: number
  publishDays: number[]
  publishHour: number
}

export interface AdminInstagramStatus {
  connection: {
    connected: boolean
    pageName: string | null
    igUsername: string | null
    igPictureUrl: string | null
    connectedAt: string | null
  }
  settings: AdminInstagramSettings
  lastRun: { weekStart: string; status: string; postsWritten: number; error: string | null } | null
  agentAvailable: boolean
}

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "instagram"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const instagramAdminService = {
  status(): Promise<AdminInstagramStatus> {
    return client.get(`${ENDPOINT}/status`)
  },
  connect(): Promise<{ url: string }> {
    return client.post(`${ENDPOINT}/connect`, {})
  },
  disconnect(): Promise<unknown> {
    return client.post(`${ENDPOINT}/disconnect`, {})
  },
  updateSettings(patch: Partial<AdminInstagramSettings>): Promise<AdminInstagramSettings> {
    return client.patch(`${ENDPOINT}/settings`, patch)
  },
  listPosts(): Promise<{ posts: AdminInstagramPost[] }> {
    return client.get(`${ENDPOINT}/posts`)
  },
  updatePost(id: string, patch: AdminInstagramPostPatch): Promise<AdminInstagramPost> {
    return client.patch(`${ENDPOINT}/posts/${id}`, patch)
  },
  deletePost(id: string): Promise<unknown> {
    return client.delete(`${ENDPOINT}/posts/${id}`)
  },
  uploadImage(id: string, dataBase64: string): Promise<AdminInstagramPost> {
    return client.post(`${ENDPOINT}/posts/${id}/image`, { contentType: "image/jpeg", dataBase64 })
  },
  approve(id: string): Promise<AdminInstagramPost> {
    return client.post(`${ENDPOINT}/posts/${id}/approve`, {})
  },
  approveWeek(weekStart: string): Promise<{ posts: AdminInstagramPost[] }> {
    return client.post(`${ENDPOINT}/approve-week`, { weekStart })
  },
  publishNow(id: string): Promise<AdminInstagramPost> {
    return client.post(`${ENDPOINT}/posts/${id}/publish-now`, {})
  },
  unschedule(id: string): Promise<AdminInstagramPost> {
    return client.post(`${ENDPOINT}/posts/${id}/unschedule`, {})
  },
  reject(id: string): Promise<AdminInstagramPost> {
    return client.post(`${ENDPOINT}/posts/${id}/reject`, {})
  },
  stats(): Promise<{
    posts: AdminInstagramPost[]
    fromInstagram: { signups: number; leads: number }
  }> {
    return client.get(`${ENDPOINT}/stats`)
  },
  runAgent(): Promise<{ started: boolean }> {
    return client.post(`${ENDPOINT}/agent/run`, {})
  },
}
