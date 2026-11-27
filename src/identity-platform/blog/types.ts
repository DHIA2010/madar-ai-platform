// Madar's blog, as the backend keeps it. The shapes match the website's posts.ts so an article
// from the database renders exactly like one written in the code.

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "callout"; tone: "tip" | "note"; title: string; text: string }
  | { type: "formula"; label: string; formula: string; example: string }

export const BLOG_CATEGORIES = [
  "campaigns",
  "invoicing",
  "ecommerce",
  "inventory",
  "pos",
  "booking",
] as const
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

// Which Madar app an article's buttons point to.
export const BLOG_CTA_APPS = [
  "pos",
  "ecommerce",
  "campaigns",
  "invoicing",
  "inventory",
  "booking",
  "loyalty",
  "accounting",
  "complete",
] as const
export type BlogCtaApp = (typeof BLOG_CTA_APPS)[number]

export type BlogPostKind = "news" | "guide"
export type BlogPostStatus = "draft" | "approved" | "rejected"

export interface BlogFaq {
  question: string
  answer: string
}

export interface BlogPostRecord {
  id: string
  slug: string
  title: string
  excerpt: string
  category: BlogCategory
  body: BlogBlock[]
  faq: BlogFaq[]
  seoTitle: string | null
  seoDescription: string | null
  keywords: string[]
  ctaApp: BlogCtaApp | null
  kind: BlogPostKind
  featureKeys: string[]
  // Things a person should look at before approving (a price the agent wasn't given, …).
  warnings: string[]
  status: BlogPostStatus
  source: "agent" | "manual"
  weekStart: string | null
  // When it goes out (approved) -- or went out, once this has passed.
  scheduledAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
  updatedAt: string
}

// What the website gets: only articles that are out.
export interface PublicBlogPost {
  slug: string
  title: string
  excerpt: string
  category: BlogCategory
  publishedAt: string
  body: BlogBlock[]
  faq: BlogFaq[]
  seoTitle: string | null
  seoDescription: string | null
  keywords: string[]
  ctaApp: BlogCtaApp | null
}

export interface BlogSettings {
  agentEnabled: boolean
  postsPerWeek: number
  // 0 = Sunday … 6 = Saturday, Riyadh time.
  publishDays: number[]
  // Riyadh hour, 0-23.
  publishHour: number
}

export const BLOG_EVENTS = [
  "view",
  "read_25",
  "read_50",
  "read_75",
  "read_100",
  "cta_click",
  "lead",
] as const
export type BlogEvent = (typeof BLOG_EVENTS)[number]
