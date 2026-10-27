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
import { useLocale, useTranslations } from "next-intl"
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

import {
  AppButton,
  AppCard,
  AppContainer,
  AppDialog,
  AppInput,
  AppPage,
  AppSection,
} from "@/components/app"

import { getActiveApplications } from "@/features/applications"
import { useWorkspace, WorkspaceSelector } from "@/features/workspace"

import { useConnectionsCenter } from "../hooks"
import {
  appendConnectorAccount,
  CONNECTOR_CATALOG,
  getDefaultTimezone,
  loadStoredConnectionReferences,
  type SallaConnectIntentStatus,
  sallaMarketplaceInstallService,
  storeConnectionReferences,
} from "../services"
import { ConnectorLogo } from "./connector-logo"

import { useApplicationServices } from "@/application/context"
import { SURFACE_CARD_CLASS } from "@/components/design/dashboard-surface"
import { cairo } from "@/components/design/fonts"
import { type Locale, localeDirection } from "@/i18n/locales"

type PlatformCategory = "All" | "Marketing" | "Analytics" | "Ecommerce"
type WizardStep = 0 | 1 | 2 | 3

// Mirrors connection-action-policy.ts's IntegrationsTranslator / plan-tiers.ts's
// ApplicationsTranslator: the component owns the useTranslations() call and passes the
// translator into every module-level data+function below, rather than forking the data into
// a parallel Arabic-only copy.
type NewConnectionWizardTranslator = ReturnType<
  typeof useTranslations<"integrations.newConnectionWizard">
>

type SyncPreset = "recommended" | "all" | "custom"
type SetupMode = "oauth" | "manual"
type SyncPhase = "idle" | "running" | "done" | "failed"

// How long the Salla App Store install wait screen polls before giving up -- matches the
// connect-intent's own 10-min server-side TTL with slack to spare (see
// salla-marketplace-install.service.ts / SallaOAuthService.createConnectIntent).
const SALLA_WAIT_TIMEOUT_MS = 5 * 60 * 1000

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

// syncFrequency/estimatedDuration are semantic tokens, not display text -- connectionType is
// derived straight from `category` instead of being stored at all -- so the only three
// user-visible facts every connector carries here (connector type, sync cadence, first-sync
// estimate) are rendered through connectionTypeLabel()/syncFrequencyLabel()/
// estimatedDurationLabel() below rather than baked into this data as Arabic literals.
type SyncFrequencyToken = "every30Min" | "every15Min"
type EstimatedDurationToken = "oneToTwoMinutes" | "under90Seconds"

interface PlatformDetails {
  category: PlatformCategory
  description: string
  authMethod: string
  permissions: string[]
  capabilities: string[]
  accountLabel: string
  accountDescription: string
  resourceTypeLabel: string
  syncFrequency: SyncFrequencyToken
  estimatedDuration: EstimatedDurationToken
  recommendedObjects: string[]
  allObjects: string[]
  accounts: Array<{ id: string; label: string; description: string }>
}

function connectionTypeLabel(category: PlatformCategory, t: NewConnectionWizardTranslator): string {
  if (category === "Ecommerce") return t("connectionTypes.ecommerce")
  if (category === "Analytics") return t("connectionTypes.analytics")
  return t("connectionTypes.marketing")
}

function syncFrequencyLabel(token: SyncFrequencyToken, t: NewConnectionWizardTranslator): string {
  return token === "every30Min" ? t("syncFrequency.every30Min") : t("syncFrequency.every15Min")
}

function estimatedDurationLabel(
  token: EstimatedDurationToken,
  t: NewConnectionWizardTranslator
): string {
  return token === "oneToTwoMinutes"
    ? t("estimatedDuration.oneToTwoMinutes")
    : t("estimatedDuration.under90Seconds")
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

function wizardSteps(
  t: NewConnectionWizardTranslator
): Array<{ label: string; description: string }> {
  return [
    { label: t("steps.platform.label"), description: t("steps.platform.description") },
    { label: t("steps.connect.label"), description: t("steps.connect.description") },
    { label: t("steps.import.label"), description: t("steps.import.description") },
    { label: t("steps.review.label"), description: t("steps.review.description") },
  ]
}

function successHero(platformName: string, t: NewConnectionWizardTranslator) {
  return {
    title: t("successHero.title"),
    subtitle: t("successHero.subtitle", { platform: platformName }),
  }
}

// Per-step hero copy. Steps three and four retitle the page in the export rather than
// keeping the "ربط منصة جديدة" heading.
function heroCopy(t: NewConnectionWizardTranslator): Array<{ title: string; subtitle: string }> {
  return [
    { title: t("heroCopy.platform.title"), subtitle: t("heroCopy.platform.subtitle") },
    { title: t("heroCopy.connect.title"), subtitle: t("heroCopy.connect.subtitle") },
    { title: t("heroCopy.import.title"), subtitle: t("heroCopy.import.subtitle") },
    { title: t("heroCopy.review.title"), subtitle: t("heroCopy.review.subtitle") },
  ]
}

const PLATFORM_CATEGORIES: PlatformCategory[] = ["All", "Ecommerce", "Marketing", "Analytics"]

function categoryLabels(t: NewConnectionWizardTranslator): Record<PlatformCategory, string> {
  return {
    All: t("categories.all"),
    Ecommerce: t("categories.ecommerce"),
    Marketing: t("categories.marketing"),
    Analytics: t("categories.analytics"),
  }
}

// The platform header on steps two to four names the category in the singular.
function categorySingular(t: NewConnectionWizardTranslator): Record<PlatformCategory, string> {
  return {
    All: t("categorySingular.all"),
    Ecommerce: t("categorySingular.ecommerce"),
    Marketing: t("categorySingular.marketing"),
    Analytics: t("categorySingular.analytics"),
  }
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

function objectPresentation(name: string, t: NewConnectionWizardTranslator): ObjectPresentation {
  const entry = OBJECT_ICON_LIBRARY[name]
  const palette = OBJECT_TINTS[entry?.palette ?? "blue"]
  const key = OBJECT_KEY_BY_NAME[name]
  return {
    label: key ? t(`objectLibrary.${key}.label` as "objectLibrary.customers.label") : name,
    description: key
      ? t(`objectLibrary.${key}.description` as "objectLibrary.customers.description")
      : t("objectFallbackDescription"),
    icon: entry?.icon ?? Layers,
    ...palette,
  }
}

// Translation key for each sync object -- camelCased from the raw object identifier below.
const OBJECT_KEY_BY_NAME: Record<string, string> = {
  Customers: "customers",
  Orders: "orders",
  Products: "products",
  Inventory: "inventory",
  Catalog: "catalog",
  Traffic: "traffic",
  Events: "events",
  Conversions: "conversions",
  "Page Views": "pageViews",
  Funnels: "funnels",
  Campaigns: "campaigns",
  Ads: "ads",
  Audience: "audience",
  "Audience Insights": "audienceInsights",
  "Search Terms": "searchTerms",
  "Pixel Events": "pixelEvents",
}

const OBJECT_ICON_LIBRARY: Record<
  string,
  {
    icon: typeof Users
    palette: keyof typeof OBJECT_TINTS
  }
> = {
  Customers: { icon: Users, palette: "blue" },
  Orders: { icon: ShoppingCart, palette: "green" },
  Products: { icon: Package, palette: "purple" },
  Inventory: { icon: Layers, palette: "amber" },
  Catalog: { icon: Tag, palette: "red" },
  Traffic: { icon: BarChart3, palette: "teal" },
  Events: { icon: Activity, palette: "blue" },
  Conversions: { icon: Target, palette: "green" },
  "Page Views": { icon: Eye, palette: "purple" },
  Funnels: { icon: Filter, palette: "amber" },
  Campaigns: { icon: Megaphone, palette: "blue" },
  Ads: { icon: Layers, palette: "purple" },
  Audience: { icon: Users, palette: "teal" },
  "Audience Insights": { icon: BarChart3, palette: "teal" },
  "Search Terms": { icon: Search, palette: "amber" },
  "Pixel Events": { icon: Activity, palette: "red" },
}

// Translation key for the platform grid's one-liner blurb, keyed by the catalog's displayName.
// A connector with no entry falls back to its English PLATFORM_DETAILS description rather than
// nothing -- kept as a deliberate English fallback (see platformDescription() below), not a
// translation gap.
const PLATFORM_DESCRIPTION_KEY: Record<string, string> = {
  Salla: "salla",
  Shopify: "shopify",
  Zid: "zid",
  "Google Analytics 4": "googleAnalytics4",
  "Meta Ads": "metaAds",
  "Google Ads": "googleAds",
  "TikTok Ads": "tiktokAds",
  "Snapchat Ads": "snapchatAds",
}

function platformDescription(
  displayName: string,
  englishFallback: string,
  t: NewConnectionWizardTranslator
): string {
  const key = PLATFORM_DESCRIPTION_KEY[displayName]
  return key ? t(`platformDescriptions.${key}` as "platformDescriptions.salla") : englishFallback
}

const PLATFORM_DETAILS: Record<string, PlatformDetails> = {
  Salla: {
    category: "Ecommerce",
    description: "Sync products, orders, and customer records from your store.",
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Salla store that should connect to MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "every30Min",
    estimatedDuration: "oneToTwoMinutes",
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
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Shopify store that should connect to MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "every30Min",
    estimatedDuration: "oneToTwoMinutes",
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
    authMethod: "OAuth 2.0",
    permissions: ["Orders", "Products", "Customers"],
    capabilities: ["Products", "Orders", "Customers", "Catalog"],
    accountLabel: "Store",
    accountDescription: "Choose the Zid store that should sync into MADAR.",
    resourceTypeLabel: "Store",
    syncFrequency: "every30Min",
    estimatedDuration: "oneToTwoMinutes",
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
    authMethod: "OAuth 2.0",
    permissions: ["Traffic", "Events", "Conversions"],
    capabilities: ["Traffic", "Events", "Conversions"],
    accountLabel: "Property",
    accountDescription: "Select the GA4 property that should feed your workspace.",
    resourceTypeLabel: "Property",
    syncFrequency: "every15Min",
    estimatedDuration: "under90Seconds",
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
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Business or Ad Account",
    accountDescription: "Choose the Meta business or ad account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "every15Min",
    estimatedDuration: "under90Seconds",
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
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Select the Google Ads account that should connect to MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "every15Min",
    estimatedDuration: "under90Seconds",
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
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the TikTok Ads account to sync into MADAR.",
    resourceTypeLabel: "Account",
    syncFrequency: "every15Min",
    estimatedDuration: "under90Seconds",
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
    authMethod: "OAuth 2.0",
    permissions: ["Campaigns", "Ads", "Conversions"],
    capabilities: ["Campaigns", "Ads", "Traffic", "Events", "Conversions"],
    accountLabel: "Account",
    accountDescription: "Choose the Snapchat Ads account to import from.",
    resourceTypeLabel: "Account",
    syncFrequency: "every15Min",
    estimatedDuration: "under90Seconds",
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

function errorMeta(kind: ErrorKind, t: NewConnectionWizardTranslator): WizardErrorState {
  switch (kind) {
    case "authorization_cancelled":
      return {
        kind,
        title: t("errors.authorizationCancelled.title"),
        description: t("errors.authorizationCancelled.description"),
      }
    case "permission_denied":
      return {
        kind,
        title: t("errors.permissionDenied.title"),
        description: t("errors.permissionDenied.description"),
      }
    case "token_expired":
      return {
        kind,
        title: t("errors.tokenExpired.title"),
        description: t("errors.tokenExpired.description"),
      }
    case "network_timeout":
      return {
        kind,
        title: t("errors.networkTimeout.title"),
        description: t("errors.networkTimeout.description"),
      }
    default:
      return {
        kind,
        title: t("errors.generic.title"),
        description: t("errors.generic.description"),
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

function loadingStageLabel(
  status: Exclude<FlowStatus, "idle" | "finalizing">,
  t: NewConnectionWizardTranslator
): string {
  switch (status) {
    case "connecting":
      return t("loadingStages.connecting")
    case "authorizing":
      return t("loadingStages.authorizing")
    case "fetching_accounts":
      return t("loadingStages.fetchingAccounts")
    case "almost_done":
      return t("loadingStages.almostDone")
  }
}

const ACCOUNT_FALLBACK_ID = "account-default"

function accountFallback(t: NewConnectionWizardTranslator): AccountOption {
  return {
    id: ACCOUNT_FALLBACK_ID,
    label: t("accountFallback.label"),
    description: t("accountFallback.description"),
  }
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

function HeroConstellation({ t }: { t: NewConnectionWizardTranslator }) {
  return (
    <div
      className="relative h-[210px] w-full max-w-[320px] shrink-0"
      role="img"
      aria-label={t("heroConstellationAriaLabel")}
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

function SuccessHandshake({
  platformName,
  t,
}: {
  platformName: string
  t: NewConnectionWizardTranslator
}) {
  return (
    <div className="relative shrink-0 pt-7">
      <p className="absolute end-2 top-0 max-w-44 text-center text-[12.5px] font-extrabold leading-5 text-[#0b1738]">
        {t("successHandshakeTagline")}
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

// Latin digits in both locales: the rest of the page (the elapsed clock, the step numbers,
// the export's own "943/2,000") uses them, and ar-SA defaults to Arabic-Indic otherwise.
// Mirrors schedule-settings.tsx's dateTimeLocale(locale) helper in this same feature.
function formatCount(value: number, locale: Locale) {
  const intlLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
  return new Intl.NumberFormat(intlLocale, { useGrouping: true }).format(value)
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatElapsedWords(ms: number, t: NewConnectionWizardTranslator) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return t("syncingStep.elapsedWords", { minutes, seconds })
}

const WIZARD_INTERACTION_CLASS =
  "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"

export function NewConnectionWizard() {
  const t = useTranslations("integrations.newConnectionWizard")
  const tCommon = useTranslations("common")
  const locale = useLocale() as Locale
  const dir = localeDirection(locale)
  const router = useRouter()
  const { refetch } = useConnectionsCenter()
  const { connectionManager, integrationApplicationService } = useApplicationServices()
  const { currentWorkspace, currentOrganization } = useWorkspace()

  const steps = useMemo(() => wizardSteps(t), [t])
  const heroCopySteps = useMemo(() => heroCopy(t), [t])
  const categoryLabelMap = useMemo(() => categoryLabels(t), [t])
  const categorySingularMap = useMemo(() => categorySingular(t), [t])
  const fallbackAccount = useMemo(() => accountFallback(t), [t])

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
  // Picking an account used to be an easy-to-miss inline pill row at the bottom of the Import
  // step -- most merchants never noticed it and just clicked through on whichever account
  // happened to be auto-selected first. A modal that opens itself the moment more than one
  // account is discovered makes the choice impossible to miss, without blocking anyone who
  // genuinely has only one account (the modal never opens for that case at all).
  const [accountPickerOpen, setAccountPickerOpen] = useState(false)
  const [shopDomain, setShopDomain] = useState("")
  // Salla's App Store install flow has no browser redirect back with a code (Easy Mode, see
  // salla-marketplace-install.service.ts) -- the install happens in a new tab while this state
  // drives a dedicated "waiting for installation" view in place of the generic authorizing
  // spinner. null means "not a Salla App Store install flow" (every other connector, and Salla's
  // own manual-credential setup mode, are unaffected).
  const [sallaWait, setSallaWait] = useState<
    | null
    | { status: "waiting"; intentId: string; startedAt: number }
    | {
        status: "found"
        intentId: string
        candidate: { claimToken: string; storeName: string; storeDomain: string | null }
      }
    | { status: "claiming"; intentId: string; storeName: string }
    | { status: "timeout" }
  >(null)

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

  // Each category only shows once its application is active: "Marketing" (ad platforms) with
  // advertising, "Ecommerce" and "Analytics" (store traffic, e.g. GA4 feeding Live Visitors) with
  // ecommerce. "All" always shows, but only ever lists the visible categories' connectors.
  // Mirrors connections-overview.tsx's own CATEGORY_APPLICATION and the sidebar's gating.
  const activeApplicationsKey = getActiveApplications(currentOrganization?.settings).join(",")
  const visibleCategories = useMemo(() => {
    const active = activeApplicationsKey.split(",")
    const advertisingActive = active.includes("advertising")
    const ecommerceActive = active.includes("ecommerce")
    return PLATFORM_CATEGORIES.filter((category) => {
      if (category === "Ecommerce" || category === "Analytics") return ecommerceActive
      if (category === "Marketing") return advertisingActive
      return true
    })
  }, [activeApplicationsKey])

  // If the active application backing the currently-selected category gets deactivated while the
  // wizard is open, fall back to "All" rather than leaving the pill row on a hidden category.
  useEffect(() => {
    if (!visibleCategories.includes(selectedCategory)) {
      setSelectedCategory("All")
    }
  }, [visibleCategories, selectedCategory])

  const filteredConnectors = useMemo(() => {
    const query = platformSearch.trim().toLowerCase()

    return CONNECTOR_CATALOG.filter((connector) => {
      const connectorCategory = getCategoryForConnector(connector.displayName)
      const matchesCategory =
        selectedCategory === "All"
          ? visibleCategories.includes(connectorCategory)
          : connectorCategory === selectedCategory

      if (!matchesCategory) {
        return false
      }

      if (!query) {
        return true
      }

      // Search both the English catalog name and the localized blurb, since the page carries
      // every connector under its English brand name regardless of locale.
      const localizedDescription = platformDescription(connector.displayName, "", t)
      return (
        connector.displayName.toLowerCase().includes(query) ||
        localizedDescription.toLowerCase().includes(query)
      )
    })
  }, [platformSearch, selectedCategory, visibleCategories, t])

  const availableAccounts = useMemo(() => {
    if (!selectedConnector) {
      return []
    }

    if (selectedConnector.connectorId in OAUTH_CONNECTOR_PROFILES) {
      return discoveredProviderAccounts.length > 0 ? discoveredProviderAccounts : [fallbackAccount]
    }

    return selectedConnectorDetails?.accounts ?? [fallbackAccount]
  }, [discoveredProviderAccounts, fallbackAccount, selectedConnector, selectedConnectorDetails])
  const selectedAccount =
    availableAccounts.find((account) => account.id === selectedAccountId) ??
    availableAccounts[0] ??
    fallbackAccount
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
    setSelectedAccountId((current) => current ?? availableAccounts[0]?.id ?? ACCOUNT_FALLBACK_ID)
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
      toast.error(
        reason
          ? t("errors.oauthCallbackErrorWithReason", { reason })
          : t("errors.oauthCallbackErrorGeneric")
      )
      return
    }

    const matchedProfileEntry = Object.entries(OAUTH_CONNECTOR_PROFILES).find(
      ([, profile]) => callbackParams.get(profile.callbackParam) === "connected"
    )
    if (!matchedProfileEntry) {
      return
    }
    const [matchedConnectorId, matchedProfile] = matchedProfileEntry

    const callbackConnectionId = callbackParams.get(matchedProfile.connectionIdParam)
    if (!callbackConnectionId) {
      return
    }

    // Set the displayed provider immediately from the URL's own OAuth callback match, instead of
    // waiting on validateConnection below. validateConnection resolves the provider from a
    // locally-cached "draft" connection that only exists when the flow started from MADAR's own
    // wizard (clicking Connect there creates it before redirecting) -- a marketplace/App-Market-
    // initiated connect (e.g. Zid's "Activate" button, which starts on Zid's own site and never
    // touches this wizard until this redirect) never creates that draft, so validateConnection
    // can't resolve the right provider for it. Confirmed in production: a merchant activating Zid
    // this way saw the wizard still showing their last-used "Salla" connector the whole way
    // through, since selectedConnectorDefinitionId was previously only ever updated on a
    // successful validateConnection response.
    const matchedCatalogEntry = CONNECTOR_CATALOG.find(
      (entry) => entry.connectorId === matchedConnectorId
    )
    if (matchedCatalogEntry) {
      setSelectedConnectorDefinitionId(matchedCatalogEntry.connectorDefinitionId)
    }

    let cancelled = false
    const loadAccessibleAccounts = async () => {
      setDraftConnectionId(callbackConnectionId)
      setFlowStatus("fetching_accounts")

      try {
        const validateConnectionInput = {
          connectionId: callbackConnectionId,
          // Lets validateConnection resolve a connection it's never locally cached before (a
          // marketplace/App-Market-initiated install) directly from this provider's own
          // accounts endpoint, instead of requiring a pre-existing local draft.
          connectorDefinitionId: matchedCatalogEntry?.connectorDefinitionId,
          workspaceId: workspaceId ?? undefined,
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
          // A real choice exists (more than one account) -- surface it immediately via the
          // modal rather than leaving it as an easy-to-miss inline section further down the
          // page. Exactly one account means there's nothing to choose, so it stays silent.
          if (accounts.length > 1) {
            setAccountPickerOpen(true)
          }
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
        setErrorState(errorMeta(kind, t))
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
    // Deliberately NOT depending on selectedConnector -- nothing in this effect reads it, and
    // the new immediate setSelectedConnectorDefinitionId call above would otherwise retrigger
    // this same effect mid-flight (selectedConnector?.connectorId changing on the first render),
    // cancelling the in-flight validateConnection call before its catch block ever runs and
    // silently swallowing the resulting error state. workspaceId IS safe to depend on -- this
    // effect only reads it, never writes it, so no such retrigger risk applies there. `t` is
    // next-intl's own memoized translator (stable across renders, only changing with locale), so
    // depending on it carries none of that retrigger risk either.
  }, [integrationApplicationService, workspaceId, t])

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
    setSallaWait(null)
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

    // Zid's Direct API Integration: a merchant-issued store id + access token from their own
    // Zid dashboard, no OAuth redirect at all -- useful before MADAR's Zid app is approved for
    // public OAuth installs. This never goes through createConnection/connect (there's no draft
    // or provider redirect step); the backend validates the token against Zid's own API and
    // returns an already-connected connection in one call.
    if (selectedConnector.connectorId === "zid" && setupMode === "manual") {
      if (apiKey.trim().length === 0 || clientSecret.trim().length === 0) {
        setErrorState({
          kind: "generic",
          title: t("errors.zidManualMissingFields.title"),
          description: t("errors.zidManualMissingFields.description"),
        })
        setRetryTarget("connect")
        setFlowStatus("idle")
        return
      }

      try {
        const references = loadStoredConnectionReferences()
        const connected = await connectionManager.connectProviderDirect({
          workspaceId,
          connectorDefinitionId: selectedConnector.connectorDefinitionId,
          storeId: apiKey.trim(),
          accessToken: clientSecret.trim(),
          connectionName,
        })

        storeConnectionReferences([
          ...references.filter(
            (entry) => entry.connectorDefinitionId !== selectedConnector.connectorDefinitionId
          ),
          {
            connectorDefinitionId: selectedConnector.connectorDefinitionId,
            connectionId: connected.connectionId,
          },
        ])

        setDraftConnectionId(connected.connectionId)
        appendConnectorAccount(selectedConnector.connectorDefinitionId, selectedAccount.label)
        setStepIndex(2)
        setFlowStatus("idle")
      } catch (error) {
        // The generic inferErrorKind()/errorMeta() classification below reads "token" in almost
        // any message as an expired OAuth token and tells the merchant to "reconnect" -- wrong
        // and confusing for a rejected Direct API token, whose only real fix is re-copying it
        // from Zid's dashboard. Check for this backend-specific code first.
        const code = (error as { code?: string } | null)?.code
        if (code === "ZID_DIRECT_TOKEN_INVALID" || code === "ZID_DIRECT_TOKEN_MISSING") {
          setErrorState({
            kind: "generic",
            title: t("errors.zidTokenInvalid.title"),
            description: t("errors.zidTokenInvalid.description"),
          })
        } else {
          const message = error instanceof Error ? error.message : String(error)
          setErrorState(errorMeta(inferErrorKind(message), t))
        }
        setRetryTarget("connect")
        setFlowStatus("idle")
      }
      return
    }

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
      appendConnectorAccount(selectedConnector.connectorDefinitionId, selectedAccount.label)

      // Salla App Store install: no browser redirect back with a code, so the generic
      // connectionManager.connect()/authorizeConnector() (which navigates the current tab away
      // and blocks forever) doesn't apply. Open the install page in a new tab, keep this tab on
      // the wizard, and poll a connect-intent for the resulting webhook-created install instead.
      if (selectedConnector.connectorId === "salla" && setupMode === "oauth") {
        const installUrl = created.metadata.oauthAuthorizationUrl
        if (!installUrl) {
          throw new Error("Salla App Store install URL missing after connection creation")
        }

        const intent = await sallaMarketplaceInstallService.createConnectIntent()
        if (typeof window !== "undefined") {
          window.open(installUrl, "_blank", "noopener,noreferrer")
        }
        setSallaWait({ status: "waiting", intentId: intent.intentId, startedAt: Date.now() })
        setFlowStatus("idle")
        return
      }

      setFlowStatus("authorizing")
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
      setErrorState(errorMeta(kind, t))
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
    t,
    workspaceId,
    workspaceLabel,
  ])

  // Only re-run the polling effect when a *new* wait begins -- re-running it on every sallaWait
  // update (e.g. once it flips to "found") would restart the interval instead of letting the
  // status check inside it stop cleanly.
  const activeSallaWaitIntentId = sallaWait?.status === "waiting" ? sallaWait.intentId : null
  // 3s polling, up to 5 minutes -- matches the plan's connect-intent TTL (10 min server-side,
  // generous slack beyond the UI's own 5-min give-up). Stops entirely once a candidate is found
  // (status moves to "found"/"claiming") or the merchant navigates elsewhere.
  useEffect(() => {
    if (!activeSallaWaitIntentId || sallaWait?.status !== "waiting") {
      return
    }
    const { intentId, startedAt } = sallaWait

    const poll = async () => {
      if (Date.now() - startedAt > SALLA_WAIT_TIMEOUT_MS) {
        setSallaWait({ status: "timeout" })
        return
      }
      try {
        const result: SallaConnectIntentStatus =
          await sallaMarketplaceInstallService.getConnectIntentStatus(intentId)
        if (!result.waiting) {
          setSallaWait({ status: "found", intentId, candidate: result.candidate })
        }
      } catch {
        // A transient network hiccup shouldn't end the wait -- just try again next tick.
      }
    }

    const timer = setInterval(poll, 3000)
    void poll()
    return () => clearInterval(timer)
    // Deliberately keyed only on activeSallaWaitIntentId (see comment above), not the full
    // sallaWait object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSallaWaitIntentId])

  const confirmSallaCandidate = useCallback(async () => {
    if (!sallaWait || sallaWait.status !== "found") {
      return
    }
    const { intentId, candidate } = sallaWait
    setSallaWait({ status: "claiming", intentId, storeName: candidate.storeName })
    try {
      await sallaMarketplaceInstallService.claimPendingInstall(candidate.claimToken)
      setSallaWait(null)
      setStepIndex(2)
      setFlowStatus("idle")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const kind = inferErrorKind(message)
      setErrorState(errorMeta(kind, t))
      setRetryTarget("connect")
      // Clears the wait box entirely -- the generic errorState card (set above) already covers
      // this, and rendering nothing here would otherwise leave an empty blue box on screen.
      setSallaWait(null)
    }
  }, [sallaWait, t])

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
        selectedAccountId !== ACCOUNT_FALLBACK_ID
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
      setErrorState(errorMeta(kind, t))
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
    t,
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
        setSyncError(run.errorMessage ?? t("errors.syncFailedGeneric"))
      }
    } catch (error) {
      setSyncPhase("failed")
      setSyncError(error instanceof Error ? error.message : t("errors.syncFailedGeneric"))
    } finally {
      setIsRunningFirstSync(false)
    }
  }, [connectionManager, draftConnectionId, t])

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
        {steps.map((step, index) => {
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
          ? t("syncingHeading.running", { platform: selectedConnector.displayName })
          : syncPhase === "failed"
            ? t("syncingHeading.failed", { platform: selectedConnector.displayName })
            : t("syncingHeading.done", { platform: selectedConnector.displayName })

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
      ? successHero(selectedConnector?.displayName ?? "", t)
      : heroCopySteps[stepIndex]
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
                  {t("backToIntegrations")}
                </Link>
              )}
              {isSuccess ? null : (
                <p className="text-[12px] font-semibold text-[#2878ff]">
                  {isFinalStep
                    ? t("stepIndicator.final")
                    : t("stepIndicator.ongoing", { current: stepIndex + 1, total: steps.length })}
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
                  {t("currentStepLabel", { step: steps[1].label })}
                </p>
              ) : null}
            </div>

            {isSuccess && selectedConnector ? (
              <SuccessHandshake platformName={selectedConnector.displayName} t={t} />
            ) : isFinalStep ? (
              <div className="flex shrink-0 items-center gap-5">
                <p className="text-[13px] font-bold text-[#2878ff]">
                  {t("aboutToCreateIntegration")}
                </p>
                <div className="flex size-24 shrink-0 items-center justify-center rounded-[20px] bg-white shadow-[0_8px_24px_rgba(11,23,56,0.08)]">
                  <span className="flex size-14 items-center justify-center rounded-full bg-[#1fa85c] text-white">
                    <Check className="size-8" strokeWidth={3} />
                  </span>
                </div>
              </div>
            ) : (
              <HeroConstellation t={t} />
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
          {visibleCategories.map((category) => (
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
              {categoryLabelMap[category]}
            </button>
          ))}
        </div>

        <AppInput
          value={platformSearch}
          onChange={(event) => setPlatformSearch(event.target.value)}
          placeholder={t("platformStep.searchPlaceholder")}
          aria-label={t("platformStep.searchAriaLabel")}
          startIcon={<Search className="size-4 text-[#95a4bd]" />}
          wrapperClassName="w-full md:w-[262px]"
          className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738] placeholder:text-[#95a4bd]"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className={cn("text-[15px] font-extrabold", PAGE_TEXT)}>
          {t("platformStep.availablePlatforms")}
        </h2>
        <span className={cn("text-[11.5px]", MUTED_TEXT)}>
          {t("platformStep.platformCount", { count: filteredConnectors.length })}
        </span>
      </div>

      {filteredConnectors.length === 0 ? (
        <div className={cn(PANEL_CLASS, "px-5 py-10 text-center text-[13px]", MUTED_TEXT)}>
          {t("platformStep.noResults")}
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredConnectors.map((connector) => {
            const details = PLATFORM_DETAILS[connector.displayName]
            const category = getCategoryForConnector(connector.displayName)
            const selected = connector.connectorDefinitionId === selectedConnectorDefinitionId
            const description = platformDescription(
              connector.displayName,
              details?.description ?? "",
              t
            )

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
                    <ChevronLeft className="size-4 shrink-0 text-[#c0cbdc] rtl:rotate-180" />
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
                    {categoryLabelMap[category]}
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
                  {selected ? t("platformStep.selectedPlatform") : t("platformStep.linkNow")}
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
      {t("changePlatformButton")}
    </AppButton>
  )

  const renderConnectStep = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return (
        <div className={cn(PANEL_CLASS, "space-y-3 p-6 text-center")}>
          <CircleAlert className="mx-auto size-10 text-[#95a4bd]" />
          <h3 className={cn("text-[16px] font-extrabold", PAGE_TEXT)}>
            {t("connectStep.choosePlatformFirstTitle")}
          </h3>
          <p className={cn("text-[12.5px]", MUTED_TEXT)}>
            {t("connectStep.choosePlatformFirstDescription")}
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
              {categorySingularMap[category]}
            </span>
          ),
        })}

        {sallaWait ? (
          <div className="rounded-[12px] border border-[#c9dcff] bg-[#eef4ff] px-4 py-4">
            {sallaWait.status === "waiting" || sallaWait.status === "claiming" ? (
              <div className="flex items-center gap-3">
                <Loader2 className="size-4 shrink-0 animate-spin text-[#2878ff]" />
                <div>
                  <p className="text-[12.5px] font-semibold text-[#2878ff]">
                    {sallaWait.status === "claiming"
                      ? t("sallaAppStoreInstall.claimingLabel", { storeName: sallaWait.storeName })
                      : t("sallaAppStoreInstall.waitingTitle")}
                  </p>
                  {sallaWait.status === "waiting" ? (
                    <p className="mt-1 text-[11.5px] text-[#2878ff]/80">
                      {t("sallaAppStoreInstall.waitingDescription")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {sallaWait.status === "found" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12.5px] font-semibold text-[#2878ff]">
                    {t("sallaAppStoreInstall.candidateFoundTitle")}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#2878ff]/80">
                    {t("sallaAppStoreInstall.candidateFoundDescription", {
                      storeName: sallaWait.candidate.storeName,
                    })}
                  </p>
                </div>
                <AppButton type="button" onClick={() => void confirmSallaCandidate()}>
                  {t("sallaAppStoreInstall.confirmButton")}
                </AppButton>
              </div>
            ) : null}

            {sallaWait.status === "timeout" ? (
              <div>
                <p className="text-[12.5px] font-semibold text-[#2878ff]">
                  {t("sallaAppStoreInstall.timeoutTitle")}
                </p>
                <p className="mt-1 text-[11.5px] text-[#2878ff]/80">
                  {t("sallaAppStoreInstall.timeoutDescription")}
                </p>
              </div>
            ) : null}
          </div>
        ) : flowStatus !== "idle" ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#c9dcff] bg-[#eef4ff] px-4 py-3">
            <Loader2 className="size-4 shrink-0 animate-spin text-[#2878ff]" />
            <p className="text-[12.5px] font-semibold text-[#2878ff]">
              {loadingStageLabel(flowStatus as Exclude<FlowStatus, "idle" | "finalizing">, t)}
            </p>
          </div>
        ) : null}

        <div className="rounded-[12px] border border-[#e1e7f0] p-5">
          <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
            {t("connectStep.oauthInfoTitle")}
          </h3>
          <p className={cn("mt-3 text-[12.5px] leading-6", MUTED_TEXT)}>
            {t("connectStep.oauthInfoLine1")}
          </p>
          <p className={cn("text-[12.5px] leading-6", MUTED_TEXT)}>
            {t("connectStep.oauthInfoLine2", { platform: selectedConnector.displayName })}
          </p>

          {selectedConnector.connectorId === "shopify" ? (
            <div className="mt-4 space-y-2">
              <AppInput
                label={t("connectStep.shopDomainLabel")}
                placeholder="your-store.myshopify.com"
                value={shopDomain}
                onChange={(event) => setShopDomain(event.target.value)}
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
              />
              <p className={cn("text-[11px] leading-5", MUTED_TEXT)}>
                {t("connectStep.shopDomainHint")}
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-[#f2f6fd] px-3.5 py-3">
            <Lock className="size-3.5 shrink-0 text-[#6b7b96]" />
            <p className={cn("text-[11.5px]", MUTED_TEXT)}>{t("connectStep.oauthSecurityNote")}</p>
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
          {t("connectStep.connectButton", { platform: selectedConnector.displayName })}
        </AppButton>

        <div className="rounded-[12px] border border-[#dbe6f8] bg-[#f2f7ff] p-5">
          <h4 className={cn("text-[13px] font-extrabold", PAGE_TEXT)}>
            {t("connectStep.importantNoteTitle")}
          </h4>
          <p className={cn("mt-2.5 text-[12px] leading-6", MUTED_TEXT)}>
            {t("connectStep.noCredentialStorage")}
          </p>
          <p className={cn("text-[12px] leading-6", MUTED_TEXT)}>
            {t("connectStep.allConnectionsSecure")}
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
            <span>{t("connectStep.advancedSetup")}</span>
            <ChevronRight className="size-4 text-[#95a4bd] transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:-rotate-90" />
          </summary>
          <div className="mt-4 space-y-3">
            {selectedConnector.connectorId === "zid" ? (
              <>
                <AppInput
                  label={t("connectStep.zidStoreIdLabel")}
                  placeholder={t("connectStep.zidStoreIdPlaceholder")}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                />
                <AppInput
                  label={t("connectStep.zidAccessTokenLabel")}
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                />
                <p className={cn("text-[11px] leading-5", MUTED_TEXT)}>
                  {t("connectStep.zidCredentialsHint")}
                </p>
              </>
            ) : (
              <>
                <AppInput
                  label={t("connectStep.apiKeyLabel")}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                />
                <AppInput
                  label={t("connectStep.clientSecretLabel")}
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                />
                <AppInput
                  label={t("connectStep.manualCredentialsLabel")}
                  value={manualCredentials}
                  onChange={(event) => setManualCredentials(event.target.value)}
                  className="h-10 rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px]"
                />
              </>
            )}
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
              {setupMode === "oauth"
                ? t("connectStep.switchToManual")
                : t("connectStep.useOauthOnly")}
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
      { id: "all", label: t("importStep.presetAll") },
      { id: "recommended", label: t("importStep.presetRecommended") },
      { id: "custom", label: t("importStep.presetCustom") },
    ]

    return (
      <div className={cn(PANEL_CLASS, "space-y-5 p-5 md:p-6")}>
        {renderPlatformHeader({
          trailing: changePlatformButton,
          statusPill: (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f8ef] px-2.5 py-1 text-[10.5px] font-semibold text-[#1f9d55]">
              <span className="size-1.5 rounded-full bg-[#1f9d55]" />
              {t("importStep.connectedBadge")}
            </span>
          ),
          sub: (
            <p className={cn("text-[11.5px]", MUTED_TEXT)}>
              {categorySingularMap[getCategoryForConnector(selectedConnector.displayName)]}
            </p>
          ),
        })}

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1.5">
              <h3 className={cn("text-[17px] font-extrabold", PAGE_TEXT)}>
                {t("importStep.title")}
              </h3>
              <p className={cn("text-[12.5px] leading-6", MUTED_TEXT)}>
                {t("importStep.subtitle")}
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
              const meta = objectPresentation(object, t)
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
              {t("importStep.historicalDataNote", { platform: selectedConnector.displayName })}
            </p>
          </div>
        </div>

        {discoveredProviderAccounts.length > 1 ? (
          <div className="space-y-3 border-t border-[#eef2f8] pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
                {t("importStep.whichAccountTitle")}
              </h3>
              <button
                type="button"
                className="text-[12px] font-semibold text-[#2878ff] hover:underline"
                onClick={() => setAccountPickerOpen(true)}
              >
                {t("importStep.reopenAccountPicker")}
              </button>
            </div>
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

        {/* Opens itself the moment multiple accounts are discovered (see the OAuth-callback
            effect above) -- the inline picker above still lets the choice be changed afterwards,
            but most merchants never noticed it was there at all, hence the modal as the first
            touch. Never shown for a connector with exactly one account (nothing to choose). */}
        <AppDialog
          open={accountPickerOpen}
          onOpenChange={setAccountPickerOpen}
          contentClassName="max-w-[28rem]"
          title={
            <span className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-[#2878ff]" />
              {t("importStep.accountPickerDialog.title")}
            </span>
          }
          description={t("importStep.accountPickerDialog.description", {
            platform: selectedConnector?.displayName ?? "",
          })}
          footer={
            <AppButton
              className="h-10 rounded-full bg-[#2878ff] px-5 text-[13px] font-semibold text-white hover:bg-[#1f63d6]"
              onClick={() => setAccountPickerOpen(false)}
            >
              {t("importStep.accountPickerDialog.confirmCta")}
            </AppButton>
          }
        >
          <div className="flex flex-col gap-2">
            {discoveredProviderAccounts.map((account) => {
              const selected = selectedAccountId === account.id
              return (
                <button
                  key={account.id}
                  type="button"
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-[12px] border px-4 py-3 text-start text-[13px] font-semibold transition-colors",
                    selected
                      ? "border-[#2878ff] bg-[#eef4ff] text-[#2878ff]"
                      : "border-[#e1e7f0] bg-white text-[#0b1738] hover:border-[#c4d5f0]"
                  )}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  {account.label}
                  {selected ? <Check className="size-4 shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        </AppDialog>

        <div className="grid gap-3.5 border-t border-[#eef2f8] pt-5 md:grid-cols-3">
          {[
            {
              label: t("importStep.tiles.syncFrequency"),
              value: syncFrequencyLabel(selectedConnectorDetails.syncFrequency, t),
              icon: RefreshCcw,
              tint: "text-[#2878ff]",
            },
            {
              label: t("importStep.tiles.estimatedDuration"),
              value: estimatedDurationLabel(selectedConnectorDetails.estimatedDuration, t),
              icon: Calendar,
              tint: "text-[#1f9d55]",
            },
            {
              label: t("importStep.tiles.presetLabel"),
              value:
                syncPreset === "custom"
                  ? t("importStep.presetValue.custom")
                  : syncPreset === "all"
                    ? t("importStep.presetValue.all")
                    : t("importStep.presetValue.recommended"),
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
      {
        label: t("reviewStep.cells.account"),
        value: selectedAccount.label,
        icon: Users,
        tint: "text-[#2878ff]",
      },
      {
        label: t("labels.workspace"),
        value: workspaceLabel,
        icon: Layers,
        tint: "text-[#8b5cf6]",
      },
      {
        label: t("labels.platform"),
        value: selectedConnector.displayName,
        icon: Link2,
        tint: "text-[#1f9d55]",
      },
      {
        label: t("reviewStep.cells.connectionType"),
        value: connectionTypeLabel(selectedConnectorDetails.category, t),
        icon: Link2,
        tint: "text-[#2878ff]",
      },
      {
        label: t("labels.authMethod"),
        value: selectedConnectorDetails.authMethod,
        icon: ShieldCheck,
        tint: "text-[#1f9d55]",
      },
      {
        label: t("reviewStep.cells.syncRate"),
        value: syncFrequencyLabel(selectedConnectorDetails.syncFrequency, t),
        icon: RefreshCcw,
        tint: "text-[#e08b00]",
      },
    ]

    return (
      <div className="space-y-4">
        <div className={cn(PANEL_CLASS, "p-5")}>
          {renderPlatformHeader({
            trailing: changePlatformButton,
            namePrefix: t("reviewStep.platformPrefix"),
            statusPill: (
              <span className="inline-flex rounded-full bg-[#eef4ff] px-2.5 py-1 text-[10.5px] font-semibold text-[#2878ff]">
                {t("reviewStep.readyBadge")}
              </span>
            ),
            sub: (
              <p className={cn("text-[11.5px]", MUTED_TEXT)}>
                {categorySingularMap[getCategoryForConnector(selectedConnector.displayName)]}
              </p>
            ),
          })}
        </div>

        <div className={cn(PANEL_CLASS, "p-5")}>
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-[#6b7b96]" />
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
              {t("reviewStep.detailsTitle")}
            </h3>
          </div>
          <p className={cn("mt-2 text-[12px] leading-6", MUTED_TEXT)}>
            {t("reviewStep.detailsSubtitle")}
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
              {t("reviewStep.selectedDataTitle")}
            </h3>
          </div>
          <p className={cn("mt-2 text-[12px]", MUTED_TEXT)}>
            {t("reviewStep.selectedDataSubtitle", { platform: selectedConnector.displayName })}
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {selectedObjects.map((object) => {
              const meta = objectPresentation(object, t)
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
              {t("reviewStep.firstSyncNote")}
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
        label: t("successStep.tiles.healthMonitoring"),
        value: healthMonitoringEnabled
          ? t("successStep.enabledValue")
          : t("successStep.disabledValue"),
        icon: Activity,
      },
      {
        label: t("successStep.tiles.autoSync"),
        value: autoSyncEnabled ? t("successStep.enabledValue") : t("successStep.disabledValue"),
        icon: RefreshCcw,
      },
      {
        label: t("successStep.tiles.firstSyncEstimate"),
        value: estimatedDurationLabel(
          selectedConnectorDetails?.estimatedDuration ?? "oneToTwoMinutes",
          t
        ),
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
              {t("successStep.title", { platform: selectedConnector.displayName })}
            </h3>
            <p className={cn("mx-auto max-w-lg text-[13px] leading-6", MUTED_TEXT)}>
              {t("successStep.subtitle")}
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
              {t("successStep.syncStartingNote")}
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
          {
            label: t("syncingStep.totals.recordsRead"),
            value: formatCount(syncOutcome.recordsRead, locale),
          },
          {
            label: t("syncingStep.totals.recordsWritten"),
            value: formatCount(syncOutcome.recordsWritten, locale),
          },
          {
            label: t("syncingStep.totals.recordsFailed"),
            value: formatCount(syncOutcome.recordsFailed, locale),
          },
        ]
      : []

    return (
      <div className="space-y-4">
        <div className={cn(PANEL_CLASS, "p-5")}>
          {renderPlatformHeader({
            namePrefix: t("reviewStep.platformPrefix"),
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
                {isRunning
                  ? t("syncingStep.statusPill.running")
                  : isFailed
                    ? t("syncingStep.statusPill.failed")
                    : t("syncingStep.statusPill.done")}
              </span>
            ),
            sub: (
              <p className={cn("text-[11.5px]", MUTED_TEXT)}>
                {categorySingularMap[getCategoryForConnector(selectedConnector.displayName)]}
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
                  ? t("syncingStep.descriptionRunning", {
                      platform: selectedConnector.displayName,
                    })
                  : isFailed
                    ? (syncError ?? t("errors.syncFailedGeneric"))
                    : t("syncingStep.descriptionDone")}
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
                    ? t("syncingStep.stateLabel.running")
                    : isFailed
                      ? t("syncingStep.stateLabel.failed")
                      : t("syncingStep.stateLabel.done")}
                </p>
              </div>
              <p className={cn("mt-1.5 text-[11.5px]", MUTED_TEXT)}>
                {t("syncingStep.elapsedPrefixed", {
                  value: formatElapsedWords(
                    isRunning ? syncElapsedMs : (syncOutcome?.durationMs ?? syncElapsedMs),
                    t
                  ),
                })}
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
              const meta = objectPresentation(object, t)
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
            <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
              {t("syncingStep.dataDetailsTitle")}
            </h3>
          </div>
          <p className={cn("mt-2 text-[12px] leading-6", MUTED_TEXT)}>
            {t("syncingStep.dataDetailsSubtitle", { platform: selectedConnector.displayName })}
          </p>

          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {objects.map((object) => {
              const meta = objectPresentation(object, t)
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
                      {isRunning
                        ? t("syncingStep.objectBadge.running")
                        : isFailed
                          ? t("syncingStep.objectBadge.failed")
                          : t("syncingStep.objectBadge.done")}
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
              {t("syncingStep.autoUpdateNote")}
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
              <p className="text-[11px] uppercase tracking-wide text-rose-700/80">
                {t("errorCard.eyebrow")}
              </p>
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
                {t("errorCard.retryButton")}
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={goToImportStep}
              >
                {t("errorCard.backToImportSetup")}
              </AppButton>
              <AppButton
                variant="outline"
                className={cn("h-10 rounded-xl px-4", WIZARD_INTERACTION_CLASS)}
                onClick={handlePreviousClick}
              >
                {tCommon("back")}
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
      ? t("footer.continueToPlatform", {
          platform: selectedConnector?.displayName ?? t("footer.fallbackPlatformName"),
        })
      : stepIndex === 1
        ? t("footer.continue")
        : stepIndex === 2
          ? t("footer.reviewSettings")
          : stepIndex === 3
            ? t("footer.createIntegration")
            : t("footer.continueFallback")

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
              title={t("emptyWorkspace.title")}
              subtitle={t("emptyWorkspace.subtitle")}
              state="empty"
              className={SURFACE_CARD_CLASS}
            >
              <div className="pt-2">
                <WorkspaceSelector
                  triggerLabel={t("emptyWorkspace.createButton")}
                  triggerAriaLabel={t("emptyWorkspace.createButtonAria")}
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
              title={t("archivedWorkspace.title")}
              subtitle={t("archivedWorkspace.subtitle")}
              state="empty"
              className={SURFACE_CARD_CLASS}
            >
              <div className="pt-2">
                <WorkspaceSelector
                  triggerLabel={t("archivedWorkspace.manageButton")}
                  triggerAriaLabel={t("archivedWorkspace.manageButtonAria")}
                />
              </div>
            </AppCard>
          </AppSection>
        </AppContainer>
      </AppPage>
    )
  }

  const sidebarBenefits = [
    t("sidebar.benefits.oauthSecure"),
    t("sidebar.benefits.autoSync"),
    t("sidebar.benefits.unifiedInsights"),
    t("sidebar.benefits.noManualEntry"),
  ]

  // The rail that replaces the step-one benefits list once the flow is under way.
  const renderSetupChecklist = () => (
    <div className={cn(PANEL_CLASS, "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
          {stepIndex === 3 ? t("setupChecklist.titleReview") : t("setupChecklist.titleSteps")}
        </h3>
        {isSuccess && syncPhase === "idle" ? (
          <Check className="size-4 text-[#1f9d55]" strokeWidth={3} />
        ) : null}
      </div>
      <ul className="mt-4 space-y-3.5">
        {steps.map((step, index) => {
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
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>{t("helpCard.title")}</h3>
      </div>
      <p className={cn("mt-2.5 text-[12px] leading-[21px]", MUTED_TEXT)}>
        {t("helpCard.subtitle")}
      </p>
    </div>
  )

  const renderConnectionSummaryRail = () => {
    if (!selectedConnector || !selectedConnectorDetails) {
      return null
    }

    const listSeparator = locale === "ar" ? "، " : ", "

    const rows = [
      { label: t("labels.platform"), value: selectedConnector.displayName },
      { label: t("labels.authMethod"), value: selectedConnectorDetails.authMethod },
      { label: t("labels.workspace"), value: workspaceLabel },
      { label: t("summaryRail.rows.accountType"), value: selectedAccount.label },
      {
        label: t("summaryRail.rows.requiredPermissions"),
        value: selectedConnectorDetails.permissions
          .map((permission) => objectPresentation(permission, t).label)
          .join(listSeparator),
      },
      { label: t("summaryRail.rows.setupDuration"), value: t("summaryRail.setupDurationValue") },
      {
        label: t("summaryRail.rows.firstSyncEstimate"),
        value: estimatedDurationLabel(selectedConnectorDetails.estimatedDuration, t),
      },
    ]

    return (
      <div className={cn(PANEL_CLASS, "p-5")}>
        <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>{t("summaryRail.title")}</h3>
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
    <div className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")} dir={dir}>
      <div className="mx-auto w-full max-w-[1360px] space-y-5">
        {renderTopProgress()}

        {/* RTL: grid columns run right to left, so the first child is the right-hand rail. */}
        <div className={cn("grid gap-5", gridClassName)}>
          {stepIndex === 0 ? (
            <>
              <div>{renderStepContent()}</div>
              <aside className="space-y-4">
                <div className={cn(PANEL_CLASS, "p-5 lg:sticky lg:top-5")}>
                  <h3 className={cn("text-[14px] font-extrabold", PAGE_TEXT)}>
                    {t("sidebar.whatYouGetTitle")}
                  </h3>
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
                      {t("sidebar.needHelpTitle")}
                    </h3>
                  </div>
                  {/* The export puts a "عرض الدليل" button here. There is no docs route in
                      the app yet, so the card carries the copy only for now. */}
                  <p className={cn("mt-2.5 text-[12px] leading-[21px]", MUTED_TEXT)}>
                    {t("sidebar.needHelpBody")}
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
                {t("footer.close")}
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
                  {t("errorCard.retryButton")}
                </AppButton>
              ) : syncPhase === "done" ? (
                <AppButton
                  className={cn(
                    "h-10 min-w-[190px] rounded-[10px] bg-[#1fa85c] px-4 text-[12.5px] font-semibold text-white hover:bg-[#188a4a]",
                    WIZARD_INTERACTION_CLASS
                  )}
                  icon={<ArrowRight className="size-4 shrink-0 rtl:rotate-180" />}
                  iconPosition="end"
                  onClick={goToConnections}
                >
                  {t("footer.goToIntegrations")}
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
                {t("footer.finish")}
              </AppButton>

              <div className="flex-1" />

              <AppButton
                variant="outline"
                className={cn(
                  "h-10 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                icon={<ArrowRight className="size-4 shrink-0 rtl:rotate-180" />}
                iconPosition="start"
                onClick={goToConnections}
              >
                {t("footer.goToIntegrations")}
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
                {t("footer.runSyncNow")}
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
                {tCommon("cancel")}
              </AppButton>

              <div className="flex-1" />

              <AppButton
                variant="outline"
                className={cn(
                  "h-10 min-w-[130px] rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]",
                  WIZARD_INTERACTION_CLASS
                )}
                disabled={stepIndex === 0 || flowStatus !== "idle"}
                icon={<ArrowLeft className="size-4 shrink-0 rtl:rotate-180" />}
                iconPosition="start"
                onClick={handlePreviousClick}
              >
                {tCommon("previous")}
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
                    <ArrowRight className="size-4 shrink-0 rtl:rotate-180" />
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
