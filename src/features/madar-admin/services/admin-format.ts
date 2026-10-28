import type { PlatformKey } from "../types"
import type {
  AdminStorePlatform,
  AdminSubscriptionView,
  SubscriptionSource,
} from "../types/platform-admin.types"

import type { PurchasableApplication } from "@/application/contracts"

// Shared display helpers for the Madar Admin pages backed by /v1/platform-admin/*. The console is
// Arabic-only (hardcoded strings, no i18n), same as every other page in it.

export const APPLICATION_LABEL: Record<PurchasableApplication, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار",
  procurement: "الموردون والمشتريات",
  expenses: "المصروفات",
  ai: "الذكاء الاصطناعي",
  customReports: "التقارير المخصصة",
  madarComplete: "مدار الكامل",
}

export const BILLING_INTERVAL_LABEL = { monthly: "شهري", yearly: "سنوي" } as const

// "Growth · شهري", the package name when there is one, else the legacy tier's.
export function packageLabel(input: {
  packageName: string | null
  planTier: string | null
  billingInterval: "monthly" | "yearly" | null
}): string {
  const name =
    input.packageName ||
    (input.planTier ? input.planTier[0].toUpperCase() + input.planTier.slice(1) : null)
  if (!name) return "—"
  return input.billingInterval ? `${name} · ${BILLING_INTERVAL_LABEL[input.billingInterval]}` : name
}

export const SOURCE_LABEL: Record<SubscriptionSource, string> = {
  trial: "تجربة مجانية",
  payment: "دفع إلكتروني",
  bank_transfer: "تحويل بنكي",
  admin: "من إدارة مدار",
  existing: "مفعّل سابقاً",
  free: "مجاني",
}

export const STORE_PLATFORM_KEY: Record<AdminStorePlatform, PlatformKey> = {
  salla: "Salla",
  zid: "Zid",
  shopify: "Shopify",
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mada: "مدى",
  visa: "Visa",
  master: "Mastercard",
  mastercard: "Mastercard",
  amex: "American Express",
  bank_transfer: "تحويل بنكي",
}

export function paymentMethodLabel(method: string | null): string {
  if (!method) return "—"
  return PAYMENT_METHOD_LABEL[method.toLowerCase()] ?? method
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// Halalas -> "SAR 1,234" (whole riyals unless there's a fraction to show).
export function formatSar(halalas: number | null): string {
  if (halalas === null) return "—"
  const riyals = halalas / 100
  return `SAR ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(riyals) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(riyals)}`
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const diffSeconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 86400],
    ["month", 30 * 86400],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ]
  const formatter = new Intl.RelativeTimeFormat("ar", { numeric: "auto" })
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit)
    }
  }
  return "الآن"
}

// The date a subscription next needs attention: its trial end, or its paid period's end.
export function nextRenewalDate(subscription: AdminSubscriptionView): string | null {
  if (subscription.status === "trial" || subscription.status === "expired") {
    return subscription.trialEndsAt ?? subscription.currentPeriodEnd
  }
  if (subscription.status === "cancelled") return null
  return subscription.currentPeriodEnd
}

// A subscription recorded from an app that was already on before subscriptions were tracked
// ("existing") has no real start date -- show nothing rather than the day it was recorded.
export function knownStartDate(subscription: AdminSubscriptionView): string | null {
  return subscription.source === "existing" ? null : subscription.startedAt
}

export const PROVIDER_LABEL: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  snapchat_ads: "Snapchat Ads",
  tiktok_ads: "TikTok Ads",
  google_analytics: "Google Analytics",
  salla: "سلة",
  zid: "زد",
  shopify: "Shopify",
}

export const CONNECTION_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  connected: { label: "متصل", className: "bg-emerald-50 text-emerald-600" },
  pending: { label: "قيد الإعداد", className: "bg-slate-100 text-slate-600" },
  paused: { label: "متوقف مؤقتاً", className: "bg-amber-50 text-amber-600" },
  disconnected: { label: "مفصول", className: "bg-slate-100 text-slate-500" },
  error: { label: "خطأ", className: "bg-rose-50 text-rose-600" },
}

export const SYNC_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  completed: { label: "ناجحة", className: "bg-emerald-50 text-emerald-600" },
  failed: { label: "فاشلة", className: "bg-rose-50 text-rose-600" },
  running: { label: "قيد التشغيل", className: "bg-blue-50 text-blue-600" },
  pending: { label: "بالانتظار", className: "bg-slate-100 text-slate-600" },
}

export const STAFF_ROLE_LABEL: Record<string, string> = {
  super_admin: "مدير عام",
  operations: "العمليات",
  finance: "المالية",
  support: "الدعم",
}

export const PLATFORM_PERMISSION_LABEL: Record<string, string> = {
  "customers:view": "عرض العملاء والاشتراكات",
  "subscriptions:manage": "إدارة الاشتراكات",
  "requests:manage": "مراجعة طلبات الاشتراك",
  "pricing:manage": "إدارة الباقات والأسعار",
  "coupons:manage": "إدارة الكوبونات",
  "billing:view": "المدفوعات والفواتير",
  "operations:view": "المتاجر والتكاملات والتتبع وحالة النظام",
  "flags:manage": "Feature Flags",
  "settings:manage": "إعدادات المنصة",
  "staff:manage": "إدارة فريق مدار",
}

// Short Arabic descriptions of the audit actions the overview's "latest activity" shows.
export const ACTIVITY_LABEL: Record<string, string> = {
  "platform_admin.subscription_granted": "تفعيل اشتراك من إدارة مدار",
  "platform_admin.subscription_renewed": "تجديد اشتراك يدوي",
  "platform_admin.subscription_cancelled": "إلغاء اشتراك",
  "platform_admin.package_created": "إضافة باقة",
  "platform_admin.package_updated": "تعديل باقة",
  "platform_admin.package_deleted": "حذف باقة",
  "platform_admin.pricing_mode_changed": "تغيير طريقة بيع تطبيق",
  "platform_admin.coupon_created": "إنشاء كوبون",
  "platform_admin.coupon_updated": "تعديل كوبون",
  "platform_admin.coupon_deleted": "حذف كوبون",
  "platform_admin.settings_updated": "تعديل إعدادات المنصة",
  "platform_admin.staff_added": "إضافة عضو لفريق مدار",
  "platform_admin.staff_updated": "تعديل عضو في فريق مدار",
  "platform_admin.flag_created": "إضافة Feature Flag",
  "platform_admin.flag_updated": "تعديل Feature Flag",
  "billing.moyasar_payment_confirmed": "دفعة ناجحة بالبطاقة",
  "billing.subscription_expired": "انتهاء اشتراك لعدم التجديد",
  "subscription_request.created": "طلب اشتراك جديد",
  "subscription_request.approved": "الموافقة على طلب اشتراك",
  "subscription_request.rejected": "رفض طلب اشتراك",
  "application_trial.started": "بدء تجربة مجانية",
}
