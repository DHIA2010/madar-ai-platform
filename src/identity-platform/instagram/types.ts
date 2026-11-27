// Madar's own Instagram posts. A post is one of the three approved square designs (A: photo and
// checklist, B: app screens, C: cards) filled with the agent's words, plus the caption.

export const INSTAGRAM_TEMPLATES = ["a", "b", "c"] as const
export type InstagramTemplate = (typeof INSTAGRAM_TEMPLATES)[number]

// The icons a card (design C) can show.
export const INSTAGRAM_ICONS = [
  "pos",
  "store",
  "ads",
  "booking",
  "inventory",
  "invoice",
  "loyalty",
  "accounting",
  "whatsapp",
  "report",
  "ai",
] as const
export type InstagramIcon = (typeof INSTAGRAM_ICONS)[number]

// The app screen design B puts on the laptop.
export const INSTAGRAM_SCREENS = ["cashier", "products", "close"] as const
export type InstagramScreen = (typeof INSTAGRAM_SCREENS)[number]

export interface InstagramDesign {
  // Two headline lines: the first in white/dark, the second in Madar's colours.
  titleTop: string
  titleBottom: string
  // A: the search-bar line above the headline.
  search?: string
  // B: one line under the headline.
  sub?: string
  // A: 3-4 ticks.
  points?: string[]
  // B: two labels over the screens.
  chips?: string[]
  // B: which app screen.
  screen?: InstagramScreen
  // C: four cards.
  cards?: Array<{ icon: InstagramIcon; title: string; text: string }>
  // The button text.
  cta: string
}

export type InstagramPostStatus =
  | "draft"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "rejected"

export interface InstagramPostRecord {
  id: string
  template: InstagramTemplate
  design: InstagramDesign
  caption: string
  hashtags: string[]
  firstComment: string | null
  topic: string | null
  kind: "news" | "tip" | "feature" | "question"
  featureKeys: string[]
  warnings: string[]
  imageUrl: string | null
  status: InstagramPostStatus
  source: "agent" | "manual"
  weekStart: string | null
  scheduledAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  igMediaId: string | null
  permalink: string | null
  publishAttempts: number
  lastError: string | null
  insights: InstagramInsights | null
  createdAt: string
  updatedAt: string
}

export interface InstagramInsights {
  reach: number
  likes: number
  comments: number
  saved: number
  shares: number
  views: number
}

export interface InstagramSettings {
  agentEnabled: boolean
  postsPerWeek: number
  publishDays: number[]
  publishHour: number
}

export interface InstagramConnection {
  connected: boolean
  pageName: string | null
  igUsername: string | null
  igPictureUrl: string | null
  connectedAt: string | null
}
