import type { PurchasableApplication, SubscriptionPlanTier } from "../subscriptions/types"
import type { PackageEntitlements, PricingMode } from "./types"

// Starting pricing, written once per application the first time pricing is read (seed.ts) and
// edited from Madar Admin after that. The November 2026 pricing: per-branch POS packages (one
// branch included, more as an add-on), two months free on yearly. An environment that already had
// pricing got the same figures once through migration 158.

interface DefaultPackage {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  // Branches (workspaces) the package includes (default 1), and each further one; null = not sold.
  includedBranches?: number
  extraBranchMonthlyHalalas?: number | null
  extraBranchYearlyHalalas?: number | null
  // What the package unlocks beyond its app (subscriptions/entitlements.ts).
  entitlements?: PackageEntitlements
  isRecommended: boolean
  legacyPlanTier: SubscriptionPlanTier | null
}

const sar = (amount: number) => amount * 100

// Every app package includes the free WhatsApp daily report. The paid add-on (more numbers and
// sends, subscriptions/addons.ts) is deliberately not mentioned here: it's offered only from
// Settings -> scheduled reports, never while buying an app. Migration 163 added the same line to
// environments that already had pricing.
export const DAILY_REPORT_FEATURE = "التقرير اليومي على واتساب مجانًا (رقم واحد، مرة يوميًا)"

// Every package sells extra branches / workspaces at the same price: 99 a month, 999 a year.
function tier(
  legacyPlanTier: "starter" | "growth" | "pro",
  name: string,
  monthly: number,
  features: string[],
  options: {
    recommended?: boolean
    includedBranches?: number
    entitlements?: PackageEntitlements
    sellsBranches?: boolean
  } = {}
): DefaultPackage {
  const sellsBranches = options.sellsBranches ?? true
  return {
    name,
    description: "",
    features: options.sellsBranches === false ? features : [...features, DAILY_REPORT_FEATURE],
    monthlyPriceHalalas: sar(monthly),
    // Two months free.
    yearlyPriceHalalas: sar(monthly * 10),
    includedBranches: options.includedBranches ?? 1,
    extraBranchMonthlyHalalas: sellsBranches ? sar(99) : null,
    extraBranchYearlyHalalas: sellsBranches ? sar(999) : null,
    entitlements: options.entitlements ?? {},
    isRecommended: options.recommended ?? false,
    legacyPlanTier,
  }
}

const POS_PACKAGES: DefaultPackage[] = [
  tier(
    "starter",
    "أساسي",
    149,
    [
      "فرع واحد (فروع إضافية بـ 99 ر.س/شهر)",
      "أجهزة كاشير غير محدودة في الفرع",
      "فواتير معتمدة من هيئة الزكاة (المرحلة الثانية)",
      "العمل بدون إنترنت",
      "إدارة الورديات وحركات النقد وتقاريرها",
      "إدارة المخزون والعملاء",
      "التقارير الجاهزة",
    ],
    { entitlements: { shiftCash: true } }
  ),
  tier(
    "growth",
    "نمو",
    249,
    [
      "كل مزايا الأساسي",
      "فرعان (فروع إضافية بـ 99 ر.س/شهر)",
      "أجهزة كاشير غير محدودة في كل فرع",
      "الأدوار والصلاحيات المخصصة",
      "الموردون والمشتريات والمصروفات",
      "قارئ فواتير المشتريات بالذكاء الاصطناعي",
    ],
    {
      recommended: true,
      includedBranches: 2,
      entitlements: { invoiceReader: true, shiftCash: true, customRoles: true, procurement: true },
    }
  ),
  tier(
    "pro",
    "احترافي",
    399,
    [
      "كل مزايا النمو",
      "3 فروع (فروع إضافية بـ 99 ر.س/شهر)",
      "أجهزة كاشير غير محدودة في كل فرع",
      "التقارير المخصصة",
      "تطبيق الفواتير وعروض الأسعار",
      "دعم بأولوية",
    ],
    {
      includedBranches: 3,
      entitlements: {
        invoiceReader: true,
        shiftCash: true,
        customRoles: true,
        procurement: true,
        customReports: true,
        invoicing: true,
      },
    }
  ),
]

// Ads and E-commerce sell workspaces the same way POS sells branches (they're the same records).
const ADVERTISING_PACKAGES: DefaultPackage[] = [
  tier(
    "starter",
    "أساسي",
    149,
    [
      "مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)",
      "منصتان إعلانيتان (مثل ميتا وسناب)",
      "لوحة موحدة للحملات",
      "التقارير الجاهزة",
    ],
    { entitlements: { maxAdPlatforms: 2 } }
  ),
  tier(
    "growth",
    "نمو",
    299,
    [
      "كل مزايا الأساسي",
      "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)",
      "كل المنصات الإعلانية: ميتا، جوجل، تيك توك، سناب",
      "الأدوار والصلاحيات المخصصة",
    ],
    { recommended: true, includedBranches: 2, entitlements: { customRoles: true } }
  ),
  tier(
    "pro",
    "احترافي",
    549,
    [
      "كل مزايا النمو",
      "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)",
      "التقارير المخصصة",
      "دعم بأولوية",
    ],
    { includedBranches: 3, entitlements: { customRoles: true, customReports: true } }
  ),
]

const ECOMMERCE_PACKAGES: DefaultPackage[] = [
  tier(
    "starter",
    "أساسي",
    79,
    ["مساحة عمل واحدة (مساحات إضافية بـ 99 ر.س/شهر)", "متجر واحد", "التقارير الجاهزة"],
    { entitlements: { maxStores: 1 } }
  ),
  tier(
    "growth",
    "نمو",
    149,
    [
      "كل مزايا الأساسي",
      "مساحتان عمل (مساحات إضافية بـ 99 ر.س/شهر)",
      "حتى 3 متاجر",
      "الأدوار والصلاحيات المخصصة",
    ],
    { recommended: true, includedBranches: 2, entitlements: { customRoles: true, maxStores: 3 } }
  ),
  tier(
    "pro",
    "احترافي",
    299,
    [
      "كل مزايا النمو",
      "3 مساحات عمل (مساحات إضافية بـ 99 ر.س/شهر)",
      "متاجر غير محدودة",
      "التقارير المخصصة",
      "دعم بأولوية",
    ],
    { includedBranches: 3, entitlements: { customRoles: true, customReports: true } }
  ),
]

// The rest of the apps (supplies, expenses, the retired madarApps card) keep the original
// account-wide tiers until priced on their own, and don't sell branches.
const TIERED_PACKAGES: DefaultPackage[] = [
  tier("starter", "Starter", 99, ["متجر واحد", "تقارير أساسية", "دعم عبر البريد"], {
    sellsBranches: false,
  }),
  tier("growth", "Growth", 299, ["حتى 3 متاجر", "تقارير متقدمة", "دعم أولوية"], {
    recommended: true,
    sellsBranches: false,
  }),
  tier("pro", "Pro", 499, ["حتى 10 متاجر", "جميع المزايا", "دعم مخصص"], {
    sellsBranches: false,
  }),
]

const single = (name: string, monthly: number, features: string[]): DefaultPackage => ({
  ...tier("starter", name, monthly, features, { recommended: true, sellsBranches: false }),
})

export function defaultPricingFor(application: PurchasableApplication): {
  mode: PricingMode
  packages: DefaultPackage[]
} {
  switch (application) {
    case "pos":
      return { mode: "packages", packages: POS_PACKAGES }
    case "advertising":
      return { mode: "packages", packages: ADVERTISING_PACKAGES }
    case "ecommerce":
      return { mode: "packages", packages: ECOMMERCE_PACKAGES }
    case "promotions":
      return {
        mode: "fixed",
        packages: [
          single("العروض الترويجية", 59, [
            "خصومات تلقائية في الكاشير",
            "على كل المنتجات أو منتجات وفئات محددة",
            "جدولة بالأيام والساعات لكل فرع",
          ]),
        ],
      }
    case "invoicing":
      return {
        mode: "fixed",
        packages: [
          single("الفواتير وعروض الأسعار", 79, [
            "عروض أسعار بمراجعات وقبول إلكتروني من العميل",
            "فواتير ضريبية للمنشآت معتمدة من هيئة الزكاة (الربط والاعتماد)",
            "مستخلصات المقاولات والدفعات المقدمة والمحتجزات",
            "إشعارات دائنة ومدينة وتحصيل الدفعات",
          ]),
        ],
      }
    case "customReports":
      return {
        mode: "fixed",
        packages: [
          single("التقارير المخصصة", 79, [
            "منشئ تقارير بالحقول والفلاتر",
            "حفظ التقارير ومشاركتها",
            "تصدير التقارير",
          ]),
        ],
      }
    case "ai":
      return {
        mode: "fixed",
        packages: [
          {
            ...single("الذكاء الاصطناعي", 99, [
              "إجابات فورية بلغة طبيعية",
              "تحليلات ورسوم بيانية تلقائية",
              "يعمل مع كل تطبيقاتك المفعّلة",
            ]),
            legacyPlanTier: null,
          },
        ],
      }
    case "madarComplete":
      return {
        mode: "fixed",
        packages: [
          {
            name: "مدار الكامل",
            description: "جميع تطبيقات مدار في اشتراك واحد",
            features: [
              "جميع التطبيقات الحالية والمستقبلية",
              "فرع واحد (فروع إضافية بـ 99 ر.س/شهر)",
              "دعم فني مخصص",
              "أولوية في الميزات الجديدة",
              DAILY_REPORT_FEATURE,
            ],
            monthlyPriceHalalas: sar(899),
            yearlyPriceHalalas: sar(8990),
            extraBranchMonthlyHalalas: sar(99),
            extraBranchYearlyHalalas: sar(999),
            entitlements: {
              invoiceReader: true,
              shiftCash: true,
              customRoles: true,
              procurement: true,
              customReports: true,
              invoicing: true,
            },
            isRecommended: true,
            legacyPlanTier: null,
          },
        ],
      }
    default:
      return { mode: "packages", packages: TIERED_PACKAGES }
  }
}
