import { BarChart3, Crown, type LucideIcon, Star, Zap } from "lucide-react"

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

// A single shared icon+color per tier -- used by both the customer-facing activation-request
// dialog and Madar Admin's packages page, so the same tier always looks the same wherever a
// customer or staff member sees it.
export interface PlanTierAccent {
  icon: LucideIcon
  iconWrapperClassName: string
}

export const PLAN_TIER_ACCENT: Record<SubscriptionPlanTier, PlanTierAccent> = {
  enterprise: { icon: Crown, iconWrapperClassName: "bg-orange-50 text-orange-600" },
  pro: { icon: Star, iconWrapperClassName: "bg-violet-50 text-violet-600" },
  growth: { icon: BarChart3, iconWrapperClassName: "bg-emerald-50 text-emerald-600" },
  starter: { icon: Zap, iconWrapperClassName: "bg-blue-50 text-blue-600" },
}

// The feature-comparison matrix behind the "مقارنة الباقات" button -- moved here (rather than kept
// local to Madar Admin's packages page, where it used to live) so the customer-facing activation
// dialog can show the exact same comparison a staff member sees, with no risk of the two drifting
// apart.
export interface PlanComparisonRow {
  label: string
  values: Record<SubscriptionPlanTier, string>
}

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    label: "عدد المتاجر",
    values: { enterprise: "غير محدود", pro: "10", growth: "3", starter: "1" },
  },
  {
    label: "الزوار الشهرون",
    values: { enterprise: "غير محدود", pro: "500,000", growth: "100,000", starter: "10,000" },
  },
  {
    label: "مدة الاحتفاظ بالبيانات",
    values: { enterprise: "12 شهر", pro: "6 أشهر", growth: "3 أشهر", starter: "شهر واحد" },
  },
  { label: "مصادر الإعلانات", values: { enterprise: "✓", pro: "✓", growth: "✓", starter: "—" } },
  {
    label: "أحداث التجارة الإلكترونية",
    values: { enterprise: "✓", pro: "✓", growth: "✓", starter: "—" },
  },
  { label: "تقارير مخصصة", values: { enterprise: "✓", pro: "✓", growth: "—", starter: "—" } },
  { label: "الوصول إلى API", values: { enterprise: "✓", pro: "✓", growth: "—", starter: "—" } },
  {
    label: "الدعم الفني",
    values: {
      enterprise: "مخصص",
      pro: "أولوية",
      growth: "عبر البريد والدردشة",
      starter: "عبر البريد",
    },
  },
]
