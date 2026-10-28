import { PLAN_TIER_ACCENT, PLAN_TIER_META } from "@/features/applications"

import type { MadarPlan, PlanTier, PlatformKey } from "../types"

// Display metadata for the legacy plan tiers (still shown for customers on a tier) and store platforms.
export const PLAN_META: Record<PlanTier, Omit<MadarPlan, "customerCount">> = {
  enterprise: {
    ...PLAN_TIER_META.enterprise,
    icon: PLAN_TIER_ACCENT.enterprise.icon,
    badgeLabel: "مخصصة",
    isActive: true,
    features: [
      { label: "متاجر غير محدودة" },
      { label: "زوار غير محدود" },
      { label: "جميع المميزات" },
      { label: "دعم مخصص" },
    ],
  },
  pro: {
    ...PLAN_TIER_META.pro,
    icon: PLAN_TIER_ACCENT.pro.icon,
    isActive: true,
    features: [
      { label: "10 متاجر" },
      { label: "500,000 زائر شهرياً" },
      { label: "تحليلات متقدمة" },
      { label: "تقارير مخصصة" },
    ],
  },
  growth: {
    ...PLAN_TIER_META.growth,
    icon: PLAN_TIER_ACCENT.growth.icon,
    isActive: true,
    features: [
      { label: "3 متاجر" },
      { label: "100,000 زائر شهرياً" },
      { label: "مصادر الإعلانات" },
      { label: "تقارير أساسية" },
    ],
  },
  starter: {
    ...PLAN_TIER_META.starter,
    icon: PLAN_TIER_ACCENT.starter.icon,
    isActive: true,
    features: [
      { label: "متجر واحد" },
      { label: "10,000 زائر شهرياً" },
      { label: "تقارير أساسية" },
      { label: "دعم عبر البريد" },
    ],
  },
}

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  Salla: "سلة",
  Shopify: "Shopify",
  Zid: "زد",
  WooCommerce: "WooCommerce",
  Other: "منصات أخرى",
}
