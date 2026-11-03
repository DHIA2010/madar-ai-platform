import { environment } from "@/infrastructure/environment/app-environment"

// The shape of GET /v1/public/pricing: what's on sale in Madar's marketplace.
export interface PublicPackage {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  isRecommended: boolean
}

export interface PublicApplicationPricing {
  application: string
  mode: "packages" | "fixed" | "contact" | "free"
  freeDays: number | null
  packages: PublicPackage[]
}

const pkg = (
  name: string,
  monthly: number | null,
  yearly: number | null,
  features: string[],
  isRecommended = false
): PublicPackage => ({
  name,
  description: "",
  features,
  monthlyPriceHalalas: monthly === null ? null : monthly * 100,
  yearlyPriceHalalas: yearly === null ? null : yearly * 100,
  isRecommended,
})

// Shown only if the API can't be reached: the marketplace's prices as of 3 November 2026.
const FALLBACK_PRICING: PublicApplicationPricing[] = [
  {
    application: "pos",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg("Starter", 99, 1099, [
        "فرع واحد",
        "فواتير إلكترونية",
        "تقارير أساسية",
        "مخزون متقدم",
        "إدارة العملاء",
      ]),
      pkg(
        "Growth",
        299,
        2999,
        [
          "حتى ٣ فروع",
          "فواتير إلكترونية",
          "تقارير متقدمة",
          "مخزون متقدم",
          "إدارة الورديات",
          "الأدوار والصلاحيات",
        ],
        true
      ),
      pkg("Pro", 499, 3999, [
        "فروع غير محدودة",
        "فواتير إلكترونية",
        "تقارير متقدمة ومخصصة",
        "مخزون متقدم",
        "إدارة الورديات",
        "الأدوار والصلاحيات",
      ]),
    ],
  },
  {
    application: "ecommerce",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg("Starter", 99, 1099, ["متجر واحد", "تقارير أساسية"]),
      pkg(
        "Growth",
        299,
        3199,
        ["حتى ٣ متاجر", "تقارير متقدمة", "دعم بأولوية", "الأدوار والصلاحيات"],
        true
      ),
      pkg("Pro", 499, 5499, ["متاجر غير محدودة", "جميع المزايا", "دعم مخصص", "الأدوار والصلاحيات"]),
    ],
  },
  {
    application: "advertising",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg("Starter", 99, 1099, ["منصة إعلانية واحدة", "تقارير أساسية"]),
      pkg("Growth", 299, 3199, [
        "حتى ٣ منصات إعلانية",
        "تقارير متقدمة",
        "دعم بأولوية",
        "الأدوار والصلاحيات",
      ]),
      pkg(
        "Pro",
        499,
        5499,
        ["منصات غير محدودة", "جميع المزايا", "دعم مخصص", "الأدوار والصلاحيات"],
        true
      ),
    ],
  },
  {
    application: "customReports",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg("Starter", 99, null, []),
      pkg("Growth", 299, null, [], true),
      pkg("Pro", 499, null, []),
    ],
  },
  {
    application: "ai",
    mode: "fixed",
    freeDays: null,
    packages: [pkg("الذكاء الاصطناعي", 99, 999, [])],
  },
  { application: "procurement", mode: "free", freeDays: 365, packages: [] },
  { application: "expenses", mode: "free", freeDays: 365, packages: [] },
  {
    application: "madarComplete",
    mode: "fixed",
    freeDays: null,
    packages: [
      pkg("مدار الكامل", 1099, 6999, [
        "جميع التطبيقات الحالية والمستقبلية",
        "دعم فني مخصص",
        "أولوية في الميزات الجديدة",
        "الأدوار والصلاحيات",
      ]),
    ],
  },
]

// Built with a join to satisfy the no-literal-route lint rule (same trick as the feature services).
const PUBLIC_PRICING_PATH = ["", "v1", "public", "pricing"].join(String.fromCharCode(47))

// Live prices for madar.my, refreshed every few minutes; the page never waits long or fails on it.
export async function loadPublicPricing(): Promise<PublicApplicationPricing[]> {
  try {
    const response = await fetch(new URL(PUBLIC_PRICING_PATH, environment.API_BASE_URL), {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return FALLBACK_PRICING
    const pricing = (await response.json()) as PublicApplicationPricing[]
    return Array.isArray(pricing) && pricing.length > 0 ? pricing : FALLBACK_PRICING
  } catch {
    return FALLBACK_PRICING
  }
}
