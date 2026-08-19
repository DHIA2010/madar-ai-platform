import { ROUTES } from "@/constants/routes"

export const MARKETING_SITE_URL = "https://madar.my"
export const MADAR_APP_URL = "https://app.madar.my"
export const MADAR_CONTACT_EMAIL = "dhiamuhammed@gmail.com"

// madar.my and www.madar.my resolve to the same frontend service as app.madar.my (same ALB,
// host-header routed) -- this is the single source of truth for which hostnames get the public
// marketing experience instead of the product. Shared between the root layout (html lang/dir)
// and the root page (marketing homepage vs. redirect into the app).
const MARKETING_HOSTNAMES = new Set(["madar.my", "www.madar.my"])

export function isMarketingHostname(rawHost: string): boolean {
  const host = rawHost.split(":")[0]?.toLowerCase() ?? ""
  return MARKETING_HOSTNAMES.has(host)
}

// Homepage-relative (not bare "#...") so these still resolve correctly from other pages
// like /privacy and /terms, not only when already on "/".
export const MARKETING_NAV_LINKS = [
  { label: "Product", href: ROUTES.marketing.product },
  { label: "Integrations", href: ROUTES.marketing.integrations },
  { label: "How It Works", href: ROUTES.marketing.howItWorks },
  { label: "About", href: ROUTES.marketing.about },
] as const

export type IntegrationStatus = "Available" | "In Development" | "Coming Soon"

export interface IntegrationEntry {
  name: string
  status: IntegrationStatus
  description: string
}

export const MARKETING_INTEGRATIONS: IntegrationEntry[] = [
  {
    name: "Google Ads",
    status: "Available",
    description: "Campaign and account-level advertising performance.",
  },
  {
    name: "Meta Ads",
    status: "Available",
    description: "Facebook and Instagram campaign, ad, and performance data.",
  },
  {
    name: "Snapchat Ads",
    status: "Available",
    description: "Campaign, ad squad, and ad-level performance data.",
  },
  {
    name: "Google Analytics",
    status: "Available",
    description: "Traffic, engagement, events, and conversion data.",
  },
  {
    name: "Salla",
    status: "Available",
    description: "Store, product, order, and customer data.",
  },
  {
    name: "Shopify",
    status: "Available",
    description: "Store, product, order, and customer data.",
  },
  {
    name: "TikTok Ads",
    status: "Available",
    description: "TikTok advertising campaign analytics and reporting.",
  },
  {
    name: "Zid",
    status: "Available",
    description: "Store, product, order, and customer data.",
  },
]
