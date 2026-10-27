import type { PlatformKey } from "../types"
import type {
  AdminStorePlatform,
  AdminSubscriptionView,
  SubscriptionSource,
} from "../types/platform-admin.types"

import type { SubscriptionApplication } from "@/application/contracts"

// Shared display helpers for the Madar Admin pages backed by /v1/platform-admin/*. The console is
// Arabic-only (hardcoded strings, no i18n), same as every other page in it.

export const APPLICATION_LABEL: Record<SubscriptionApplication, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار",
  procurement: "الموردون والمشتريات",
  expenses: "المصروفات",
  ai: "الذكاء الاصطناعي",
  customReports: "التقارير المخصصة",
}

export const SOURCE_LABEL: Record<SubscriptionSource, string> = {
  trial: "تجربة مجانية",
  payment: "دفع إلكتروني",
  bank_transfer: "تحويل بنكي",
  admin: "من إدارة مدار",
  existing: "مفعّل سابقاً",
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
