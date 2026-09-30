import {
  BarChart3,
  Blocks,
  CreditCard,
  FileText,
  Link2,
  ListChecks,
  Radio,
  ShoppingBag,
  Wallet,
} from "lucide-react"

import type { OrganizationSettings } from "@/features/workspace"

import type {
  ApplicationCatalogEntry,
  ApplicationCategoryId,
  ApplicationDefinition,
  ApplicationSubscriptionStatus,
  MadarCompleteBundle,
} from "../types"

// Maps each application to the boolean flag that persists its activation state on the
// organization (see OrganizationSettings in @/features/workspace/types) -- the single source of
// truth both the sidebar filter and this feature's own activate/deactivate calls read/write.
export const APPLICATION_SETTINGS_KEY: Record<ApplicationCategoryId, keyof OrganizationSettings> = {
  advertising: "advertisingEnabled",
  ecommerce: "ecommerceEnabled",
  pos: "posEnabled",
  madarApps: "madarAppsEnabled",
}

// Static, hand-authored catalog for this UI-only pass -- no fetch, no async, no command/query
// layer. This is deliberately the ONE place that will need to change when a real
// subscriptions/applications backend lands; nothing in components/ or hooks/ should reach past
// this file to know the data is local.
export const APPLICATION_CATALOG: ApplicationDefinition[] = [
  {
    id: "advertising-campaigns",
    category: "advertising",
    name: "الحملات الإعلانية",
    shortDescription: "تحليل أداء حملاتك الإعلانية واتخاذ قرارات مبنية على بيانات دقيقة.",
    detailDescription:
      "اربط منصات الإعلانات الرقمية الرئيسية وتابع أداء حملاتك من مكان واحد -- التحويلات، العائد على الإنفاق الإعلاني (ROAS)، تكلفة اكتساب العميل (CAC)، والإسناد عبر القنوات -- مع تقارير جاهزة وتوصيات مبنية على أرقامك الفعلية.",
    icon: Radio,
    accent: {
      iconWrapperClassName: "bg-[#eef4ff] text-[#2878ff]",
      primaryButtonClassName: "bg-[#2878ff] text-white hover:bg-[#1f66e0]",
    },
    pricingModel: "paid",
    priceLabel: "يبدأ من 129 ر.س / شهر",
    featuresDisplay: "checklist",
    features: [
      { label: "ربط منصات الإعلانات (Google، Meta، Snapchat، TikTok)" },
      { label: "تحليل الأداء وعائد الإنفاق الإعلاني (ROAS)" },
      { label: "تقارير مخصصة لكل حملة" },
      { label: "مقارنات بين المنصات والحملات" },
      { label: "توصيات مبنية على بيانات أدائك" },
    ],
    primaryCta: { label: "تفعيل التطبيق" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "ecommerce",
    category: "ecommerce",
    name: "المتاجر الإلكترونية",
    shortDescription: "اربط متجرك الإلكتروني مع أنظمة الإعلانات والتحليلات وتابع رحلة عميلك كاملة.",
    detailDescription:
      "اربط متجرك على سلة أو زد أو Shopify أو WooCommerce وتابع مبيعاتك ومنتجاتك وعملاءك وزوارك المباشرين من مكان واحد، مع تتبع دقيق للتحويلات عبر UTM ومعرّفات النقر (Click IDs) لكل حملة تصل منها زيارة.",
    icon: ShoppingBag,
    accent: {
      iconWrapperClassName: "bg-[#f5f0ff] text-[#7c4dff]",
      primaryButtonClassName: "bg-[#7c4dff] text-white hover:bg-[#6a3ce0]",
    },
    pricingModel: "paid",
    priceLabel: "يبدأ من 129 ر.س / شهر",
    featuresDisplay: "checklist",
    features: [
      { label: "ربط المتاجر (سلة، زد، Shopify وغيرها)" },
      { label: "تتبع المنتجات والطلبات" },
      { label: "تحليل المبيعات والتحويلات" },
      { label: "الزوار المباشرون على المتجر" },
      { label: "ربط مع الإعلانات (UTM / Click IDs)" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "pos",
    category: "pos",
    name: "نقطة البيع",
    shortDescription: "نظام كاشير متكامل لإدارة مبيعاتك وفروعك بكل سهولة.",
    detailDescription:
      "نظام نقطة بيع متكامل يدير الكاشير والمخزون والفواتير والورديات والموردين، متوافق مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) للفوترة الإلكترونية، مصمم لإدارة فرع واحد أو عدة فروع من مكان واحد.",
    icon: CreditCard,
    accent: {
      iconWrapperClassName: "bg-[#fff2e8] text-[#ff7a3d]",
      primaryButtonClassName: "bg-[#ff7a3d] text-white hover:bg-[#e8672e]",
    },
    pricingModel: "paid",
    priceLabel: "يبدأ من 149 ر.س / شهر",
    featuresDisplay: "checklist",
    features: [
      { label: "إدارة المنتجات والمخزون" },
      { label: "إدارة المبيعات والفواتير" },
      { label: "إدارة العملاء والولاء" },
      { label: "إدارة الفروع والموظفين" },
      { label: "متوافق مع متطلبات هيئة الزكاة (ZATCA)" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "madar-apps",
    category: "madarApps",
    name: "تطبيقات مدار",
    shortDescription: "مجموعة تطبيقات مساعدة لإدارة أعمالك بكفاءة أكبر.",
    detailDescription:
      "مجموعة من تطبيقات مدار الداخلية لإدارة أعمالك اليومية -- التقارير، المصروفات، المهام، التكاملات، والمستندات -- مع المزيد من التطبيقات قيد الإضافة باستمرار. تفتح هذه الصفحة تفاصيل كل تطبيق ضمن المجموعة.",
    icon: Blocks,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "iconGrid",
    features: [
      { label: "التقارير", icon: BarChart3 },
      { label: "المصروفات", icon: Wallet },
      { label: "المهام", icon: ListChecks },
      { label: "التكاملات", icon: Link2 },
      { label: "المستندات", icon: FileText },
    ],
    // تطبيقات مدار never gets a direct subscribe action on its card -- only "معرفة المزيد".
    primaryCta: { label: null },
    subscriptionStatus: "not_subscribed",
  },
]

export const MADAR_COMPLETE_BUNDLE: MadarCompleteBundle = {
  id: "madar-complete",
  name: "مدار الكامل",
  badgeLabel: "الأكثر توفيراً",
  description: "احصل على جميع تطبيقات مدار الحالية والمستقبلية في اشتراك واحد وبسعر أفضل.",
  benefits: [
    "جميع المزايا الحالية والمستقبلية",
    "مساحات عمل مستقلة لكل تطبيق",
    "دعم فني مخصص",
    "أولوية في الميزات الجديدة",
  ],
  primaryCtaLabel: "الاشتراك في مدار الكامل",
  secondaryCtaLabel: "معرفة المزيد",
}

export function getApplicationById(id: string): ApplicationCatalogEntry | undefined {
  if (id === MADAR_COMPLETE_BUNDLE.id) {
    return MADAR_COMPLETE_BUNDLE
  }
  return APPLICATION_CATALOG.find((application) => application.id === id)
}

// The single place that turns the organization's persisted activation flags into a per-application
// status -- used by both the list hook and the detail page so they can never disagree about
// whether a given application is currently active.
export function resolveApplicationStatus(
  application: ApplicationDefinition,
  settings: OrganizationSettings | undefined
): ApplicationSubscriptionStatus {
  return settings?.[APPLICATION_SETTINGS_KEY[application.category]]
    ? "subscribed"
    : "not_subscribed"
}
