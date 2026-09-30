import type { SubscriptionPlanTier } from "@/application/contracts"

// The one place tier names/prices are defined -- both the customer-facing activation-request flow
// (this feature) and the Madar Admin packages page (src/features/madar-admin) read from here, so
// the price a customer sees when requesting activation and the price staff see when reviewing/
// managing packages can never silently drift apart. Madar Admin layers its own icon/badge/feature
// list on top of these same name/price facts rather than redefining them.
export interface PlanTierMeta {
  tier: SubscriptionPlanTier
  name: string
  priceLabel: string
  monthlyPrice: number | null
  billingSuffix?: string
}

export const PLAN_TIER_ORDER: SubscriptionPlanTier[] = ["enterprise", "pro", "growth", "starter"]

export const PLAN_TIER_META: Record<SubscriptionPlanTier, PlanTierMeta> = {
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    priceLabel: "تواصل معنا",
    monthlyPrice: null,
    billingSuffix: "سعر مخصص",
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceLabel: "SAR 499",
    monthlyPrice: 499,
    billingSuffix: "شهرياً",
  },
  growth: {
    tier: "growth",
    name: "Growth",
    priceLabel: "SAR 299",
    monthlyPrice: 299,
    billingSuffix: "شهرياً",
  },
  starter: {
    tier: "starter",
    name: "Starter",
    priceLabel: "SAR 99",
    monthlyPrice: 99,
    billingSuffix: "شهرياً",
  },
}
