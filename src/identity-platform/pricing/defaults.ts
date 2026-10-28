import type { PurchasableApplication, SubscriptionPlanTier } from "../subscriptions/types"
import type { PricingMode } from "./types"

// Starting pricing, written once per application the first time pricing is read (seed.ts) and
// edited from Madar Admin after that. Mirrors what customers were charged before per-app pricing
// existed: the same account-wide Starter / Growth / Pro tiers, monthly, for every application --
// with Starter at its real 99 SAR (it had been lowered to 1 SAR to test live checkout).

interface DefaultPackage {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  isRecommended: boolean
  legacyPlanTier: SubscriptionPlanTier | null
}

const TIERED_PACKAGES: DefaultPackage[] = [
  {
    name: "Starter",
    description: "للبداية والمتاجر الصغيرة",
    features: ["متجر واحد", "تقارير أساسية", "دعم عبر البريد"],
    monthlyPriceHalalas: 9900,
    yearlyPriceHalalas: null,
    isRecommended: false,
    legacyPlanTier: "starter",
  },
  {
    name: "Growth",
    description: "للأعمال النامية",
    features: ["حتى 3 متاجر", "تقارير متقدمة", "دعم أولوية"],
    monthlyPriceHalalas: 29900,
    yearlyPriceHalalas: null,
    isRecommended: true,
    legacyPlanTier: "growth",
  },
  {
    name: "Pro",
    description: "للأعمال الكبيرة",
    features: ["حتى 10 متاجر", "جميع المزايا", "دعم مخصص"],
    monthlyPriceHalalas: 49900,
    yearlyPriceHalalas: null,
    isRecommended: false,
    legacyPlanTier: "pro",
  },
]

export function defaultPricingFor(application: PurchasableApplication): {
  mode: PricingMode
  packages: DefaultPackage[]
} {
  if (application === "madarComplete") {
    // No price had ever been set for the bundle -- it starts as "contact us" until one is.
    return {
      mode: "contact",
      packages: [
        {
          name: "مدار الكامل",
          description: "جميع تطبيقات مدار في اشتراك واحد",
          features: [
            "جميع التطبيقات الحالية والمستقبلية",
            "دعم فني مخصص",
            "أولوية في الميزات الجديدة",
          ],
          monthlyPriceHalalas: null,
          yearlyPriceHalalas: null,
          isRecommended: false,
          legacyPlanTier: null,
        },
      ],
    }
  }
  return { mode: "packages", packages: TIERED_PACKAGES }
}
