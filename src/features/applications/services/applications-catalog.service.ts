import type { useTranslations } from "next-intl"
import type { LucideIcon } from "lucide-react"
import { Bot, CreditCard, FileBarChart, Radio, ShoppingBag, Truck, Wallet } from "lucide-react"

import type { OrganizationSettings } from "@/features/workspace"

import type {
  ApplicationAccentTheme,
  ApplicationCatalogEntry,
  ApplicationCategoryId,
  ApplicationDefinition,
  ApplicationFeaturesDisplay,
  ApplicationPricingModel,
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
  procurement: "procurementEnabled",
  expenses: "expensesEnabled",
  ai: "aiEnabled",
  customReports: "customReportsEnabled",
}

// Which application categories this organization currently has activated -- the single shared
// computation app-sidebar.tsx's own nav-filtering and HomeTabs.tsx's own tab-filtering both read,
// rather than each re-deriving this from APPLICATION_SETTINGS_KEY + settings on their own.
export function getActiveApplications(
  settings: OrganizationSettings | undefined
): ApplicationCategoryId[] {
  return (Object.keys(APPLICATION_SETTINGS_KEY) as ApplicationCategoryId[]).filter((app) =>
    Boolean(settings?.[APPLICATION_SETTINGS_KEY[app]])
  )
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
  procurement: "procurementTrialEndsAt",
  expenses: "expensesTrialEndsAt",
  ai: "aiTrialEndsAt",
  customReports: "customReportsTrialEndsAt",
}

export const APPLICATION_TRIAL_USED_KEY: Record<ApplicationCategoryId, keyof OrganizationSettings> =
  {
    advertising: "advertisingTrialUsed",
    ecommerce: "ecommerceTrialUsed",
    pos: "posTrialUsed",
    madarApps: "madarAppsTrialUsed",
    procurement: "procurementTrialUsed",
    expenses: "expensesTrialUsed",
    ai: "aiTrialUsed",
    customReports: "customReportsTrialUsed",
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
//
// Display text (name/description/features/price/CTA label) lives in the "applications.catalog"
// i18n namespace, keyed by `id`, and is resolved by buildApplicationCatalog() below -- this array
// holds only the locale-independent facts (icon, accent, pricing model, subscription state).
interface ApplicationCatalogItem {
  id: string
  category: ApplicationCategoryId
  tabCategory?: ApplicationCategoryId
  icon: LucideIcon
  accent: ApplicationAccentTheme
  pricingModel: ApplicationPricingModel
  hasPriceLabel: boolean
  featuresDisplay: ApplicationFeaturesDisplay
  featureCount: number
  hasPrimaryCta: boolean
  subscriptionStatus: ApplicationSubscriptionStatus
}

export const APPLICATION_CATALOG_DATA: ApplicationCatalogItem[] = [
  {
    id: "advertising-campaigns",
    category: "advertising",
    icon: Radio,
    accent: {
      iconWrapperClassName: "bg-[#eef4ff] text-[#2878ff]",
      primaryButtonClassName: "bg-[#2878ff] text-white hover:bg-[#1f66e0]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 5,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "ecommerce",
    category: "ecommerce",
    icon: ShoppingBag,
    accent: {
      iconWrapperClassName: "bg-[#f5f0ff] text-[#7c4dff]",
      primaryButtonClassName: "bg-[#7c4dff] text-white hover:bg-[#6a3ce0]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 5,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  {
    id: "pos",
    category: "pos",
    icon: CreditCard,
    accent: {
      iconWrapperClassName: "bg-[#fff2e8] text-[#ff7a3d]",
      primaryButtonClassName: "bg-[#ff7a3d] text-white hover:bg-[#e8672e]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 5,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  // Billed/enforced independently (own procurementEnabled flag, own real backend paywall -- see
  // procurement/guards.ts) but shown grouped under the "تطبيقات مدار" tab for discoverability,
  // unlike the 5 madarApps cards above/below which share one real flag. tabCategory is what makes
  // this possible without merging its actual subscription into theirs.
  {
    id: "procurement",
    category: "procurement",
    tabCategory: "madarApps",
    icon: Truck,
    accent: {
      iconWrapperClassName: "bg-[#e9fbf3] text-[#0f9d6a]",
      primaryButtonClassName: "bg-[#0f9d6a] text-white hover:bg-[#0c8559]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 4,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  // Same independent-billing-under-the-madarApps-tab pattern as procurement above. AI used to
  // ride free the moment ANY other app was active (app-sidebar.tsx's old ANY_APPLICATION gate on
  // the /ai nav item); now it's its own subscription, checked via ai-chat/app-guard.ts alongside
  // (not instead of) whichever other category a chat session is scoped to.
  {
    id: "ai",
    category: "ai",
    tabCategory: "madarApps",
    icon: Bot,
    accent: {
      iconWrapperClassName: "bg-[#f3eeff] text-[#7c4dff]",
      primaryButtonClassName: "bg-[#7c4dff] text-white hover:bg-[#6a3ce0]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 3,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  // Distinct from "Ready Reports" (reports-overview-page.tsx's "ready" tab, which stays
  // free/unpaywalled) -- this gates specifically the custom report builder (its "custom" tab),
  // see reports/custom-reports-guard.ts.
  {
    id: "custom-reports",
    category: "customReports",
    tabCategory: "madarApps",
    icon: FileBarChart,
    accent: {
      iconWrapperClassName: "bg-[#eef9ff] text-[#0ea5e9]",
      primaryButtonClassName: "bg-[#0ea5e9] text-white hover:bg-[#0c8fcc]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 3,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
  // Billed/enforced independently (own expensesEnabled flag, own real backend paywall -- see
  // expenses/guards.ts) but shown grouped under the "تطبيقات مدار" tab for discoverability, same
  // tabCategory mechanism procurement/"Supply & Purchase" uses.
  {
    id: "madar-apps-expenses",
    category: "expenses",
    tabCategory: "madarApps",
    icon: Wallet,
    // Its own distinct accent -- same red/rose tone already used for Expenses in the sidebar nav
    // (app-sidebar.tsx's <Wallet className="text-red-500" />) and the AI assistant's category
    // icon, now that this card is independently billed like procurement.
    accent: {
      iconWrapperClassName: "bg-[#fef2f2] text-[#dc2626]",
      primaryButtonClassName: "bg-[#dc2626] text-white hover:bg-[#b91c1c]",
    },
    pricingModel: "paid",
    hasPriceLabel: true,
    featuresDisplay: "checklist",
    featureCount: 3,
    hasPrimaryCta: true,
    subscriptionStatus: "not_subscribed",
  },
]

type ApplicationsCatalogTranslator = ReturnType<typeof useTranslations<"applications">>

// Merges the locale-independent catalog facts above with the active locale's text from the
// "applications.catalog"/"applications.bundle" messages -- called from useApplicationsCatalog(),
// which already has a live `t` from useTranslations("applications").
export function buildApplicationCatalog(t: ApplicationsCatalogTranslator): ApplicationDefinition[] {
  return APPLICATION_CATALOG_DATA.map((item) => ({
    id: item.id,
    category: item.category,
    tabCategory: item.tabCategory,
    name: t(`catalog.${item.id}.name`),
    shortDescription: t(`catalog.${item.id}.shortDescription`),
    detailDescription: t(`catalog.${item.id}.detailDescription`),
    icon: item.icon,
    accent: item.accent,
    pricingModel: item.pricingModel,
    priceLabel: item.hasPriceLabel ? t(`catalog.${item.id}.priceLabel`) : undefined,
    featuresDisplay: item.featuresDisplay,
    features: (t.raw(`catalog.${item.id}.features`) as string[]).map((label) => ({ label })),
    primaryCta: {
      label: item.hasPrimaryCta
        ? t(item.pricingModel === "free" ? "card.activateNow" : "card.subscribeNow")
        : null,
    },
    subscriptionStatus: item.subscriptionStatus,
  }))
}

export function buildMadarCompleteBundle(t: ApplicationsCatalogTranslator): MadarCompleteBundle {
  return {
    id: "madar-complete",
    name: t("bundle.name"),
    badgeLabel: t("bundle.badgeLabel"),
    description: t("bundle.description"),
    benefits: t.raw("bundle.benefits") as string[],
    primaryCtaLabel: t("bundle.primaryCtaLabel"),
    secondaryCtaLabel: t("bundle.secondaryCtaLabel"),
  }
}

export function getApplicationById(
  id: string,
  catalog: ApplicationDefinition[],
  bundle: MadarCompleteBundle
): ApplicationCatalogEntry | undefined {
  if (id === bundle.id) {
    return bundle
  }
  return catalog.find((application) => application.id === id)
}

// The single place that turns the organization's persisted activation flags (+ any pending
// subscription request) into a per-application status -- used by both the list hook and the
// detail page so they can never disagree about whether a given application is active, pending
// review, or neither. `pendingApplications` is the set of application ids with an unresolved
// (status "pending") SubscriptionActivationRequestDto for this organization.
export function resolveApplicationStatus(
  application: Pick<ApplicationDefinition, "category">,
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
