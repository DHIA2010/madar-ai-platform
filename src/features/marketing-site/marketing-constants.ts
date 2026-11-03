import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

export const MARKETING_SITE_URL = "https://madar.my"
export const MADAR_APP_URL = "https://app.madar.my"
export const MADAR_CONTACT_EMAIL = "dhiamuhammed@gmail.com"

export const MADAR_REGISTER_URL = `${MADAR_APP_URL}${ROUTES.register}`
export const MADAR_LOGIN_URL = `${MADAR_APP_URL}${ROUTES.login}`

// madar.my and www.madar.my resolve to the same frontend service as app.madar.my (same ALB,
// host-header routed) -- this is the single source of truth for which hostnames get the public
// marketing experience instead of the product. Shared between the root layout (html lang/dir)
// and the root page (marketing homepage vs. redirect into the app).
const MARKETING_HOSTNAMES = new Set(["madar.my", "www.madar.my"])

export function isMarketingHostname(rawHost: string): boolean {
  const host = rawHost.split(":")[0]?.toLowerCase() ?? ""
  return MARKETING_HOSTNAMES.has(host)
}

// Homepage-relative (not bare "#...") so these still resolve from /privacy and /terms too.
export const MARKETING_NAV_LINKS = [
  { label: "الحلول", href: ROUTES.marketing.product },
  { label: "المزايا", href: ROUTES.marketing.features },
  { label: "التكاملات", href: ROUTES.marketing.integrations },
  { label: "الأسعار", href: ROUTES.marketing.pricing },
  { label: "الأسئلة الشائعة", href: ROUTES.marketing.faq },
] as const

export type IntegrationCategory = "stores" | "ads" | "analytics"

export interface IntegrationEntry {
  name: string
  logo: string
  category: IntegrationCategory
  description: string
}

export const INTEGRATION_CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  stores: "متاجر",
  ads: "إعلانات",
  analytics: "التحليلات",
}

export const MARKETING_INTEGRATIONS: IntegrationEntry[] = [
  {
    name: "سلة",
    logo: ASSETS.platforms.salla,
    category: "stores",
    description:
      "المنتجات والطلبات والعملاء تتزامن تلقائيًا، ويمكن تثبيت مدار من متجر تطبيقات سلة.",
  },
  {
    name: "زد",
    logo: ASSETS.platforms.zid,
    category: "stores",
    description: "ربط متجرك على زد بضغطات، ويمكن تثبيت مدار مباشرة من سوق تطبيقات زد.",
  },
  {
    name: "Shopify",
    logo: ASSETS.platforms.shopify,
    category: "stores",
    description: "مزامنة المنتجات والطلبات والعملاء من متجرك على شوبيفاي.",
  },
  {
    name: "Google Ads",
    logo: ASSETS.platforms.googleAds,
    category: "ads",
    description: "أداء الحملات والإنفاق والنقرات والعائد على الإنفاق الإعلاني.",
  },
  {
    name: "Meta",
    logo: ASSETS.platforms.meta,
    category: "ads",
    description: "حملات فيسبوك وإنستغرام وإعلاناتها وأداؤها في مكان واحد.",
  },
  {
    name: "Snapchat",
    logo: ASSETS.platforms.snapchat,
    category: "ads",
    description: "أداء الحملات والمجموعات الإعلانية والإعلانات على سناب شات.",
  },
  {
    name: "TikTok",
    logo: ASSETS.platforms.tiktok,
    category: "ads",
    description: "تحليلات وتقارير حملاتك الإعلانية على تيك توك.",
  },
  {
    name: "Google Analytics",
    logo: ASSETS.platforms.googleAnalytics,
    category: "analytics",
    description: "الزيارات والتفاعل والأحداث والتحويلات في موقعك.",
  },
]
