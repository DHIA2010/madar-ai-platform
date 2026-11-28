// Madar's own Instagram posts. A post is one of the approved square designs filled with the
// agent's words, plus the caption. All designs share Madar's identity (navy, blue, teal):
// A photo and checklist, B app screens, C cards, D big number, E question, F old way vs Madar,
// G numbered tips, H phone screen, I one bold line, J cinematic scene photo with a headline.

export const INSTAGRAM_TEMPLATES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const
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

// The scene photos design J can use (made once with Figma AI; public/instagram/scenes/).
export const INSTAGRAM_SCENES = [
  "shop-night",
  "cafe-cashier",
  "phone-stock",
  "salon",
  "laundry",
  "online-store",
  "supermarket",
  "boutique",
  "ads",
  "stocktake",
  "ramadan",
  "payment",
] as const
export type InstagramScene = (typeof INSTAGRAM_SCENES)[number]

export interface InstagramDesign {
  // Two headline lines: the first in white/dark, the second in Madar's colours.
  titleTop: string
  titleBottom: string
  // A: the search-bar line above the headline.
  search?: string
  // B, H, I, J: one line under the headline.
  sub?: string
  // A: 3-4 ticks.
  points?: string[]
  // B: two labels over the screens. D: up to four small labels under the number.
  chips?: string[]
  // B: which app screen.
  screen?: InstagramScreen
  // C: four cards.
  cards?: Array<{ icon: InstagramIcon; title: string; text: string }>
  // D, E, G: a small label above the headline.
  kicker?: string
  // D: the big number (or short word).
  number?: string
  // E: four answer choices.
  options?: string[]
  // F: three lines each for the old way and with Madar.
  wrong?: string[]
  right?: string[]
  // G: three numbered tips.
  steps?: Array<{ title: string; text: string }>
  // J: the scene photo.
  scene?: InstagramScene
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
