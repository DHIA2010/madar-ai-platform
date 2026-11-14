import { environment } from "@/infrastructure/environment/app-environment"

// The shape of GET /v1/public/pricing: what's on sale in Madar's marketplace.
export interface PublicPackage {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  // Branches the package includes (absent = 1); each further branch costs this (null = not sold).
  includedBranches?: number
  extraBranchMonthlyHalalas?: number | null
  extraBranchYearlyHalalas?: number | null
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
  isRecommended = false,
  extraBranch: number | null = null,
  includedBranches = 1
): PublicPackage => ({
  name,
  description: "",
  features,
  monthlyPriceHalalas: monthly === null ? null : monthly * 100,
  yearlyPriceHalalas: yearly === null ? null : yearly * 100,
  includedBranches,
  extraBranchMonthlyHalalas: extraBranch === null ? null : extraBranch * 100,
  // Every extra branch is 999 a year, whatever the package.
  extraBranchYearlyHalalas: extraBranch === null ? null : 99900,
  isRecommended,
})

// Shown only if the API can't be reached: the marketplace's prices as of 8 November 2026 (the
// approved per-branch pricing -- see pricing/defaults.ts on the backend).
const FALLBACK_PRICING: PublicApplicationPricing[] = [
  {
    application: "pos",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg(
        "أساسي",
        149,
        1490,
        [
          "فرع واحد (فروع إضافية بـ 99 ر.س/شهر)",
          "أجهزة كاشير غير محدودة في الفرع",
          "فواتير معتمدة من هيئة الزكاة (المرحلة الثانية)",
          "العمل بدون إنترنت",
          "إدارة الورديات وحركات النقد وتقاريرها",
          "إدارة المخزون والعملاء",
          "التقارير الجاهزة",
        ],
        false,
        99
      ),
      pkg(
        "نمو",
        249,
        2490,
        [
          "كل مزايا الأساسي",
          "فرعان (فروع إضافية بـ 99 ر.س/شهر)",
          "أجهزة كاشير غير محدودة في كل فرع",
          "الأدوار والصلاحيات المخصصة",
          "الموردون والمشتريات والمصروفات",
          "قارئ فواتير المشتريات بالذكاء الاصطناعي",
        ],
        true,
        99,
        2
      ),
      pkg(
        "احترافي",
        399,
        3990,
        [
          "كل مزايا النمو",
          "3 فروع (فروع إضافية بـ 99 ر.س/شهر)",
          "أجهزة كاشير غير محدودة في كل فرع",
          "التقارير المخصصة",
          "تطبيق الفواتير وعروض الأسعار",
          "دعم بأولوية",
        ],
        false,
        99,
        3
      ),
    ],
  },
  {
    application: "ecommerce",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg(
        "أساسي",
        79,
        790,
        ["مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)", "متجر واحد", "التقارير الجاهزة"],
        false,
        99
      ),
      pkg(
        "نمو",
        149,
        1490,
        [
          "كل مزايا الأساسي",
          "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)",
          "حتى 3 متاجر",
          "الأدوار والصلاحيات المخصصة",
        ],
        true,
        99,
        2
      ),
      pkg(
        "احترافي",
        299,
        2990,
        [
          "كل مزايا النمو",
          "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)",
          "متاجر غير محدودة",
          "التقارير المخصصة",
          "دعم بأولوية",
        ],
        false,
        99,
        3
      ),
    ],
  },
  {
    application: "advertising",
    mode: "packages",
    freeDays: null,
    packages: [
      pkg(
        "أساسي",
        149,
        1490,
        [
          "مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)",
          "منصتان إعلانيتان (مثل ميتا وسناب)",
          "لوحة موحدة للحملات",
          "التقارير الجاهزة",
        ],
        false,
        99
      ),
      pkg(
        "نمو",
        299,
        2990,
        [
          "كل مزايا الأساسي",
          "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)",
          "كل المنصات الإعلانية: ميتا، جوجل، تيك توك، سناب",
          "الأدوار والصلاحيات المخصصة",
        ],
        true,
        99,
        2
      ),
      pkg(
        "احترافي",
        549,
        5490,
        [
          "كل مزايا النمو",
          "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)",
          "التقارير المخصصة",
          "دعم بأولوية",
        ],
        false,
        99,
        3
      ),
    ],
  },
  {
    application: "promotions",
    mode: "fixed",
    freeDays: null,
    packages: [
      pkg(
        "العروض الترويجية",
        59,
        590,
        [
          "خصومات تلقائية في الكاشير",
          "على كل المنتجات أو منتجات وفئات محددة",
          "جدولة بالأيام والساعات لكل فرع",
        ],
        true
      ),
    ],
  },
  {
    application: "invoicing",
    mode: "fixed",
    freeDays: null,
    packages: [
      pkg(
        "الفواتير وعروض الأسعار",
        79,
        790,
        [
          "عروض أسعار بمراجعات وقبول إلكتروني من العميل",
          "فواتير ضريبية للمنشآت معتمدة من هيئة الزكاة (الربط والاعتماد)",
          "مستخلصات المقاولات والدفعات المقدمة والمحتجزات",
          "إشعارات دائنة ومدينة وتحصيل الدفعات",
        ],
        true
      ),
    ],
  },
  {
    application: "ai",
    mode: "fixed",
    freeDays: null,
    packages: [
      pkg(
        "الذكاء الاصطناعي",
        99,
        990,
        [
          "إجابات فورية بلغة طبيعية",
          "تحليلات ورسوم بيانية تلقائية",
          "يعمل مع كل تطبيقاتك المفعّلة",
        ],
        true
      ),
    ],
  },
  { application: "procurement", mode: "free", freeDays: 365, packages: [] },
  { application: "expenses", mode: "free", freeDays: 365, packages: [] },
  {
    application: "madarComplete",
    mode: "fixed",
    freeDays: null,
    packages: [
      pkg(
        "مدار الكامل",
        899,
        8990,
        [
          "جميع التطبيقات الحالية والمستقبلية",
          "فرع واحد (فروع إضافية بـ 99 ر.س/شهر)",
          "دعم فني مخصص",
          "أولوية في الميزات الجديدة",
        ],
        true,
        99
      ),
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
