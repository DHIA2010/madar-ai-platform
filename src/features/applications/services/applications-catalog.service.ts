import {
  BarChart3,
  Calculator,
  CreditCard,
  FileText,
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

// Free 7-day trial bookkeeping -- see command-handlers.ts's startApplicationTrial (backend) for
// the full explanation of why *Enabled is never flipped back off at expiry (a lazy, read-time
// check here and in ai-chat/guards.ts instead of a scheduled job).
export const APPLICATION_TRIAL_ENDS_AT_KEY: Record<
  ApplicationCategoryId,
  keyof OrganizationSettings
> = {
  advertising: "advertisingTrialEndsAt",
  ecommerce: "ecommerceTrialEndsAt",
  pos: "posTrialEndsAt",
  madarApps: "madarAppsTrialEndsAt",
}

export const APPLICATION_TRIAL_USED_KEY: Record<ApplicationCategoryId, keyof OrganizationSettings> =
  {
    advertising: "advertisingTrialUsed",
    ecommerce: "ecommerceTrialUsed",
    pos: "posTrialUsed",
    madarApps: "madarAppsTrialUsed",
  }

// Whether the org can still start a trial for this category -- never used before, and not
// already active/pending. Drives the "تجربة مجانية" button's visibility in
// ActivationRequestDialog.
export function isTrialAvailable(
  category: ApplicationCategoryId,
  settings: OrganizationSettings | undefined,
  pendingApplications?: ReadonlySet<ApplicationCategoryId>
): boolean {
  if (settings?.[APPLICATION_TRIAL_USED_KEY[category]]) return false
  if (settings?.[APPLICATION_SETTINGS_KEY[category]]) return false
  if (pendingApplications?.has(category)) return false
  return true
}

// Whole days left in an active trial (0 on its last day, never negative) -- null when there is no
// active trial. Used to show "متبقي 3 أيام" on a trial-status badge.
export function trialDaysRemaining(
  category: ApplicationCategoryId,
  settings: OrganizationSettings | undefined
): number | null {
  const trialEndsAt = settings?.[APPLICATION_TRIAL_ENDS_AT_KEY[category]] as string | undefined
  if (!trialEndsAt) return null
  const msRemaining = new Date(trialEndsAt).getTime() - Date.now()
  if (msRemaining <= 0) return null
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000))
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
  // تطبيقات مدار -- previously one card showing these 5 as a mini icon-grid; now each is its
  // own full card with the same activate/learn-more buttons as any other application. They
  // share the single "madarApps" category/settings flag (APPLICATION_SETTINGS_KEY below) on
  // purpose: there is no per-item backend subscription unit, so activating any one of the 5
  // submits/approves the shared "madarApps" request and all 5 flip together.
  {
    id: "madar-apps-reports",
    category: "madarApps",
    name: "التقارير",
    shortDescription: "تقارير جاهزة وتحليلات شاملة لأداء أعمالك في مكان واحد.",
    detailDescription:
      "تابع أداء أعمالك عبر تقارير جاهزة ومخصصة تجمع بياناتك من جميع تطبيقات مدار المفعّلة -- المبيعات، الحملات، المتجر، ونقطة البيع -- مع إمكانية التصدير والجدولة الدورية.",
    icon: BarChart3,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "checklist",
    features: [
      { label: "تقارير جاهزة لكل تطبيق مفعّل" },
      { label: "تصدير التقارير بصيغ متعددة" },
      { label: "جدولة تقارير دورية تلقائية" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "madar-apps-expenses",
    category: "madarApps",
    name: "المصروفات",
    shortDescription: "تتبع مصروفات أعمالك وتصنيفها بسهولة في مكان واحد.",
    detailDescription:
      "سجّل مصروفاتك التشغيلية وصنّفها حسب الفئة أو الفرع، وتابع التدفق النقدي لأعمالك بشكل مستمر مع تقارير مصروفات جاهزة لمساعدتك على اتخاذ قرارات مالية أفضل.",
    icon: Wallet,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "checklist",
    features: [
      { label: "تسجيل المصروفات وتصنيفها" },
      { label: "ربط المصروفات بالفروع والفئات" },
      { label: "تقارير مصروفات دورية" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "madar-apps-tasks",
    category: "madarApps",
    name: "المهام",
    shortDescription: "نظّم مهام فريقك وتابع إنجازها أولاً بأول.",
    detailDescription:
      "أنشئ مهامًا لفريقك، وحدد الأولويات والمواعيد النهائية، وتابع حالة الإنجاز لكل مهمة من لوحة واحدة تجمع كل ما يحتاج فريقك للتركيز عليه.",
    icon: ListChecks,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "checklist",
    features: [
      { label: "إنشاء المهام وتوزيعها على الفريق" },
      { label: "تحديد الأولويات والمواعيد النهائية" },
      { label: "متابعة حالة الإنجاز لحظة بلحظة" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "madar-apps-accounting",
    category: "madarApps",
    name: "المحاسبة",
    shortDescription: "إدارة حساباتك المالية وفواتيرك في مكان واحد.",
    detailDescription:
      "تابع القيود المحاسبية والفواتير والموردين والعملاء، وأصدر تقاريرك المالية الدورية -- الأرباح والخسائر، والميزانية العمومية -- بما يتوافق مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA).",
    icon: Calculator,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "checklist",
    features: [
      { label: "إصدار الفواتير والقيود المحاسبية" },
      { label: "متابعة الموردين والعملاء" },
      { label: "تقارير مالية جاهزة (أرباح وخسائر)" },
    ],
    primaryCta: { label: "اشتراك الآن" },
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "madar-apps-documents",
    category: "madarApps",
    name: "المستندات",
    shortDescription: "احفظ مستندات أعمالك ونظّمها في مكان واحد آمن.",
    detailDescription:
      "ارفع مستندات أعمالك المهمة -- العقود، الفواتير، والتراخيص -- ونظّمها في مجلدات، مع إمكانية الوصول إليها ومشاركتها بأمان في أي وقت.",
    icon: FileText,
    accent: {
      iconWrapperClassName: "bg-[#eef2f8] text-[#5b6b85]",
      primaryButtonClassName: "bg-[#0b1738] text-white hover:bg-[#0b1738]/90",
    },
    pricingModel: "paid",
    featuresDisplay: "checklist",
    features: [
      { label: "رفع المستندات وتنظيمها في مجلدات" },
      { label: "مشاركة المستندات بأمان" },
      { label: "بحث سريع ضمن جميع المستندات" },
    ],
    primaryCta: { label: "اشتراك الآن" },
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

// The single place that turns the organization's persisted activation flags (+ any pending
// subscription request) into a per-application status -- used by both the list hook and the
// detail page so they can never disagree about whether a given application is active, pending
// review, or neither. `pendingApplications` is the set of application ids with an unresolved
// (status "pending") SubscriptionActivationRequestDto for this organization.
export function resolveApplicationStatus(
  application: ApplicationDefinition,
  settings: OrganizationSettings | undefined,
  pendingApplications?: ReadonlySet<ApplicationCategoryId>
): ApplicationSubscriptionStatus {
  const trialEndsAt = settings?.[APPLICATION_TRIAL_ENDS_AT_KEY[application.category]] as
    | string
    | undefined
  // A lapsed trial that was never upgraded to a real approval must NOT read as "subscribed" even
  // though *Enabled is still true in storage (see startApplicationTrial's own comment on why it's
  // never flipped back off) -- approveSubscriptionActivationRequest always clears this to "" on a
  // real approval, so a genuinely-paid app is never caught by this check.
  const trialExpired = Boolean(trialEndsAt) && new Date(trialEndsAt!).getTime() <= Date.now()

  if (trialEndsAt && !trialExpired) {
    return "trial"
  }
  if (settings?.[APPLICATION_SETTINGS_KEY[application.category]] && !trialExpired) {
    return "subscribed"
  }
  if (pendingApplications?.has(application.category)) {
    return "pending_review"
  }
  return "not_subscribed"
}
