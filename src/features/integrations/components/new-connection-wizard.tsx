"use client"

import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  ExternalLink,
  Eye,
  Filter,
  HelpCircle,
  Info,
  Layers,
  Link2,
  Loader2,
  Lock,
  Megaphone,
  Package,
  PlayCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Target,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"
import { ROUTES } from "@/constants/routes"

import { AppButton, AppCard, AppContainer, AppInput, AppPage, AppSection } from "@/components/app"

import { useWorkspace, WorkspaceSelector } from "@/features/workspace"

import { useConnectionsCenter } from "../hooks"
import {
  appendConnectorAccount,
  CONNECTOR_CATALOG,
  getDefaultTimezone,
  loadStoredConnectionReferences,
  storeConnectionReferences,
} from "../services"
import { ConnectorLogo } from "./connector-logo"

import { useApplicationServices } from "@/application/context"
import { SURFACE_CARD_CLASS } from "@/components/design/dashboard-surface"
import { cairo } from "@/components/design/fonts"

type PlatformCategory = "All" | "Marketing" | "Analytics" | "Ecommerce"
type WizardStep = 0 | 1 | 2 | 3

type SyncPreset = "recommended" | "all" | "custom"
type SetupMode = "oauth" | "manual"
type SyncPhase = "idle" | "running" | "done" | "failed"

// What a finished run actually reports back. There is no mid-flight progress anywhere in
// the integration contract -- runSync resolves once, at the end -- so the screen shows a
// real elapsed clock and an indeterminate bar rather than a percentage it cannot know.
interface SyncResult {
  recordsRead: number
  recordsWritten: number
  recordsFailed: number
  durationMs: number
}
type FlowStatus =
  | "idle"
  | "connecting"
  | "authorizing"
  | "fetching_accounts"
  | "almost_done"
  | "finalizing"
type ErrorKind =
  | "authorization_cancelled"
  | "permission_denied"
  | "token_expired"
  | "network_timeout"
  | "generic"

interface PlatformDetails {
  category: PlatformCategory
  description: string
  connectionType: string
  authMethod: string
  permissions: string[]
  capabilities: string[]
  accountLabel: string
  accountDescription: string
  resourceTypeLabel: string
  syncFrequency: string
  estimatedDuration: string
  recommendedObjects: string[]
  allObjects: string[]
  accounts: Array<{ id: string; label: string; description: string }>
}

interface AccountOption {
  id: string
  label: string
  description: string
}

interface WizardErrorState {
  kind: ErrorKind
  title: string
  description: string
}

const WIZARD_STEPS: Array<{ label: string; description: string }> = [
  { label: "اختيار المنصة", description: "اختر المنصة التي ترغب بربطها" },
  { label: "تسجيل الدخول والتفويض", description: "منح صلاحيات الوصول الآمن" },
  { label: "اختيار بيانات الاستيراد", description: "حدد البيانات المطلوبة للمزامنة" },
  { label: "مراجعة وإتمام", description: "مراجعة الإعدادات وبدء المزامنة" },
]

const SUCCESS_HERO = (platformName: string) => ({
  title: "تم الربط بنجاح",
  subtitle: `منصة ${platformName} جاهزة الآن لمزامنة بياناتك مع مدار.`,
})

// Per-step hero copy. Steps three and four retitle the page in the export rather than
// keeping the "ربط منصة جديدة" heading.
const HERO_COPY: Array<{ title: string; subtitle: string }> = [
  {
    title: "ربط منصة جديدة",
    subtitle: "اربط متجرك أو قنواتك التسويقية لتحصل على بيانات موحدة ورؤى أعمق.",
  },
  {
    title: "ربط منصة جديدة",
    subtitle: "اربط متجرك في خطوات بسيطة وابدأ بمزامنة بياناتك.",
  },
  {
    title: "استيراد البيانات",
    subtitle: "اختر البيانات التي تريد استيرادها من منصتك إلى مدار.",
  },
  {
    title: "مراجعة وإتمام الربط",
    subtitle: "راجع تفاصيل الربط قبل إنشائه للتأكد من صحة الإعدادات.",
  },
]

const PLATFORM_CATEGORIES: PlatformCategory[] = ["All", "Ecommerce", "Marketing", "Analytics"]

const CATEGORY_LABELS: Record<PlatformCategory, string> = {
  All: "الكل",
  Ecommerce: "متاجر إلكترونية",
  Marketing: "منصات إعلانية",
  Analytics: "منصات أخرى",
}

// The platform header on steps two to four names the category in the singular.
const CATEGORY_SINGULAR: Record<PlatformCategory, string> = {
  All: "منصة",
  Ecommerce: "منصة تجارة إلكترونية",
  Marketing: "منصة إعلانية",
  Analytics: "منصة تحليلات",
}

// The card tag in the mockup is green for stores and red for ad platforms.
const CATEGORY_TAG_CLASS: Record<PlatformCategory, string> = {
  All: "bg-[#eef3fb] text-[#5b6b85]",
  Ecommerce: "bg-[#e7f7ee] text-[#1f9d55]",
  Marketing: "bg-[#fdecec] text-[#e0484d]",
  Analytics: "bg-[#eaf1ff] text-[#2878ff]",
}

// Sync objects are identifiers -- they are written into the connection's metadata and read
// back by the sync scheduler -- so the English names stay as the values and only their
// presentation is localised here. An object with no entry falls back to a neutral tile
// carrying its raw name, which is what a connector adding a new object should look like
// until it is given a label.
interface ObjectPresentation {
  label: string
  description: string
  icon: typeof Users
  tint: string
  fill: string
  border: string
  check: string
}

// Every class here is written out in full. Tailwind generates utilities by scanning the
// source, so a class assembled at runtime (tint.replace("text-", "bg-"), say) produces no
// CSS at all and the element silently renders unstyled.
const OBJECT_TINTS = {
  blue: {
    tint: "text-[#2878ff]",
    fill: "bg-[#eef4ff]",
    border: "border-[#c9dcff]",
    check: "bg-[#2878ff]",
  },
  green: {
    tint: "text-[#1f9d55]",
    fill: "bg-[#e9f8ef]",
    border: "border-[#bfe8cf]",
    check: "bg-[#1f9d55]",
  },
  purple: {
    tint: "text-[#8b5cf6]",
    fill: "bg-[#f3eeff]",
    border: "border-[#dccdfb]",
    check: "bg-[#8b5cf6]",
  },
  amber: {
    tint: "text-[#e08b00]",
    fill: "bg-[#fff5e3]",
    border: "border-[#f7ddab]",
    check: "bg-[#e08b00]",
  },
  red: {
    tint: "text-[#e0484d]",
    fill: "bg-[#fdeeee]",
    border: "border-[#f7c9ca]",
    check: "bg-[#e0484d]",
  },
  teal: {
    tint: "text-[#12a594]",
    fill: "bg-[#e6f7f5]",
    border: "border-[#b6e6df]",
    check: "bg-[#12a594]",
  },
} as const

function objectPresentation(name: string): ObjectPresentation {
  const entry = OBJECT_LIBRARY[name]
  const palette = OBJECT_TINTS[entry?.palette ?? "blue"]
  return {
    label: entry?.label ?? name,
    description: entry?.description ?? "استيراد هذه البيانات من المنصة",
    icon: entry?.icon ?? Layers,
    ...palette,
  }
}

const OBJECT_LIBRARY: Record<
  string,
  {
    label: string
    description: string
    icon: typeof Users
    palette: keyof typeof OBJECT_TINTS
  }
> = {
  Customers: {
    label: "العملاء",
    description: "استيراد بيانات العملاء ومعلوماتهم",
    icon: Users,
    palette: "blue",
  },
  Orders: {
    label: "الطلبات",
    description: "استيراد الطلبات وحالاتها",
    icon: ShoppingCart,
    palette: "green",
  },
  Products: {
    label: "المنتجات",
    description: "استيراد المنتجات وبياناتها",
    icon: Package,
    palette: "purple",
  },
  Inventory: {
    label: "المخزون",
    description: "استيراد بيانات المخزون والكميات",
    icon: Layers,
    palette: "amber",
  },
  Catalog: {
    label: "التصنيفات",
    description: "استيراد التصنيفات والمجموعات",
    icon: Tag,
    palette: "red",
  },
  Traffic: {
    label: "الزيارات",
    description: "استيراد بيانات الزيارات والجلسات",
    icon: BarChart3,
    palette: "teal",
  },
  Events: {
    label: "الأحداث",
    description: "استيراد الأحداث والتفاعلات",
    icon: Activity,
    palette: "blue",
  },
  Conversions: {
    label: "التحويلات",
    description: "استيراد بيانات التحويلات",
    icon: Target,
    palette: "green",
  },
  "Page Views": {
    label: "مشاهدات الصفحات",
    description: "استيراد مشاهدات الصفحات",
    icon: Eye,
    palette: "purple",
  },
  Funnels: {
    label: "مسارات التحويل",
    description: "استيراد مسارات التحويل",
    icon: Filter,
    palette: "amber",
  },
  Campaigns: {
    label: "الحملات",
    description: "استيراد الحملات الإعلانية",
    icon: Megaphone,
    palette: "blue",
  },
  Ads: {
    label: "الإعلانات",
    description: "استيراد الإعلانات وأدائها",
    icon: Layers,
    palette: "purple",
  },
  Audience: {
    label: "الجمهور",
    description: "استيراد بيانات الجمهور",
    icon: Users,
    palette: "teal",
  },
  "Audience Insights": {
    label: "رؤى الجمهور",
    description: "استيراد رؤى وتحليلات الجمهور",
    icon: BarChart3,
    palette: "teal",
  },
  "Search Terms": {
    label: "عبارات البحث",
    description: "استيراد عبارات البحث المستخدمة",
    icon: Search,
    palette: "amber",
  },
  "Pixel Events": {
    label: "أحداث البكسل",
    description: "استيراد الأحداث المسجلة عبر البكسل",
    icon: Activity,
    palette: "red",
  },
}

// Arabic one-liners for the platform grid. Keyed by the catalog's displayName; a connector
// with no entry falls back to its English PLATFORM_DETAILS description rather than nothing.
const PLATFORM_DESCRIPTION_AR: Record<string, string> = {
  Salla: "زامن المنتجات والطلبات وبيانات العملاء من متجرك.",
  Shopify: "اربط متجر شوبيفاي لمزامنة الطلبات والمنتجات.",
  Zid: "اربط متجر زد لمزامنة الطلبات والمنتجات والعملاء.",
  "Google Analytics 4": "استورد الجلسات والأحداث وتقارير الجمهور.",
  "Meta Ads": "اسحب حملات فيسبوك وإنستغرام وأداء الإنفاق.",
  "Google Ads": "اسحب الحملات والكلمات المفتاحية وبيانات التحويل.",
  "TikTok Ads": "زامن حملات تيك توك ومقاييس الأداء.",
  "Snapchat Ads": "زامن حملات سناب شات والإنفاق والتحويلات.",
}

const PLATFORM_DETAILS: Record<string, PlatformDetails> = {
  Salla: {
    category: "Ecommerce",
    description: "Sync products, orders, and customer records from your store.",
    connectionType: "موصل التجارة الإلكترونية",
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Salla store that should connect to MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "كل 30 دقيقة",
    estimatedDuration: "1 – 2 دقيقة",
    recommendedObjects: ["Products", "Orders", "Customers"],
    allObjects: ["Products", "Orders", "Customers", "Inventory", "Catalog"],
    accounts: [
      { id: "salla-store-a", label: "Store A", description: "Primary storefront" },
      { id: "salla-store-b", label: "Store B", description: "Regional store" },
      { id: "salla-store-c", label: "Store C", description: "Wholesale store" },
    ],
  },
  Shopify: {
    category: "Ecommerce",
    description: "Sync products, orders, and customer records from your store.",
    connectionType: "موصل التجارة الإلكترونية",
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Shopify store that should connect to MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "كل 30 دقيقة",
    estimatedDuration: "1 – 2 دقيقة",
    recommendedObjects: ["Products", "Orders", "Customers"],
    allObjects: ["Products", "Orders", "Customers", "Inventory", "Catalog"],
    accounts: [
      { id: "shopify-store-a", label: "Store A", description: "Primary storefront" },
      { id: "shopify-store-b", label: "Store B", description: "Regional store" },
      { id: "shopify-store-c", label: "Store C", description: "Wholesale store" },
    ],
  },
  Zid: {
    category: "Ecommerce",
    description: "Bring store activity, product updates, and customer records together.",
    connectionType: "موصل التجارة الإلكترونية",
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Zid store that should sync into MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "كل 30 دقيقة",
    estimatedDuration: "1 – 2 دقيقة",
    recommendedObjects: ["Products", "Orders", "Customers"],
    allObjects: ["Products", "Orders", "Customers", "Inventory", "Catalog"],
    accounts: [
      { id: "zid-store-a", label: "Store A", description: "Primary storefront" },
      { id: "zid-store-b", label: "Store B", description: "Retail branch" },
      { id: "zid-store-c", label: "Store C", description: "B2B catalog" },
    ],
  },
  "Google Analytics 4": {
    category: "Analytics",
    description: "Capture traffic, events, and conversions for customer insight.",
    connectionType: "موصل التحليلات",
    authMethod: "OAuth 2.0",
    permissions: ["Traffic", "Events", "Conversions"],
    capabilities: ["Traffic", "Events", "Conversions"],
    accountLabel: "Property",
    accountDescription: "Select the GA4 property that should feed your workspace.",
    resourceTypeLabel: "Property",
    syncFrequency: "كل 15 دقيقة",
    estimatedDuration: "أقل من 90 ثانية",
    recommendedObjects: ["Traffic", "Events", "Conversions"],
    allObjects: ["Traffic", "Events", "Conversions", "Page Views", "Funnels"],
    accounts: [
      { id: "ga4-property-a", label: "Property A", description: "Primary analytics property" },
      { id: "ga4-property-b", label: "Property B", description: "Brand site property" },
      { id: "ga4-property-c", label: "Property C", description: "Marketplace property" },
    ],
  },
  "Meta Ads": {
    category: "Marketing",
    description: "Sync campaign, ad, and conversion data from Meta.",
    connectionType: "موصل المنصات الإعلانية",
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Business or Ad Account",
    accountDescription: "Choose the Meta business or ad account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "كل 15 دقيقة",
    estimatedDuration: "أقل من 90 ثانية",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Audience Insights"],
    accounts: [
      { id: "meta-business-a", label: "Business A", description: "Primary business manager" },
      { id: "meta-ad-account-a", label: "Ad Account A", description: "Performance ad account" },
      { id: "meta-ad-account-b", label: "Ad Account B", description: "Retargeting ad account" },
    ],
  },
  "Google Ads": {
    category: "Marketing",
    description: "Import paid media performance and conversion signals.",
    connectionType: "موصل المنصات الإعلانية",
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Select the Google Ads account that should connect to MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "كل 15 دقيقة",
    estimatedDuration: "أقل من 90 ثانية",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Search Terms"],
    accounts: [
      { id: "google-ads-1", label: "Account 1", description: "Primary search account" },
      { id: "google-ads-2", label: "Account 2", description: "Brand account" },
      { id: "google-ads-3", label: "Account 3", description: "Shopping account" },
    ],
  },
  "TikTok Ads": {
    category: "Marketing",
    description: "Connect campaign and audience performance from TikTok Ads.",
    connectionType: "موصل المنصات الإعلانية",
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the TikTok Ads account to sync into MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "كل 15 دقيقة",
    estimatedDuration: "أقل من 90 ثانية",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Audience"],
    accounts: [
      { id: "tiktok-account-a", label: "Account A", description: "Primary ad account" },
      { id: "tiktok-account-b", label: "Account B", description: "Growth account" },
    ],
  },
  "Snapchat Ads": {
    category: "Marketing",
    description: "Sync ad delivery and conversion performance from Snapchat.",
    connectionType: "موصل المنصات الإعلانية",
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the Snapchat Ads account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "كل 15 دقيقة",
    estimatedDuration: "أقل من 90 ثانية",
    recommendedObjects: ["Campaigns", "Ads", "Conversions"],
    allObjects: ["Campaigns", "Ads", "Conversions", "Traffic", "Pixel Events"],
    accounts: [
      { id: "snapchat-account-a", label: "Account A", description: "Primary account" },
      { id: "snapchat-account-b", label: "Account B", description: "Campaign account" },
    ],
  },
}

function getCategoryForConnector(displayName: string): PlatformCategory {
  return PLATFORM_DETAILS[displayName]?.category ?? "Marketing"
}

// Shopify is the only connector whose OAuth authorize URL is store-specific
// (https://{shop}.myshopify.com/...), so it's the only one that needs a value from the
// user before "Continue to OAuth" can build a real redirect. Accepts a bare handle
// ("madar-test"), the full myshopify.com domain, or a full URL copy-pasted from the
// browser's own address bar (the most natural thing to paste here) -- matches the
// backend's equally lenient normalizeShopDomain().
const SHOP_DOMAIN_INPUT_PATTERN = /^[a-z0-9][a-z0-9-]*(\.myshopify\.com)?$/i

function stripShopDomainDecoration(value: string) {
  return value
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .split(/[/?#]/)[0]
}

function isShopDomainValid(value: string) {
  return SHOP_DOMAIN_INPUT_PATTERN.test(stripShopDomainDecoration(value))
}

interface OAuthConnectorProfile {
  callbackParam: string
  connectionIdParam: string
  accountsMetadataKey: string
  fallbackAccountLabel: string
}

const OAUTH_CONNECTOR_PROFILES: Record<string, OAuthConnectorProfile> = {
  google_ads: {
    callbackParam: "google_oauth",
    connectionIdParam: "google_connection_id",
    accountsMetadataKey: "availableGoogleAdsCustomerAccounts",
    fallbackAccountLabel: "Google Ads",
  },
  snapchat_ads: {
    callbackParam: "snapchat_oauth",
    connectionIdParam: "snapchat_connection_id",
    accountsMetadataKey: "availableSnapchatAdsCustomerAccounts",
    fallbackAccountLabel: "Snapchat Ads",
  },
  meta_ads: {
    callbackParam: "meta_oauth",
    connectionIdParam: "meta_connection_id",
    accountsMetadataKey: "availableMetaAdsCustomerAccounts",
    fallbackAccountLabel: "Meta Ads",
  },
  salla: {
    callbackParam: "salla_oauth",
    connectionIdParam: "salla_connection_id",
    accountsMetadataKey: "availableSallaCustomerAccounts",
    fallbackAccountLabel: "Salla",
  },
  shopify: {
    callbackParam: "shopify_oauth",
    connectionIdParam: "shopify_connection_id",
    accountsMetadataKey: "availableShopifyCustomerAccounts",
    fallbackAccountLabel: "Shopify",
  },
  "google-analytics": {
    callbackParam: "google_analytics_oauth",
    connectionIdParam: "google_analytics_connection_id",
    accountsMetadataKey: "availableGoogleAnalyticsAccounts",
    fallbackAccountLabel: "Google Analytics",
  },
  zid: {
    callbackParam: "zid_oauth",
    connectionIdParam: "zid_connection_id",
    accountsMetadataKey: "availableZidCustomerAccounts",
    fallbackAccountLabel: "Zid",
  },
  tiktok_ads: {
    callbackParam: "tiktok_ads_oauth",
    connectionIdParam: "tiktok_ads_connection_id",
    accountsMetadataKey: "availableTikTokAdsCustomerAccounts",
    fallbackAccountLabel: "TikTok Ads",
  },
}

function parseAccessibleProviderAccounts(
  rawValue: string | undefined,
  fallbackLabel: string
): AccountOption[] {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as Array<Record<string, unknown>>
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => {
        const id = typeof item.customerId === "string" ? item.customerId : ""
        const displayName = typeof item.displayName === "string" ? item.displayName : null
        if (!id) {
          return null
        }

        return {
          id,
          label: displayName ?? `${fallbackLabel} ${id}`,
          description: `Customer ID: ${id}`,
        } satisfies AccountOption
      })
      .filter((item): item is AccountOption => item !== null)
  } catch {
    return []
  }
}

function errorMeta(kind: ErrorKind): WizardErrorState {
  switch (kind) {
    case "authorization_cancelled":
      return {
        kind,
        title: "تم إلغاء التفويض",
        description: "أغلقت المنصة جلسة OAuth قبل منح الصلاحية.",
      }
    case "permission_denied":
      return {
        kind,
        title: "الصلاحية مرفوضة",
        description: "لم يمنح الحساب المرتبط الصلاحيات التي يحتاجها مدار لمزامنة البيانات.",
      }
    case "token_expired":
      return {
        kind,
        title: "انتهت صلاحية الرمز",
        description: "لم يعد رمز OAuth صالحاً. أعد ربط المنصة للمتابعة.",
      }
    case "network_timeout":
      return {
        kind,
        title: "انتهت مهلة الشبكة",
        description: "استغرق الاتصال وقتاً أطول من اللازم. حاول مجدداً عندما تستقر الشبكة.",
      }
    default:
      return {
        kind,
        title: "تعذّر إكمال الربط",
        description: "حدث ما قاطع عملية الإعداد. يمكنك المحاولة مجدداً أو اختيار حساب آخر.",
      }
  }
}

function inferErrorKind(message: string): ErrorKind {
  const normalized = message.toLowerCase()
  if (normalized.includes("cancel")) return "authorization_cancelled"
  if (normalized.includes("permission")) return "permission_denied"
  if (normalized.includes("token")) return "token_expired"
  if (normalized.includes("timeout") || normalized.includes("network")) return "network_timeout"
  return "generic"
}

const LOADING_STAGES: Record<Exclude<FlowStatus, "idle" | "finalizing">, string> = {
  connecting: "جارٍ الاتصال...",
  authorizing: "جارٍ التفويض...",
  fetching_accounts: "جارٍ جلب الحسابات...",
  almost_done: "على وشك الانتهاء...",
}

const ACCOUNT_FALLBACK = {
  id: "account-default",
  label: "الحساب الرئيسي",
  description: "الحساب الذي تختاره المنصة افتراضياً.",
}

// Colours, radii and type sizes below are read straight off the new-connection SVG export
// rather than from the shared dashboard-surface tokens -- that token set describes the
// dashboard shell, and reusing it is what made the first pass at this page look unchanged.
const PANEL_CLASS = "rounded-[14px] border border-[#e1e7f0] bg-white"
const PAGE_TEXT = "text-[#0b1738]"
const MUTED_TEXT = "text-[#6b7b96]"

// The five marks orbiting the MADAR logo in the hero, with their positions in the 300x210
// illustration box. Percentages so the whole thing scales with the card.
const HERO_ORBIT: Array<{ platform: string; x: number; y: number }> = [
  { platform: "Salla", x: 12, y: 16 },
  { platform: "Google Ads", x: 86, y: 16 },
  { platform: "Meta Ads", x: 4, y: 62 },
  { platform: "TikTok Ads", x: 94, y: 62 },
  { platform: "Snapchat Ads", x: 50, y: 92 },
]

function HeroConstellation() {
  return (
    <div
      className="relative h-[210px] w-full max-w-[320px] shrink-0"
      role="img"
      aria-label="MADAR متصل بمنصات المتاجر والإعلانات"
    >
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {HERO_ORBIT.map((node) => (
          <line
            key={node.platform}
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke="#b9cdf0"
            strokeWidth="0.5"
            strokeDasharray="2 2.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="absolute left-1/2 top-1/2 flex h-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#dbe6f8] bg-white px-4 shadow-[0_6px_18px_rgba(40,120,255,0.14)]">
        <Image src={ASSETS.logo} alt="MADAR" width={78} height={22} className="h-5 w-auto" />
      </div>

      {HERO_ORBIT.map((node) => (
        <div
          key={node.platform}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <ConnectorLogo
            platformName={node.platform}
            className="size-11 shrink-0 rounded-full border border-[#e1e7f0] bg-white p-2 shadow-[0_4px_12px_rgba(11,23,56,0.08)]"
          />
        </div>
      ))}
    </div>
  )
}

// The scattered dots the success screen sprinkles over its hero and main card.
const CONFETTI: Array<{ x: number; y: number; color: string; size: number }> = [
  { x: 6, y: 18, color: "#f0b429", size: 7 },
  { x: 22, y: 8, color: "#f0b429", size: 6 },
  { x: 38, y: 12, color: "#3fb37f", size: 7 },
  { x: 12, y: 62, color: "#8b5cf6", size: 8 },
  { x: 33, y: 74, color: "#e0484d", size: 7 },
  { x: 60, y: 22, color: "#5aa9f8", size: 6 },
  { x: 74, y: 58, color: "#3fb37f", size: 7 },
  { x: 88, y: 16, color: "#f0b429", size: 6 },
  { x: 94, y: 66, color: "#e0484d", size: 7 },
  { x: 52, y: 84, color: "#5aa9f8", size: 6 },
]

function Confetti({ region = "full" }: { region?: "full" | "left" }) {
  // The hero's copy occupies its right-hand half, so its dots are confined to the left.
  const dots = region === "left" ? CONFETTI.filter((dot) => dot.x < 48) : CONFETTI

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((dot) => (
        <span
          key={`${dot.x}-${dot.y}`}
          className="absolute rounded-full opacity-70"
          style={{
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            backgroundColor: dot.color,
          }}
        />
      ))}
    </div>
  )
}

// The success hero swaps the orbiting platforms for the finished handshake: MADAR, a
// completed step, and the platform that was just connected.
function SyncingHandshake({ platformName }: { platformName: string }) {
  return (
    <div className="flex shrink-0 items-center gap-0">
      <div className="flex h-11 shrink-0 items-center justify-center rounded-full border border-[#dbe6f8] bg-white px-3.5">
        <Image src={ASSETS.logo} alt="MADAR" width={64} height={20} className="h-5 w-auto" />
      </div>
      <span aria-hidden className="h-px w-7 border-t-2 border-dashed border-[#c3d3e8]" />
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3fb37f] text-white">
        <Check className="size-5" strokeWidth={3} />
      </span>
      <span aria-hidden className="h-px w-7 border-t-2 border-dashed border-[#c3d3e8]" />
      <ConnectorLogo
        platformName={platformName}
        className="size-11 shrink-0 rounded-xl border border-[#eef2f8] bg-white p-2 shadow-[0_4px_12px_rgba(11,23,56,0.08)]"
      />
    </div>
  )
}

function SuccessHandshake({ platformName }: { platformName: string }) {
  return (
    <div className="relative shrink-0 pt-7">
      <p className="absolute end-2 top-0 max-w-44 text-center text-[12.5px] font-extrabold leading-5 text-[#0b1738]">
        خطوة جديدة نحو قرارات أعمق
      </p>
      {/* RTL: the first child lands rightmost, and the export reads MADAR -> done ->
          platform from left to right, so the platform is written first. */}
      <div className="flex items-center gap-0">
        <ConnectorLogo
          platformName={platformName}
          className="size-14 shrink-0 rounded-2xl border border-[#eef2f8] bg-white p-3 shadow-[0_6px_18px_rgba(11,23,56,0.08)]"
        />
        <span aria-hidden className="h-px w-9 border-t-2 border-dashed border-[#c3d3e8]" />
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#3fb37f] text-white shadow-[0_8px_20px_rgba(63,179,127,0.32)]">
          <Check className="size-7" strokeWidth={3} />
        </span>
        <span aria-hidden className="h-px w-9 border-t-2 border-dashed border-[#c3d3e8]" />
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border border-[#dbe6f8] bg-white shadow-[0_6px_18px_rgba(11,23,56,0.08)]">
          <Image src={ASSETS.logo} alt="MADAR" width={64} height={20} className="h-5 w-auto" />
        </div>
      </div>
    </div>
  )
}

// Latin digits: the rest of the page (the elapsed clock, the step numbers, the export's
// own "943/2,000") uses them, and ar-SA defaults to Arabic-Indic.
function formatCount(value: number) {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", { useGrouping: true }).format(value)
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatElapsedWords(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes} دقيقة و ${seconds} ثانية`
}

const WIZARD_INTERACTION_CLASS =
  "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"

export function NewConnectionWizard() {
  const router = useRouter()
  const { refetch } = useConnectionsCenter()
  const { connectionManager, integrationApplicationService } = useApplicationServices()
  const { currentWorkspace } = useWorkspace()

  const [stepIndex, setStepIndex] = useState<WizardStep>(0)
  const [selectedCategory, setSelectedCategory] = useState<PlatformCategory>("All")
  const [platformSearch, setPlatformSearch] = useState("")
  const [selectedConnectorDefinitionId, setSelectedConnectorDefinitionId] = useState(
    CONNECTOR_CATALOG[0]?.connectorDefinitionId ?? ""
  )
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle")
  const [errorState, setErrorState] = useState<WizardErrorState | null>(null)
  const [retryTarget, setRetryTarget] = useState<"connect" | "finalize" | null>(null)
  const [draftConnectionId, setDraftConnectionId] = useState<string | null>(null)
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [syncPreset, setSyncPreset] = useState<SyncPreset>("recommended")
  const [setupMode, setSetupMode] = useState<SetupMode>("oauth")
  const [apiKey, setApiKey] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [manualCredentials, setManualCredentials] = useState("")
  const [connectionName, setConnectionName] = useState("")
  const [healthMonitoringEnabled, setHealthMonitoringEnabled] = useState(true)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [isRunningFirstSync, setIsRunningFirstSync] = useState(false)
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle")
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null)
  const [syncElapsedMs, setSyncElapsedMs] = useState(0)
  const [syncOutcome, setSyncOutcome] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [discoveredProviderAccounts, setDiscoveredProviderAccounts] = useState<AccountOption[]>([])
  const [shopDomain, setShopDomain] = useState("")

  const workspaceId = currentWorkspace?.id ?? null
  const workspaceLabel = currentWorkspace?.name ?? "Madar Workspace"

  const selectedConnector = useMemo(
    () =>
      CONNECTOR_CATALOG.find(
        (entry) => entry.connectorDefinitionId === selectedConnectorDefinitionId
      ),
    [selectedConnectorDefinitionId]
  )

  const selectedConnectorDetails = selectedConnector
    ? PLATFORM_DETAILS[selectedConnector.displayName]
    : undefined

  const filteredConnectors = useMemo(() => {
    const query = platformSearch.trim().toLowerCase()

    return CONNECTOR_CATALOG.filter((connector) => {
      const matchesCategory =
        selectedCategory === "All" ||
        getCategoryForConnector(connector.displayName) === selectedCategory

      if (!matchesCategory) {
        return false
      }

      if (!query) {
        return true
      }

      // Search both the English catalog name and the Arabic blurb, since the page is Arabic
      // but every connector is still listed under its English brand name.
      const arabicDescription = PLATFORM_DESCRIPTION_AR[connector.displayName] ?? ""
      return (
        connector.displayName.toLowerCase().includes(query) || arabicDescription.includes(query)
      )
    })
  }, [platformSearch, selectedCategory])

  const availableAccounts = useMemo(() => {
    if (!selectedConnector) {
      return []
    }

    if (selectedConnector.connectorId in OAUTH_CONNECTOR_PROFILES) {
      return discoveredProviderAccounts.length > 0 ? discoveredProviderAccounts : [ACCOUNT_FALLBACK]
    }

    return selectedConnectorDetails?.accounts ?? [ACCOUNT_FALLBACK]
  }, [discoveredProviderAccounts, selectedConnector, selectedConnectorDetails])
  const selectedAccount =
    availableAccounts.find((account) => account.id === selectedAccountId) ??
    availableAccounts[0] ??
    ACCOUNT_FALLBACK
  const selectedObjectsSet = useMemo(() => new Set(selectedObjects), [selectedObjects])

  const recommendedObjects = useMemo(
    () => selectedConnectorDetails?.recommendedObjects ?? [],
    [selectedConnectorDetails]
  )
  const allObjects = useMemo(
    () => selectedConnectorDetails?.allObjects ?? [],
    [selectedConnectorDetails]
  )

  useEffect(() => {
    if (!selectedConnector) {
      setSelectedObjects([])
      setConnectionName("")
      setSyncPreset("recommended")
      return
    }

    if (!(selectedConnector.connectorId in OAUTH_CONNECTOR_PROFILES)) {
      setDiscoveredProviderAccounts([])
    }

    setSelectedObjects((current) => {
      if (current.length > 0) {
        return current.filter((item) => allObjects.includes(item))
      }
      return recommendedObjects.length > 0 ? recommendedObjects : allObjects.slice(0, 3)
    })
    setSelectedAccountId((current) => current ?? availableAccounts[0]?.id ?? ACCOUNT_FALLBACK.id)
    setConnectionName((current) => current || `اتصال ${selectedConnector.displayName}`)
  }, [availableAccounts, allObjects, recommendedObjects, selectedConnector])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const callbackParams = new URLSearchParams(window.location.search)

    // A provider's own OAuth callback (e.g. ZidOAuthService.buildErrorRedirect) lands here with
    // its callbackParam set to "error" instead of "connected" on failure -- previously nothing
    // read this branch at all, so the merchant just saw an empty wizard with no explanation.
    const erroredProfileEntry = Object.entries(OAUTH_CONNECTOR_PROFILES).find(
      ([, profile]) => callbackParams.get(profile.callbackParam) === "error"
    )
    if (erroredProfileEntry) {
      const reason = callbackParams.get("reason")
      toast.error(reason ? `تعذر إتمام الاتصال: ${reason}` : "تعذر إتمام الاتصال. حاول مرة أخرى.")
      return
    }

    const matchedProfileEntry = Object.entries(OAUTH_CONNECTOR_PROFILES).find(
      ([, profile]) => callbackParams.get(profile.callbackParam) === "connected"
    )
    if (!matchedProfileEntry) {
      return
    }
    const [, matchedProfile] = matchedProfileEntry

    const callbackConnectionId = callbackParams.get(matchedProfile.connectionIdParam)
    if (!callbackConnectionId) {
      return
    }

    let cancelled = false
    const loadAccessibleAccounts = async () => {
      setDraftConnectionId(callbackConnectionId)
      setFlowStatus("fetching_accounts")

      try {
        const validateConnectionInput = {
          connectionId: callbackConnectionId,
        }

        const validated =
          await integrationApplicationService.validateConnection(validateConnectionInput)

        if (cancelled) {
          return
        }

        const providerProfile = OAUTH_CONNECTOR_PROFILES[validated.payload.connectorId]
        if (!providerProfile) {
          return
        }

        setSelectedConnectorDefinitionId(validated.payload.connectorDefinitionId)

        const accounts = parseAccessibleProviderAccounts(
          validated.payload.metadata[providerProfile.accountsMetadataKey],
          providerProfile.fallbackAccountLabel
        )
        if (accounts.length > 0) {
          setDiscoveredProviderAccounts(accounts)
          const selectedCustomerId =
            validated.payload.metadata.customerId &&
            accounts.some((account) => account.id === validated.payload.metadata.customerId)
              ? validated.payload.metadata.customerId
              : accounts[0].id
          setSelectedAccountId(selectedCustomerId)
        }

        setStepIndex(2)
        setErrorState(null)
        setRetryTarget(null)
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        const kind = inferErrorKind(message)
        setErrorState(errorMeta(kind))
      } finally {
        if (!cancelled) {
          setFlowStatus("idle")
        }
      }
    }

    void loadAccessibleAccounts()

    return () => {
      cancelled = true
    }
  }, [integrationApplicationService, selectedConnector?.connectorId])

  useEffect(() => {
    if (!selectedConnectorDetails) {
      return
    }

    const nextPreset =
      syncPreset === "all"
        ? allObjects
        : syncPreset === "recommended"
          ? recommendedObjects
          : selectedObjects
    if (syncPreset !== "custom") {
      setSelectedObjects(nextPreset.length > 0 ? nextPreset : recommendedObjects)
    }
  }, [allObjects, recommendedObjects, selectedConnectorDetails, selectedObjects, syncPreset])

  const resetError = useCallback(() => {
    setErrorState(null)
    setRetryTarget(null)
  }, [])

  const initializeImportSelection = useCallback(
    (preset: SyncPreset) => {
      if (!selectedConnectorDetails) {
        return
      }

      if (preset === "all") {
        setSelectedObjects(selectedConnectorDetails.allObjects)
        return
      }

      if (preset === "recommended") {
        setSelectedObjects(selectedConnectorDetails.recommendedObjects)
        return
      }
    },
    [selectedConnectorDetails]
  )

  const beginOAuthFlow = useCallback(async () => {
    if (!selectedConnector || !selectedConnectorDetails || !workspaceId) {
      return
    }

    resetError()
    setRetryTarget("connect")
    setFlowStatus("connecting")

    try {
      const references = loadStoredConnectionReferences()
      const created = await connectionManager.createConnection({
        workspaceId,
        connectorDefinitionId: selectedConnector.connectorDefinitionId,
        connectorId: selectedConnector.connectorId,
        metadata: {
          accountName: selectedAccount.label,
          workspaceName: workspaceLabel,
          connectionName,
          ...(selectedConnector.connectorId === "shopify" ? { shopDomain } : {}),
        },
        ...(setupMode === "manual"
          ? {
              credential: {
                type: "api_key" as const,
                payload: {
                  apiKey,
                  clientSecret,
                  manualCredentials,
                },
              },
            }
          : {}),
      })

      const connectionId = created.connectionId
      storeConnectionReferences([
        ...references.filter(
          (entry) => entry.connectorDefinitionId !== selectedConnector.connectorDefinitionId
        ),
        {
          connectorDefinitionId: selectedConnector.connectorDefinitionId,
          connectionId: created.connectionId,
        },
      ])

      if (!connectionId) {
        throw new Error("Connection id missing after OAuth initialization")
      }

      setDraftConnectionId(connectionId)
      setFlowStatus("authorizing")
      appendConnectorAccount(selectedConnector.connectorDefinitionId, selectedAccount.label)

      await connectionManager.connect({
        connectionId,
      })

      const requiresProviderCallback =
        selectedConnector.connectorId in OAUTH_CONNECTOR_PROFILES && setupMode === "oauth"

      if (!requiresProviderCallback) {
        setStepIndex(2)
        setFlowStatus("idle")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = inferErrorKind(message)
      setErrorState(errorMeta(kind))
      setRetryTarget("connect")
      setFlowStatus("idle")
    }
  }, [
    apiKey,
    clientSecret,
    connectionManager,
    connectionName,
    manualCredentials,
    resetError,
    selectedAccount.label,
    selectedConnector,
    selectedConnectorDetails,
    setupMode,
    shopDomain,
    workspaceId,
    workspaceLabel,
  ])

  const finalizeConnection = useCallback(async () => {
    if (!selectedConnector || !draftConnectionId) {
      return
    }

    resetError()
    setRetryTarget("finalize")
    setFlowStatus("finalizing")

    try {
      // Discovered-accounts connectors (Snapchat/Meta/Google Ads etc.) let the user pick which
      // ad account to connect in the Import step, but that choice only ever lived in local
      // component state -- nothing persisted it to the backend, so the connection silently
      // stayed bound to whichever account the provider happened to discover first. Persist the
      // user's actual choice before scheduling sync.
      if (
        selectedConnector.connectorId in OAUTH_CONNECTOR_PROFILES &&
        discoveredProviderAccounts.length > 0 &&
        selectedAccountId &&
        selectedAccountId !== ACCOUNT_FALLBACK.id
      ) {
        await connectionManager.selectAccount({
          connectionId: draftConnectionId,
          customerId: selectedAccountId,
        })
      }

      await connectionManager.scheduleSync({
        connectionId: draftConnectionId,
        cron: "*/30 * * * *",
        timezone: getDefaultTimezone(),
        enabled: true,
      })
      setAutoSyncEnabled(true)
      setHealthMonitoringEnabled(true)
      setStepIndex(3)
      setIsSuccess(true)
      setFlowStatus("idle")
      await refetch()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = inferErrorKind(message)
      setErrorState(errorMeta(kind))
      setRetryTarget("finalize")
      setFlowStatus("idle")
    }
  }, [
    connectionManager,
    discoveredProviderAccounts,
    draftConnectionId,
    refetch,
    resetError,
    selectedAccountId,
    selectedConnector,
  ])

  const handleContinue = useCallback(async () => {
    if (errorState) {
      return
    }

    if (stepIndex === 0) {
      if (!selectedConnectorDefinitionId) {
        return
      }
      setStepIndex(1)
      return
    }

    if (stepIndex === 1) {
      await beginOAuthFlow()
      return
    }

    if (stepIndex === 2) {
      if (selectedObjects.length === 0) {
        return
      }
      setStepIndex(3)
      return
    }

    if (stepIndex === 3) {
      await finalizeConnection()
    }
  }, [
    beginOAuthFlow,
    errorState,
    finalizeConnection,
    selectedConnectorDefinitionId,
    selectedObjects.length,
    stepIndex,
  ])

  const goToPreviousStep = useCallback(() => {
    if (flowStatus !== "idle") {
      return
    }

    setErrorState(null)
    setRetryTarget(null)
    setIsSuccess(false)

    setStepIndex((current) => (current > 0 ? ((current - 1) as WizardStep) : current))
  }, [flowStatus])

  const handlePreviousClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      goToPreviousStep()
    },
    [goToPreviousStep]
  )

  const exitWizard = useCallback(() => {
    router.push(ROUTES.integrations)
  }, [router])

  const handlePlatformToggle = useCallback((connectorDefinitionId: string) => {
    setErrorState(null)
    setRetryTarget(null)
    setSelectedConnectorDefinitionId((current) =>
      current === connectorDefinitionId ? "" : connectorDefinitionId
    )
    setStepIndex(0)
    setDraftConnectionId(null)
    setFlowStatus("idle")
    setSelectedObjects([])
    setSyncPreset("recommended")
    setIsSuccess(false)
  }, [])

  const handleRetry = useCallback(() => {
    if (retryTarget === "connect") {
      void beginOAuthFlow()
      return
    }

    if (retryTarget === "finalize") {
      void finalizeConnection()
    }
  }, [beginOAuthFlow, finalizeConnection, retryTarget])

  const toggleObjectSelection = useCallback((value: string) => {
    setSelectedObjects((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value)
      }

      return [...current, value]
    })
    setSyncPreset("custom")
  }, [])

  const selectPreset = useCallback(
    (preset: SyncPreset) => {
      setSyncPreset(preset)
      initializeImportSelection(preset)
    },
    [initializeImportSelection]
  )

  const goToImportStep = useCallback(() => {
    setErrorState(null)
    setRetryTarget(null)
    setStepIndex(2)
  }, [])

  const goToConnections = useCallback(() => {
    router.push(ROUTES.integrations)
  }, [router])

  const runFirstSync = useCallback(async () => {
    if (!draftConnectionId) {
      return
    }

    setIsRunningFirstSync(true)
    setSyncPhase("running")
    setSyncError(null)
    setSyncOutcome(null)
    setSyncElapsedMs(0)
    setSyncStartedAt(Date.now())

    try {
      const run = await connectionManager.runSync({
        connectionId: draftConnectionId,
        trigger: "manual",
      })
      // result is optional on SyncRun: a connector that reports no counts leaves the
      // totals off the summary rather than showing zeroes it never measured.
      setSyncOutcome(run.result ?? null)
      setSyncPhase(run.status === "failed" ? "failed" : "done")
      if (run.status === "failed") {
        setSyncError(run.errorMessage ?? "تعذّر إكمال المزامنة.")
      }
    } catch (error) {
      setSyncPhase("failed")
      setSyncError(error instanceof Error ? error.message : "تعذّر إكمال المزامنة.")
    } finally {
      setIsRunningFirstSync(false)
    }
  }, [connectionManager, draftConnectionId])

  // A real clock, ticking only while a run is actually in flight.
  useEffect(() => {
    if (syncPhase !== "running" || syncStartedAt === null) {
      return
    }

    const tick = () => setSyncElapsedMs(Date.now() - syncStartedAt)
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [syncPhase, syncStartedAt])

  const isContinueDisabled =
    flowStatus !== "idle" ||
    (stepIndex === 0 && !selectedConnectorDefinitionId) ||
    (stepIndex === 1 &&
      selectedConnector?.connectorId === "shopify" &&
      !isShopDomainValid(shopDomain)) ||
    (stepIndex === 2 && selectedObjects.length === 0)

  const currentStepState = (index: WizardStep) => {
    if (stepIndex > index) return "done"
    if (stepIndex === index) return "active"
    return "todo"
  }

  // Hero + stepper. In an RTL flex row the FIRST DOM child lands rightmost, so the copy
  // block is written before the illustration to sit on the right, and step 1 is the first
  // item in the stepper so it renders at the right-hand end of the row.
  const renderStepper = () => (
    <div className={cn(PANEL_CLASS, "px-5 py-5 md:px-7")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {WIZARD_STEPS.map((step, index) => {
          const state = currentStepState(index as WizardStep)
          return (
            <Fragment key={step.label}>
              {index > 0 ? (
                <div
                  aria-hidden
                  className={cn(
                    "mt-[18px] hidden h-px flex-1 lg:block",
                    state === "todo" ? "bg-[#e1e7f0]" : "bg-[#1fa85c]"
                  )}
                />
              ) : null}
              <div className="flex items-start gap-3 text-right lg:w-auto lg:shrink-0">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors",
                    state === "done"
                      ? "bg-[#1fa85c] text-white"
                      : state === "active"
                        ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.32)]"
                        : "bg-[#eef2f8] text-[#95a4bd]"
                  )}
                >
                  {state === "done" ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </div>
                <div className="min-w-0 space-y-1">
                  <p
                    className={cn(
                      "text-[13px] font-bold leading-5",
                      state === "done"
                        ? "text-[#1fa85c]"
                        : state === "todo"
                          ? "text-[#95a4bd]"
                          : PAGE_TEXT
                    )}
                  >
                    {step.label}
                  </p>
                  {/* The export drops the sub-labels once the flow is past the first
                      two steps, where the row would otherwise crowd the content. */}
                  {stepIndex <= 1 ? (
                    <p className={cn("text-[11px] leading-[18px]", MUTED_TEXT)}>
                      {step.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </Fragment>
          )
        })}
      </div>
    </div>
  )

  const renderTopProgress = () => {
    if (syncPhase !== "idle" && selectedConnector) {
      const heading =
        syncPhase === "running"
          ? `جاري مزامنة بيانات ${selectedConnector.displayName}`
          : syncPhase === "failed"
            ? `تعذّرت مزامنة بيانات ${selectedConnector.displayName}`
            : `اكتملت مزامنة بيانات ${selectedConnector.displayName}`

      return (
        <div className="space-y-4">
          {/* RTL: the heading is written first so it lands on the right, illustration left. */}
          <div className="rounded-[18px] border border-[#dbe6f8] bg-gradient-to-l from-[#eef4ff] via-[#f5f8ff] to-[#fbfcff] px-6 py-4 md:px-8">
            <div className="flex flex-col items-center gap-5 md:flex-row md:justify-between">
              <div className="flex items-center gap-2.5">
                <h1 className={cn("text-[20px] font-extrabold md:text-[22px]", PAGE_TEXT)}>
                  {heading}
                </h1>
                {syncPhase === "running" ? (
                  <RefreshCcw className="size-5 shrink-0 animate-spin text-[#2878ff]" />
                ) : syncPhase === "failed" ? (
                  <CircleAlert className="size-5 shrink-0 text-[#e0484d]" />
                ) : (
                  <Check className="size-5 shrink-0 text-[#1f9d55]" strokeWidth={3} />
                )}
              </div>
              <SyncingHandshake platformName={selectedConnector.displayName} />
            </div>
          </div>

          {renderStepper()}
        </div>
      )
    }

    const hero = isSuccess
      ? SUCCESS_HERO(selectedConnector?.displayName ?? "")
      : HERO_COPY[stepIndex]
    const isFinalStep = stepIndex === 3 && !isSuccess

    return (
      <div className="space-y-4">
        <div
          className={cn(
            "relative overflow-hidden rounded-[18px] border px-6 py-7 md:px-8",
            isSuccess
              ? "border-[#c6e8d5] bg-gradient-to-l from-[#e8f7ee] via-[#f2faf5] to-[#fbfdfc]"
              : "border-[#dbe6f8] bg-gradient-to-l from-[#e9f1ff] via-[#f3f7ff] to-[#fbfcff]"
          )}
        >
          {isSuccess ? <Confetti region="left" /> : null}
          <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full space-y-2.5 text-center lg:text-right">
              {isFinalStep ? null : (
                <Link
                  href={ROUTES.integrations}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6b7b96] transition-colors hover:text-[#2878ff]"
                >
                  <ChevronLeft className="size-3.5 rtl:rotate-180" />
                  العودة إلى التكاملات
                </Link>
              )}
              {isSuccess ? null : (
                <p className="text-[12px] font-semibold text-[#2878ff]">
                  {isFinalStep
                    ? "الخطوة 4 من 4"
                    : `خطوة ${stepIndex + 1} من ${WIZARD_STEPS.length}`}
                </p>
              )}
              {/* RTL: the tick is written first so it lands to the right of the heading. */}
              <div
                className={cn(
                  "flex items-center gap-3",
                  isSuccess ? "justify-center lg:justify-start" : ""
                )}
              >
                {isSuccess ? (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3fb37f] text-white">
                    <Check className="size-5" strokeWidth={3} />
                  </span>
                ) : null}
                <h1
                  className={cn(
                    "text-[26px] font-extrabold leading-[1.35] md:text-[30px]",
                    PAGE_TEXT
                  )}
                >
                  {hero.title}
                </h1>
              </div>
              <p className={cn("max-w-xl text-[13px] leading-7 lg:max-w-md", MUTED_TEXT)}>
                {hero.subtitle}
              </p>
              {stepIndex === 1 ? (
                <p className="pt-1 text-[12.5px] font-bold text-[#2878ff]">
                  الخطوة الحالية: {WIZARD_STEPS[1].label}
                </p>
              ) : null}
            </div>

            {isSuccess && selectedConnector ? (
              <SuccessHandshake platformName={selectedConnector.displayName} />
            ) : isFinalStep ? (
              <div className="flex shrink-0 items-center gap-5">
                <p className="text-[13px] font-bold text-[#2878ff]">أنت على وشك إنشاء التكامل!</p>
                <div className="flex size-24 shrink-0 items-center justify-center rounded-[20px] bg-white shadow-[0_8px_24px_rgba(11,23,56,0.08)]">
                  <span className="flex size-14 items-center justify-center rounded-full bg-[#1fa85c] text-white">
                    <Check className="size-8" strokeWidth={3} />
                  </span>
                </div>
              </div>
            ) : (
              <HeroConstellation />
            )}
          </div>
        </div>

        {renderStepper()}
      </div>
    )
  }

  const renderPlatformStep = () => (
    <div className="space-y-5">
      {/* RTL: the chips are written first so they land on the right, search on the left. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {PLATFORM_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={cn(
                "cursor-pointer rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40",
                selectedCategory === category
                  ? "bg-[#2878ff] text-white shadow-[0_4px_12px_rgba(40,120,255,0.28)]"
                  : "border border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
              )}
              onClick={() => setSelectedCategory(category)}
            >
              {CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>

        <AppInput
          value={platformSearch}
          onChange={(event) => setPlatformSearch(event.target.value)}
          placeholder="ابحث عن منصة..."
          aria-label="ابحث عن منصة"
          startIcon={<Search className="size-4 text-[#95a4bd]" />}
          wrapperClassName="w-full md:w-[262px]"
          className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738] placeholder:text-[#95a4bd]"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className={cn("text-[15px] font-extrabold", PAGE_TEXT)}>المنصات المتاحة</h2>
        <span className={cn("text-[11.5px]", MUTED_TEXT)}>{filteredConnectors.length} منصة</span>
      </div>

      {filteredConnectors.length === 0 ? (
        <div className={cn(PANEL_CLASS, "px-5 py-10 text-center text-[13px]", MUTED_TEXT)}>
          لا توجد منصة مطابقة لبحثك.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredConnectors.map((connector) => {
            const details = PLATFORM_DETAILS[connector.displayName]
            const category = getCategoryForConnector(connector.displayName)
            const selected = connector.connectorDefinitionId === selectedConnectorDefinitionId
            const description =
              PLATFORM_DESCRIPTION_AR[connector.displayName] ?? details?.description ?? ""

            return (
              <button
                key={connector.connectorDefinitionId}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "group flex h-full cursor-pointer flex-col rounded-[14px] border bg-white p-4 text-right transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40",
                  selected
                    ? "border-[#2878ff] shadow-[0_0_0_3px_rgba(40,120,255,0.12)]"
                    : "border-[#e1e7f0] hover:border-[#c4d5f0] hover:shadow-[0_8px_20px_rgba(11,23,56,0.07)]"
                )}
                onClick={() => handlePlatformToggle(connector.connectorDefinitionId)}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ConnectorLogo
                      platformName={connector.displayName}
                      className="size-10 shrink-0 rounded-[10px] border border-[#eef2f8] bg-white p-1.5"
                    />
                    {/* Wraps rather than truncates: at four-up "Google Analytics 4" clipped
                        to "...Analytics 4", and RTL puts the ellipsis on the leading edge. */}
                    <p className={cn("text-[13px] font-bold leading-[18px]", PAGE_TEXT)}>
                      {connector.displayName}
                    </p>
                  </div>
                  {selected ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#2878ff] text-white">
                      <Check className="size-3" />
                    </span>
                  ) : (
                    <ChevronLeft className="size-4 shrink-0 text-[#c0cbdc]" />
                  )}
                </div>

                <p className={cn("mt-3 text-[11.5px] leading-[19px]", MUTED_TEXT)}>{description}</p>

                <div className="mt-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                      CATEGORY_TAG_CLASS[category]
                    )}
                  >
                    {CATEGORY_LABELS[category]}
                  </span>
                </div>

                {/* A span, not a nested button: the whole card is already the click target. */}
                <span
                  className={cn(
                    "mt-auto flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-[12.5px] font-semibold transition-colors",
                    selected
                      ? "border-[#2878ff] bg-[#2878ff] text-white"
                      : "border-[#e1e7f0] bg-white text-[#0b1738] group-hover:border-[#2878ff] group-hover:text-[#2878ff]"
                  )}
                >
                  {selected ? "المنصة المختارة" : "ربط الآن"}
                  <Link2 className="size-3.5" />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // The platform header that opens the main card on steps two to four.
  const renderPlatformHeader = ({
    trailing = null,
    statusPill = null,
    sub = null,
    namePrefix = "",
  }: {
    trailing?: ReactNode
    statusPill?: ReactNode
    sub?: ReactNode
    namePrefix?: string
  }) => {
    if (!selectedConnector) {
      return null
    }

    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ConnectorLogo
            platformName={selectedConnector.displayName}
            className="size-12 shrink-0 rounded-full border border-[#eef2f8] bg-white p-2"
          />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className={cn("text-[16px] font-extrabold", PAGE_TEXT)}>
                {namePrefix}
                {selectedConnector.displayName}
              </p>
              {statusPill}
            </div>
            {sub}
          </div>
        </div>
        {trailing}
      </div>
    )
  }

  const changePlatformButton = (
    <AppButton
      variant="outline"
      className={cn(
        "h-9 rounded-[10px] border-[#e1e7f0] bg-white px-3.5 text-[12px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
        WIZARD_INTERACTION_CLASS
      )}
      icon={<RefreshCcw className="size-3.5" />}
      iconPosition="end"
      onClick={() => setStepIndex(0)}
    >
      تغيير المنصة
    </AppButton>
  )

  const renderConnectStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return (
        <div className={cn(PANEL_CLASS, "space-y-3 p-6 text-center")}>
          <CircleAlert className="mx-auto size-10 text-[#95a4bd]" />
          <h3 className={cn("text-[16px] font-extrabold", PAGE_TEXT)}>اختر منصة أولاً</h3>
          <p className={cn("text-[12.5px]", MUTED_TEXT)}>
            اختر منصة في الخطوة السابقة لبدء عملية التفويض عبر OAuth.
          </p>
        </div>
      )
    }

    const category = getCategoryForConnector(selectedConnector.displayName)

    return (
      <div className={cn(PANEL_CLASS, "space-y-5 p-5 md:p-6")}>
        {renderPlatformHeader({
          sub: (
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                CATEGORY_TAG_CLASS[category]
              )}
            >
              {CATEGORY_SINGULAR[category]}
            </span>
          ),
        })}

        {flowStatus !== "idle" ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#c9dcff] bg-[#eef4ff] px-4 py-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-[#2878ff]" />
            <p className="text-[12.5px] font-semibold text-[#2878ff]">
              {LOADING_STAGES[flowStatus as Exclude<FlowStatus, "idle" | "finalizing">]}
            </p>
          </div>
        ) : null}

        <div className="rounded-[12px] border border-[#e1e7f0] p-5">
          <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>معلومات OAuth</h3>
          <p className={cn("mt-3 text-[12.5px] leading-6", MUTED_TEXT)}>
            قم بتسجيل الدخول إلى متجرك ومنح مدار الصلاحيات المطلوبة.
          </p>
          <p className={cn("text-[12.5px] leading-6", MUTED_TEXT)}>
            سيتم تحويلك إلى {selectedConnector.displayName} لإتمام التفويض بشكل آمن.
          </p>

          {selectedConnector.connectorId === "shopify" ? (
            <div className="mt-4 space-y-2">
              <AppInput
                label="نطاق المتجر"
                placeholder="your-store.myshopify.com"
                value={shopDomain}
                onChange={(event) => setShopDomain(event.target.value)}
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
              />
              <p className={cn("text-[11px] leading-5", MUTED_TEXT)}>
                أدخل معرّف متجر شوبيفاي أو نطاق myshopify.com كاملاً.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-[#f2f6fd] px-3.5 py-3">
            <Lock className="size-3.5 shrink-0 text-[#6b7b96]" />
            <p className={cn("text-[11.5px]", MUTED_TEXT)}>
              نستخدم بروتوكول OAuth 2.0 الآمن ولا يتم تخزين كلمات المرور.
            </p>
          </div>
        </div>

        <AppButton
          className={cn(
            "h-12 w-full rounded-[12px] bg-[#2878ff] text-[14px] font-extrabold text-white hover:bg-[#1f66e0]",
            WIZARD_INTERACTION_CLASS
          )}
          disabled={flowStatus !== "idle"}
          icon={<ExternalLink className="size-4" />}
          iconPosition="end"
          onClick={() => void beginOAuthFlow()}
        >
          الاتصال بـ {selectedConnector.displayName}
        </AppButton>

        <div className="rounded-[12px] border border-[#dbe6f8] bg-[#f2f7ff] p-5">
          <h4 className={cn("text-[13px] font-extrabold", PAGE_TEXT)}>معلومة مهمة</h4>
          <p className={cn("mt-2.5 text-[12px] leading-6", MUTED_TEXT)}>
            نحن لا نقوم بتخزين بيانات تسجيل الدخول الخاصة بك.
          </p>
          <p className={cn("text-[12px] leading-6", MUTED_TEXT)}>
            جميع الاتصالات تتم عبر OAuth الآمن.
          </p>
        </div>

        {/* Not in the export, but dropping it would remove the only route to a manual
            credential setup, so it stays as a collapsed escape hatch. */}
        <details className="group rounded-[12px] border border-[#e1e7f0] px-4 py-3">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between gap-3 text-[12.5px] font-semibold outline-none",
              PAGE_TEXT
            )}
          >
            <span>إعداد متقدّم</span>
            <ChevronRight className="size-4 text-[#95a4bd] transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:-rotate-90" />
          </summary>
          <div className="mt-4 space-y-3">
            <AppInput
              label="مفتاح API"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
            />
            <AppInput
              label="المفتاح السري"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
            />
            <AppInput
              label="بيانات اعتماد يدوية"
              value={manualCredentials}
              onChange={(event) => setManualCredentials(event.target.value)}
              className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
            />
            <button
              type="button"
              className={cn(
                "rounded-full border px-3.5 py-2 text-[11.5px] font-semibold",
                WIZARD_INTERACTION_CLASS,
                setupMode === "manual"
                  ? "border-[#2878ff] bg-[#eef4ff] text-[#2878ff]"
                  : "border-[#e1e7f0] bg-white text-[#5b6b85]"
              )}
              onClick={() => setSetupMode((current) => (current === "oauth" ? "manual" : "oauth"))}
            >
              {setupMode === "oauth" ? "التبديل إلى الإعداد اليدوي" : "استخدام OAuth فقط"}
            </button>
          </div>
        </details>
      </div>
    )
  }

  const renderImportStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return null
    }

    const presets: Array<{ id: SyncPreset; label: string }> = [
      { id: "all", label: "الكل" },
      { id: "recommended", label: "مقترح" },
      { id: "custom", label: "مخصص" },
    ]

    return (
      <div className={cn(PANEL_CLASS, "space-y-5 p-5 md:p-6")}>
        {renderPlatformHeader({
          trailing: changePlatformButton,
          statusPill: (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f8ef] px-2.5 py-1 text-[10.5px] font-semibold text-[#1f9d55]">
              <span className="size-1.5 rounded-full bg-[#1f9d55]" />
              متصل
            </span>
          ),
          sub: (
            <p className={cn("text-[11.5px]", MUTED_TEXT)}>
              {CATEGORY_SINGULAR[getCategoryForConnector(selectedConnector.displayName)]}
            </p>
          ),
        })}

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1.5">
              <h3 className={cn("text-[17px] font-extrabold", PAGE_TEXT)}>
                اختر البيانات المراد استيرادها
              </h3>
              <p className={cn("text-[12.5px] leading-6", MUTED_TEXT)}>
                يمكنك اختيار مجموعة مقترحة، أو تحديد البيانات حسب احتياجك.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1 rounded-[10px] bg-[#f2f5fa] p-1">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "cursor-pointer rounded-[8px] px-4 py-2 text-[12px] font-semibold transition-colors",
                    syncPreset === preset.id
                      ? "bg-white text-[#0b1738] shadow-[0_1px_3px_rgba(11,23,56,0.12)]"
                      : "text-[#6b7b96] hover:text-[#0b1738]"
                  )}
                  onClick={() =>
                    preset.id === "custom" ? setSyncPreset("custom") : selectPreset(preset.id)
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {allObjects.map((object) => {
              const selected = selectedObjectsSet.has(object)
              const meta = objectPresentation(object)
              const Icon = meta.icon

              return (
                <button
                  key={object}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "cursor-pointer rounded-[12px] border p-4 text-right transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2878ff]/40",
                    selected
                      ? cn(meta.border, meta.fill)
                      : "border-[#e1e7f0] bg-white hover:border-[#c4d5f0]"
                  )}
                  onClick={() => toggleObjectSelection(object)}
                >
                  {/* RTL: the icon is written first so it lands on the right, with the
                      checkbox opposite it, as in the export. */}
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                        selected ? "bg-white/70" : meta.fill
                      )}
                    >
                      <Icon className={cn("size-[18px] shrink-0", meta.tint)} />
                    </span>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
                        selected
                          ? cn("border-transparent text-white", meta.check)
                          : "border-[#cfd9e8] bg-white"
                      )}
                    >
                      {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                  </div>
                  <p className={cn("mt-3 text-[13.5px] font-extrabold", PAGE_TEXT)}>{meta.label}</p>
                  <p className={cn("mt-1 text-[11.5px] leading-5", MUTED_TEXT)}>
                    {meta.description}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e1e7f0] bg-[#f8fafd] px-4 py-3">
            <Info className="size-4 shrink-0 text-[#95a4bd]" />
            <p className={cn("text-[11.5px]", MUTED_TEXT)}>
              سيتم استيراد البيانات التاريخية المتاحة من حسابك في {selectedConnector.displayName}
            </p>
          </div>
        </div>

        {discoveredProviderAccounts.length > 1 ? (
          <div className="space-y-3 border-t border-[#eef2f8] pt-5">
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>بأي حساب تريد ربط مدار؟</h3>
            <div className="flex flex-wrap gap-2">
              {discoveredProviderAccounts.map((account) => {
                const selected = selectedAccountId === account.id
                return (
                  <button
                    key={account.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[12.5px] font-semibold",
                      WIZARD_INTERACTION_CLASS,
                      selected
                        ? "border-[#2878ff] bg-[#eef4ff] text-[#2878ff]"
                        : "border-[#e1e7f0] bg-white text-[#5b6b85]"
                    )}
                    onClick={() => setSelectedAccountId(account.id)}
                  >
                    {account.label}
                    {selected ? <Check className="size-3.5" /> : null}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3.5 border-t border-[#eef2f8] pt-5 md:grid-cols-3">
          {[
            {
              label: "تكرار المزامنة",
              value: selectedConnectorDetails.syncFrequency,
              icon: RefreshCcw,
              tint: "text-[#2878ff]",
            },
            {
              label: "المدة المتوقعة",
              value: selectedConnectorDetails.estimatedDuration,
              icon: Calendar,
              tint: "text-[#1f9d55]",
            },
            {
              label: "الإعداد المسبق",
              value:
                syncPreset === "custom"
                  ? "بيانات مخصصة"
                  : syncPreset === "all"
                    ? "جميع البيانات المحددة"
                    : "المجموعة المقترحة",
              icon: Layers,
              tint: "text-[#8b5cf6]",
            },
          ].map((tile) => (
            <div
              key={tile.label}
              className="flex items-center gap-3 rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] px-4 py-3.5"
            >
              <tile.icon className={cn("size-[18px] shrink-0", tile.tint)} />
              <div className="min-w-0">
                <p className={cn("text-[11px]", MUTED_TEXT)}>{tile.label}</p>
                <p className={cn("mt-0.5 text-[13px] font-extrabold", PAGE_TEXT)}>{tile.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderReviewStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return null
    }

    const detailCells = [
      { label: "الحساب", value: selectedAccount.label, icon: Users, tint: "text-[#2878ff]" },
      { label: "مساحة العمل", value: workspaceLabel, icon: Layers, tint: "text-[#8b5cf6]" },
      {
        label: "المنصة",
        value: selectedConnector.displayName,
        icon: Link2,
        tint: "text-[#1f9d55]",
      },
      {
        label: "نوع الربط",
        value: selectedConnectorDetails.connectionType,
        icon: Link2,
        tint: "text-[#2878ff]",
      },
      {
        label: "طريقة المصادقة",
        value: selectedConnectorDetails.authMethod,
        icon: ShieldCheck,
        tint: "text-[#1f9d55]",
      },
      {
        label: "معدل المزامنة",
        value: selectedConnectorDetails.syncFrequency,
        icon: RefreshCcw,
        tint: "text-[#e08b00]",
      },
    ]

    return (
      <div className="space-y-4">
        <div className={cn(PANEL_CLASS, "p-5")}>
          {renderPlatformHeader({
            trailing: changePlatformButton,
            namePrefix: "منصة ",
            statusPill: (
              <span className="inline-flex rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10.5px] font-semibold text-[#2878ff]">
                جاهز للربط
              </span>
            ),
            sub: (
              <p className={cn("text-[11.5px]", MUTED_TEXT)}>
                {CATEGORY_SINGULAR[getCategoryForConnector(selectedConnector.displayName)]}
              </p>
            ),
          })}
        </div>

        <div className={cn(PANEL_CLASS, "p-5")}>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-[#6b7b96]" />
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>تفاصيل الربط</h3>
          </div>
          <p className={cn("mt-2 text-[12px] leading-6", MUTED_TEXT)}>
            جميع الإعدادات التي قمت باختيارها سنُستخدم لإنشاء التكامل.
          </p>

          <div className="mt-4 grid overflow-hidden rounded-[10px] border border-[#eef2f8] sm:grid-cols-2 lg:grid-cols-3">
            {detailCells.map((cell) => (
              <div
                key={cell.label}
                className="border-b border-s border-[#eef2f8] px-4 py-3.5 last:border-b-0 [&:nth-child(-n+3)]:lg:border-b [&:nth-child(3n)]:lg:border-s-0"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <p className={cn("text-[11px]", MUTED_TEXT)}>{cell.label}</p>
                  <cell.icon className={cn("size-3.5", cell.tint)} />
                </div>
                <p className={cn("mt-1.5 text-[13px] font-extrabold", PAGE_TEXT)}>{cell.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(PANEL_CLASS, "p-5")}>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-[#6b7b96]" />
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
              البيانات المحددة للاستيراد
            </h3>
          </div>
          <p className={cn("mt-2 text-[12px]", MUTED_TEXT)}>
            سيتم استيراد البيانات التالية من {selectedConnector.displayName}:
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {selectedObjects.map((object) => {
              const meta = objectPresentation(object)
              return (
                <span
                  key={object}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold",
                    meta.border,
                    meta.fill,
                    meta.tint
                  )}
                >
                  {meta.label}
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-[#e1e7f0] bg-[#f8fafd] px-4 py-3">
            <Info className="size-4 shrink-0 text-[#95a4bd]" />
            <p className={cn("text-[11.5px] leading-5", MUTED_TEXT)}>
              ستبدأ المزامنة الأولى بعد إنشاء التكامل مباشرة، وسيتم تحديث البيانات حسب المعدل
              المحدد.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderSuccessStep = () => {
    if (!selectedConnector) {
      return null
    }

    // RTL: the first tile lands rightmost, which is where the export puts health monitoring.
    const tiles = [
      {
        label: "مراقبة الصحة",
        value: healthMonitoringEnabled ? "مفعلة" : "معطلة",
        icon: Activity,
      },
      {
        label: "المزامنة التلقائية",
        value: autoSyncEnabled ? "مفعلة" : "معطلة",
        icon: RefreshCcw,
      },
      {
        label: "المزامنة الأولى المتوقعة",
        value: selectedConnectorDetails?.estimatedDuration ?? "1 – 2 دقيقة",
        icon: Calendar,
      },
    ]

    return (
      <div className={cn(PANEL_CLASS, "relative overflow-hidden p-6 md:p-10")}>
        <Confetti />

        <div className="relative space-y-6">
          <div className="space-y-3 text-center">
            <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-[#3fb37f] text-white shadow-[0_10px_30px_rgba(63,179,127,0.32)]">
              <Check className="size-10" strokeWidth={3} />
            </span>
            <h3 className={cn("text-[22px] font-extrabold", PAGE_TEXT)}>
              تم ربط منصة {selectedConnector.displayName} بنجاح
            </h3>
            <p className={cn("mx-auto max-w-lg text-[13px] leading-6", MUTED_TEXT)}>
              أصبح بإمكان مدار الآن استيراد بياناتك ومزامنتها تلقائياً.
            </p>
          </div>

          <div className="grid gap-3.5 md:grid-cols-3">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] px-4 py-5 text-center"
              >
                <tile.icon className="mx-auto size-[18px] text-[#5b6b85]" />
                <p className={cn("mt-2.5 text-[11.5px]", MUTED_TEXT)}>{tile.label}</p>
                <p className={cn("mt-1 text-[14px] font-extrabold", PAGE_TEXT)}>{tile.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e1e7f0] bg-[#f8fafd] px-4 py-3">
            <Info className="size-4 shrink-0 text-[#95a4bd]" />
            <p className={cn("text-[11.5px] leading-5", MUTED_TEXT)}>
              سيبدأ استيراد البيانات الأولى خلال دقائق قليلة، وسيتم تحديث البيانات تلقائياً حسب
              الجدول المحدد.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderSyncingStep = () => {
    if (!selectedConnector) {
      return null
    }

    const isRunning = syncPhase === "running"
    const isFailed = syncPhase === "failed"
    const objects = selectedObjects.length > 0 ? selectedObjects : allObjects

    const totals = syncOutcome
      ? [
          { label: "سجلات مقروءة", value: formatCount(syncOutcome.recordsRead) },
          { label: "سجلات محفوظة", value: formatCount(syncOutcome.recordsWritten) },
          { label: "سجلات فاشلة", value: formatCount(syncOutcome.recordsFailed) },
        ]
      : []

    return (
      <div className="space-y-4">
        <div className={cn(PANEL_CLASS, "p-5")}>
          {renderPlatformHeader({
            namePrefix: "منصة ",
            statusPill: (
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                  isRunning
                    ? "bg-[#eef4ff] text-[#2878ff]"
                    : isFailed
                      ? "bg-[#fdeeee] text-[#e0484d]"
                      : "bg-[#e9f8ef] text-[#1f9d55]"
                )}
              >
                {isRunning ? "جاري المزامنة" : isFailed ? "تعذّرت المزامنة" : "اكتملت المزامنة"}
              </span>
            ),
            sub: (
              <p className={cn("text-[11.5px]", MUTED_TEXT)}>
                {CATEGORY_SINGULAR[getCategoryForConnector(selectedConnector.displayName)]}
              </p>
            ),
          })}
        </div>

        <div className={cn(PANEL_CLASS, "space-y-4 p-5 md:p-6")}>
          {/* RTL: the elapsed clock is written first so it sits on the right, with the
              run's state opposite it, as in the export. The export's headline is a
              percentage; runSync reports no progress until it resolves, so the clock --
              which is real -- takes that slot instead of a number we cannot measure. */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                className={cn(
                  "text-[32px] font-extrabold leading-none",
                  isFailed ? "text-[#e0484d]" : "text-[#2878ff]"
                )}
              >
                {formatElapsed(
                  isRunning ? syncElapsedMs : (syncOutcome?.durationMs ?? syncElapsedMs)
                )}
              </p>
              <p className={cn("mt-2 text-[12px]", MUTED_TEXT)}>
                {isRunning
                  ? `جاري مزامنة بيانات ${selectedConnector.displayName}...`
                  : isFailed
                    ? (syncError ?? "تعذّر إكمال المزامنة.")
                    : "اكتملت المزامنة الأولى."}
              </p>
            </div>

            <div className="text-end">
              <div className="flex items-center justify-end gap-2">
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin text-[#2878ff]" />
                ) : isFailed ? (
                  <CircleAlert className="size-4 text-[#e0484d]" />
                ) : (
                  <Check className="size-4 text-[#1f9d55]" strokeWidth={3} />
                )}
                <p
                  className={cn(
                    "text-[12.5px] font-bold",
                    isRunning ? "text-[#2878ff]" : isFailed ? "text-[#e0484d]" : "text-[#1f9d55]"
                  )}
                >
                  {isRunning
                    ? "المزامنة قيد التنفيذ"
                    : isFailed
                      ? "توقفت المزامنة"
                      : "المزامنة مكتملة"}
                </p>
              </div>
              <p className={cn("mt-1.5 text-[11.5px]", MUTED_TEXT)}>
                الوقت المنقضي:{" "}
                {formatElapsedWords(
                  isRunning ? syncElapsedMs : (syncOutcome?.durationMs ?? syncElapsedMs)
                )}
              </p>
            </div>
          </div>

          {/* Indeterminate while running: the connector reports no percentage to fill. */}
          <div className="madar-sync-track h-2 rounded-full bg-[#eef2f8]">
            {isRunning ? (
              <div className="madar-sync-bar bg-gradient-to-l from-[#2878ff] to-[#5aa9f8]" />
            ) : (
              <div
                className={cn(
                  "h-full w-full rounded-full",
                  isFailed ? "bg-[#e0484d]" : "bg-[#1fa85c]"
                )}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[#eef2f8] pt-4">
            {objects.map((object) => {
              const meta = objectPresentation(object)
              return (
                <span
                  key={object}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold",
                    meta.border,
                    meta.fill,
                    meta.tint
                  )}
                >
                  {meta.label}
                  {isRunning ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isFailed ? (
                    <CircleAlert className="size-3" />
                  ) : (
                    <Check className="size-3" strokeWidth={3} />
                  )}
                </span>
              )
            })}
          </div>
        </div>

        <div className={cn(PANEL_CLASS, "p-5 md:p-6")}>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-[#6b7b96]" />
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>تفاصيل البيانات</h3>
          </div>
          <p className={cn("mt-2 text-[12px] leading-6", MUTED_TEXT)}>
            {`يمكنك متابعة حالة البيانات التي يتم استيرادها من ${selectedConnector.displayName}.`}
          </p>

          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {objects.map((object) => {
              const meta = objectPresentation(object)
              const Icon = meta.icon
              return (
                <div key={object} className="rounded-[12px] border border-[#e1e7f0] p-4">
                  {/* RTL: the icon is written first so it lands on the right. */}
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                        meta.fill
                      )}
                    >
                      <Icon className={cn("size-[18px] shrink-0", meta.tint)} />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[10.5px] font-semibold",
                        isRunning
                          ? "bg-[#eef4ff] text-[#2878ff]"
                          : isFailed
                            ? "bg-[#fdeeee] text-[#e0484d]"
                            : "bg-[#e9f8ef] text-[#1f9d55]"
                      )}
                    >
                      {isRunning ? "جاري" : isFailed ? "متوقف" : "مكتمل"}
                    </span>
                  </div>
                  <p className={cn("mt-3 text-[13px] font-extrabold", PAGE_TEXT)}>{meta.label}</p>
                  <div className="madar-sync-track mt-3 h-1.5 rounded-full bg-[#eef2f8]">
                    {isRunning ? (
                      <div className="madar-sync-bar bg-[#2878ff]" />
                    ) : (
                      <div
                        className={cn(
                          "h-full w-full rounded-full",
                          isFailed ? "bg-[#e0484d]" : "bg-[#1fa85c]"
                        )}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Per-object counts are not reported; the run's own totals are, so they are
              shown once, here, rather than split across tiles as invented shares. */}
          {totals.length > 0 ? (
            <div className="mt-4 grid gap-3.5 border-t border-[#eef2f8] pt-4 sm:grid-cols-3">
              {totals.map((total) => (
                <div
                  key={total.label}
                  className="rounded-[12px] border border-[#eef2f8] bg-[#fafbfe] px-4 py-3.5 text-center"
                >
                  <p className={cn("text-[11px]", MUTED_TEXT)}>{total.label}</p>
                  <p className={cn("mt-1 text-[15px] font-extrabold", PAGE_TEXT)}>{total.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2.5 rounded-[10px] border border-[#e1e7f0] bg-[#f8fafd] px-4 py-3">
            <Info className="size-4 shrink-0 text-[#95a4bd]" />
            <p className={cn("text-[11.5px] leading-5", MUTED_TEXT)}>
              سيتم تحديث البيانات تلقائياً حسب الجدول المحدد بعد اكتمال هذه المزامنة.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderErrorCard = () => {
    if (!errorState) {
      return null
    }

    return (
      <AppCard className="border border-rose-200 bg-rose-500/10 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-600">
            <CircleAlert className="size-5" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-rose-700/80">خطأ في الاتصال</p>
              <h3 className="mt-1 text-lg font-semibold text-rose-900">{errorState.title}</h3>
              <p className="mt-1 text-sm text-rose-800">{errorState.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppButton
                className={cn(
                  "h-10 rounded-xl px-4",
                  WIZARD_INTERACTION_CLASS,
                  "hover:border-primary/40 hover:bg-primary/90 hover:shadow-lg"
                )}
                onClick={handleRetry}
              >
                إعادة المحاولة
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={goToImportStep}
              >
                العودة إلى إعداد الاستيراد
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={handlePreviousClick}
              >
                رجوع
              </AppButton>
            </div>
          </div>
        </div>
      </AppCard>
    )
  }

  const renderStepContent = () => {
    if (errorState) {
      return renderErrorCard()
    }

    if (stepIndex === 0) return renderPlatformStep()
    if (stepIndex === 1) return renderConnectStep()
    if (stepIndex === 2) return renderImportStep()
    if (stepIndex === 3) {
      if (syncPhase !== "idle") return renderSyncingStep()
      return isSuccess ? renderSuccessStep() : renderReviewStep()
    }
    return renderSuccessStep()
  }

  const footerPrimaryLabel =
    stepIndex === 0
      ? `المتابعة إلى ${selectedConnector?.displayName ?? "المنصة"}`
      : stepIndex === 1
        ? "المتابعة"
        : stepIndex === 2
          ? "مراجعة الإعدادات"
          : stepIndex === 3
            ? "إنشاء التكامل"
            : "متابعة"

  const footerPrimaryAction =
    stepIndex === 1 ? beginOAuthFlow : stepIndex === 3 ? finalizeConnection : handleContinue

  const footerPrimaryDisabled =
    flowStatus !== "idle" ||
    isContinueDisabled ||
    isSuccess ||
    (stepIndex === 1 && !selectedConnector) ||
    (stepIndex === 3 && !draftConnectionId)

  if (!currentWorkspace) {
    return (
      <AppPage>
        <AppContainer>
          <AppSection>
            <AppCard
              title="Create your first workspace before adding connections."
              subtitle="Connection onboarding now requires an active workspace context."
              state="empty"
              className={SURFACE_CARD_CLASS}
            >
              <div className="pt-2">
                <WorkspaceSelector
                  triggerLabel="Create Workspace"
                  triggerAriaLabel="Create workspace from workspace manager"
                />
              </div>
            </AppCard>
          </AppSection>
        </AppContainer>
      </AppPage>
    )
  }

  if (currentWorkspace.status === "archived") {
    return (
      <AppPage>
        <AppContainer>
          <AppSection>
            <AppCard
              title="This workspace is archived."
              subtitle="Restore it to add or reconnect integrations. All syncing stays paused until then."
              state="empty"
              className={SURFACE_CARD_CLASS}
            >
              <div className="pt-2">
                <WorkspaceSelector
                  triggerLabel="Manage Workspaces"
                  triggerAriaLabel="Open workspace manager"
                />
              </div>
            </AppCard>
          </AppSection>
        </AppContainer>
      </AppPage>
    )
  }

  const sidebarBenefits = [
    "ربط سريع وآمن عبر OAuth",
    "مزامنة تلقائية للبيانات",
    "رؤى موحدة في مكان واحد",
    "لا حاجة إلى إدخال بيانات يدوياً",
  ]

  // The rail that replaces the step-one benefits list once the flow is under way.
  const renderSetupChecklist = () => (
    <div className={cn(PANEL_CLASS, "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
          {stepIndex === 3 ? "قائمة الإعداد" : "خطوات الإعداد"}
        </h3>
        {isSuccess && syncPhase === "idle" ? (
          <Check className="size-4 text-[#1f9d55]" strokeWidth={3} />
        ) : null}
      </div>
      <ul className="mt-4 space-y-3.5">
        {WIZARD_STEPS.map((step, index) => {
          const state =
            isSuccess && syncPhase === "idle" ? "done" : currentStepState(index as WizardStep)
          return (
            <li key={step.label} className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "text-[12.5px] font-semibold",
                  state === "done"
                    ? "text-[#1f9d55]"
                    : state === "active"
                      ? "text-[#2878ff]"
                      : "text-[#95a4bd]"
                )}
              >
                {step.label}
              </span>
              {state === "done" ? (
                <Check className="size-4 shrink-0 text-[#1f9d55]" strokeWidth={3} />
              ) : (
                <span
                  className={cn(
                    "text-[12px] font-bold",
                    state === "active" ? "text-[#2878ff]" : "text-[#b6c2d4]"
                  )}
                >
                  {index + 1}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )

  // The export puts a "تواصل مع الدعم" link here. The app has no support route or address
  // to point it at, so the card carries its copy without a link that would go nowhere.
  const renderHelpCard = () => (
    <div className={cn(PANEL_CLASS, "p-5")}>
      <div className="flex items-center gap-2">
        <HelpCircle className="size-4 text-[#2878ff]" />
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>هل تحتاج إلى مساعدة؟</h3>
      </div>
      <p className={cn("mt-2.5 text-[12px] leading-[21px]", MUTED_TEXT)}>
        فريق الدعم جاهز لمساعدتك في أي وقت.
      </p>
    </div>
  )

  const renderConnectionSummaryRail = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return null
    }

    const rows = [
      { label: "المنصة", value: selectedConnector.displayName },
      { label: "طريقة المصادقة", value: selectedConnectorDetails.authMethod },
      { label: "مساحة العمل", value: workspaceLabel },
      { label: "نوع الحساب", value: selectedAccount.label },
      {
        label: "الصلاحيات المطلوبة",
        value: selectedConnectorDetails.permissions
          .map((permission) => objectPresentation(permission).label)
          .join("، "),
      },
      { label: "المدة المتوقعة للإعداد", value: "‏~30 ثانية" },
      { label: "أول مزامنة متوقعة", value: selectedConnectorDetails.estimatedDuration },
    ]

    return (
      <div className={cn(PANEL_CLASS, "p-5")}>
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>ملخص الاتصال</h3>
        <dl className="mt-2 divide-y divide-[#eef2f8]">
          {rows.map((row) => (
            <div key={row.label} className="py-3.5">
              <dt className={cn("text-[11px]", MUTED_TEXT)}>{row.label}</dt>
              <dd className={cn("mt-1 text-[12.5px] font-extrabold", PAGE_TEXT)}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  const gridClassName =
    stepIndex === 0
      ? "lg:grid-cols-[minmax(0,1fr)_286px]"
      : stepIndex === 1
        ? "lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_272px]"
        : "lg:grid-cols-[268px_minmax(0,1fr)]"

  return (
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir="rtl">
      <div className="mx-auto w-full max-w-[1360px] space-y-5">
        {renderTopProgress()}

        {/* RTL: grid columns run right to left, so the first child is the right-hand rail. */}
        <div className={cn("grid gap-5", gridClassName)}>
          {stepIndex === 0 ? (
            <>
              <div>{renderStepContent()}</div>
              <aside className="space-y-4">
                <div className={cn(PANEL_CLASS, "p-5 lg:sticky lg:top-5")}>
                  <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>ماذا ستحصل؟</h3>
                  <ul className="mt-4 space-y-3.5">
                    {sidebarBenefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-px size-4 shrink-0 text-[#1f9d55]" />
                        <span className={cn("text-[12px] leading-5", MUTED_TEXT)}>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={cn(PANEL_CLASS, "p-5")}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="size-4 text-[#2878ff]" />
                    <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
                      بحاجة إلى مساعدة؟
                    </h3>
                  </div>
                  {/* The export puts a "عرض الدليل" button here. There is no docs route in
                      the app yet, so the card carries the copy only for now. */}
                  <p className={cn("mt-2.5 text-[12px] leading-[21px]", MUTED_TEXT)}>
                    تعرّف على كيفية ربط المنصات وما الذي تتم مزامنته في كل خطوة، أو تواصل مع فريق
                    الدعم إذا واجهتك مشكلة أثناء الربط.
                  </p>
                </div>
              </aside>
            </>
          ) : (
            <>
              <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
                {renderSetupChecklist()}
                {stepIndex === 1 ? null : renderHelpCard()}
              </aside>

              <div>{renderStepContent()}</div>

              {stepIndex === 1 ? (
                <aside className="lg:sticky lg:top-5 lg:self-start">
                  {renderConnectionSummaryRail()}
                </aside>
              ) : null}
            </>
          )}
        </div>

        {/* RTL: the dismiss action is written first so it sits at the right-hand end,
            with the forward actions at the left, as in the export. */}
        <div className={cn(PANEL_CLASS, "px-4 py-3.5 md:px-5")}>
          {syncPhase !== "idle" ? (
            <div className="flex flex-wrap items-center gap-3">
              {/* The export labels this "إلغاء". The sync runs server-side and there is no
                  cancel API, so leaving the page cannot stop it -- the label says what the
                  button actually does rather than promising a cancellation. */}
              <AppButton
                variant="ghost"
                className={cn(
                  "h-10 rounded-[10px] px-4 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                onClick={goToConnections}
              >
                إغلاق
              </AppButton>

              <div className="flex-1" />

              {syncPhase === "failed" ? (
                <AppButton
                  className={cn(
                    "h-10 min-w-[170px] rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1f66e0]",
                    WIZARD_INTERACTION_CLASS
                  )}
                  disabled={isRunningFirstSync}
                  loading={isRunningFirstSync}
                  icon={<RefreshCcw className="size-4 shrink-0" />}
                  iconPosition="end"
                  onClick={() => void runFirstSync()}
                >
                  إعادة المحاولة
                </AppButton>
              ) : syncPhase === "done" ? (
                <AppButton
                  className={cn(
                    "h-10 min-w-[190px] rounded-[10px] bg-[#1fa85c] px-4 text-[12.5px] font-semibold text-white hover:bg-[#188a4a]",
                    WIZARD_INTERACTION_CLASS
                  )}
                  icon={<ArrowLeft className="size-4 shrink-0" />}
                  iconPosition="end"
                  onClick={goToConnections}
                >
                  الانتقال إلى التكاملات
                </AppButton>
              ) : null}
            </div>
          ) : isSuccess ? (
            <div className="flex flex-wrap items-center gap-3">
              <AppButton
                variant="ghost"
                className={cn(
                  "h-10 rounded-[10px] px-4 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                icon={<Check className="size-4 text-[#1f9d55]" strokeWidth={3} />}
                iconPosition="end"
                onClick={goToConnections}
              >
                إنهاء
              </AppButton>

              <div className="flex-1" />

              <AppButton
                variant="outline"
                className={cn(
                  "h-10 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                icon={<ArrowLeft className="size-4 shrink-0" />}
                iconPosition="start"
                onClick={goToConnections}
              >
                الانتقال إلى التكاملات
              </AppButton>
              <AppButton
                className={cn(
                  "h-10 min-w-[190px] rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-semibold text-white hover:bg-[#1f66e0]",
                  WIZARD_INTERACTION_CLASS
                )}
                disabled={isRunningFirstSync || !draftConnectionId}
                loading={isRunningFirstSync}
                icon={<PlayCircle className="size-4 shrink-0" />}
                iconPosition="end"
                onClick={() => void runFirstSync()}
              >
                تشغيل المزامنة الآن
              </AppButton>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <AppButton
                variant="ghost"
                className={cn(
                  "h-10 rounded-[10px] px-4 text-[12.5px] font-semibold text-[#6b7b96] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                onClick={exitWizard}
              >
                إلغاء
              </AppButton>

              <div className="flex-1" />

              <AppButton
                variant="outline"
                className={cn(
                  "h-10 min-w-[130px] rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                disabled={stepIndex === 0 || flowStatus !== "idle"}
                icon={<ArrowRight className="size-4 shrink-0" />}
                iconPosition="start"
                onClick={handlePreviousClick}
              >
                السابق
              </AppButton>
              <AppButton
                className={cn(
                  "h-10 min-w-[170px] rounded-[10px] px-4 text-[12.5px] font-semibold text-white",
                  stepIndex === 3
                    ? "bg-[#1fa85c] hover:bg-[#188a4a]"
                    : "bg-[#2878ff] hover:bg-[#1f66e0]",
                  WIZARD_INTERACTION_CLASS
                )}
                disabled={footerPrimaryDisabled}
                icon={
                  stepIndex === 3 ? (
                    <Check className="size-4 shrink-0" strokeWidth={3} />
                  ) : (
                    <ArrowLeft className="size-4 shrink-0" />
                  )
                }
                iconPosition="end"
                onClick={() => void footerPrimaryAction()}
              >
                {footerPrimaryLabel}
              </AppButton>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
