import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Madar Admin → المدونة: the blog's drafts, approval, schedule, results and the writing agent.

export type AdminBlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "callout"; tone: "tip" | "note"; title: string; text: string }
  | { type: "formula"; label: string; formula: string; example: string }

export type AdminBlogCategory =
  | "campaigns"
  | "invoicing"
  | "ecommerce"
  | "inventory"
  | "pos"
  | "booking"
export type AdminBlogCtaApp =
  | "pos"
  | "ecommerce"
  | "campaigns"
  | "invoicing"
  | "inventory"
  | "booking"
  | "loyalty"
  | "accounting"
  | "complete"

export interface AdminBlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: AdminBlogCategory
  body: AdminBlogBlock[]
  faq: Array<{ question: string; answer: string }>
  seoTitle: string | null
  seoDescription: string | null
  keywords: string[]
  ctaApp: AdminBlogCtaApp | null
  kind: "news" | "guide"
  featureKeys: string[]
  warnings: string[]
  status: "draft" | "approved" | "rejected"
  source: "agent" | "manual"
  weekStart: string | null
  scheduledAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AdminBlogPostPatch = Partial<
  Pick<
    AdminBlogPost,
    | "slug"
    | "title"
    | "excerpt"
    | "category"
    | "body"
    | "faq"
    | "seoTitle"
    | "seoDescription"
    | "keywords"
    | "ctaApp"
  >
>

export interface AdminBlogSettings {
  agentEnabled: boolean
  postsPerWeek: number
  publishDays: number[]
  publishHour: number
}

export interface AdminBlogSettingsResponse {
  settings: AdminBlogSettings
  lastRun: {
    weekStart: string
    status: string
    postsWritten: number
    error: string | null
    finishedAt: string | null
  } | null
  agentAvailable: boolean
}

export interface AdminBlogStats {
  slug: string
  title: string
  views: number
  visitors: number
  fromGoogle: number
  read50: number
  read100: number
  ctaClicks: number
  leads: number
  signups: number
  customers: number
  ctaBreakdown: Record<string, number>
  daily: Array<{ day: string; views: number }>
}

const PATH_SEPARATOR = String.fromCharCode(47)
const ENDPOINT = ["", "v1", "platform-admin", "blog"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const blogAdminService = {
  listPosts(): Promise<{ posts: AdminBlogPost[] }> {
    return client.get(`${ENDPOINT}/posts`)
  },
  updatePost(id: string, patch: AdminBlogPostPatch): Promise<AdminBlogPost> {
    return client.patch(`${ENDPOINT}/posts/${id}`, patch)
  },
  deletePost(id: string): Promise<unknown> {
    return client.delete(`${ENDPOINT}/posts/${id}`)
  },
  approve(id: string): Promise<AdminBlogPost> {
    return client.post(`${ENDPOINT}/posts/${id}/approve`, {})
  },
  approveWeek(weekStart: string): Promise<{ posts: AdminBlogPost[] }> {
    return client.post(`${ENDPOINT}/approve-week`, { weekStart })
  },
  publishNow(id: string): Promise<AdminBlogPost> {
    return client.post(`${ENDPOINT}/posts/${id}/publish-now`, {})
  },
  unschedule(id: string): Promise<AdminBlogPost> {
    return client.post(`${ENDPOINT}/posts/${id}/unschedule`, {})
  },
  reject(id: string): Promise<AdminBlogPost> {
    return client.post(`${ENDPOINT}/posts/${id}/reject`, {})
  },
  getSettings(): Promise<AdminBlogSettingsResponse> {
    return client.get(`${ENDPOINT}/settings`)
  },
  updateSettings(patch: Partial<AdminBlogSettings>): Promise<AdminBlogSettings> {
    return client.patch(`${ENDPOINT}/settings`, patch)
  },
  stats(days: number): Promise<{ days: number; stats: AdminBlogStats[] }> {
    return client.get(`${ENDPOINT}/stats?days=${days}`)
  },
  runAgent(): Promise<{ started: boolean }> {
    return client.post(`${ENDPOINT}/agent/run`, {})
  },
}
