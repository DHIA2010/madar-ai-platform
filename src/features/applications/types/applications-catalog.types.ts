import type { LucideIcon } from "lucide-react"

export type ApplicationCategoryId =
  | "advertising"
  | "ecommerce"
  | "pos"
  | "madarApps"
  | "procurement"
  | "expenses"
  | "ai"
  | "customReports"

export type ApplicationPricingModel = "free" | "paid"

// "pending_review" is a real backend state now (a SubscriptionActivationRequestDto with
// status "pending") -- the app has submitted a request and a Madar staff member hasn't
// approved/rejected it yet.
export type ApplicationSubscriptionStatus =
  | "not_subscribed"
  | "pending_review"
  | "subscribed"
  | "trial"

export type ApplicationFeaturesDisplay = "checklist" | "iconGrid"

export interface ApplicationFeatureItem {
  label: string
  // Required when featuresDisplay is "iconGrid" (the icon-chip grid on the Madar Apps card);
  // unused for "checklist" mode, which always renders the same check-mark glyph.
  icon?: LucideIcon
}

export interface ApplicationAccentTheme {
  iconWrapperClassName: string
  primaryButtonClassName: string
}

export interface ApplicationDefinition {
  id: string
  // The REAL category -- drives billing (which settings flag/checkout "application" value this
  // card's own subscription uses), trial eligibility, and backend enforcement. Never changes for
  // display purposes; see tabCategory for that.
  category: ApplicationCategoryId
  // Which marketplace tab this card is FILED UNDER, when that differs from its real `category`
  // (e.g. "procurement" is billed/enforced independently but is shown grouped under the
  // "تطبيقات مدار" tab for discoverability). Defaults to `category` when absent -- most cards
  // don't need this.
  tabCategory?: ApplicationCategoryId
  name: string
  shortDescription: string
  detailDescription: string
  icon: LucideIcon
  accent: ApplicationAccentTheme
  pricingModel: ApplicationPricingModel
  priceLabel?: string
  featuresDisplay: ApplicationFeaturesDisplay
  features: ApplicationFeatureItem[]
  // null means the card and detail page only ever offer "معرفة المزيد" -- how تطبيقات مدار
  // enforces "never a direct Subscribe button" as a data fact, not a per-component special case.
  primaryCta: { label: string | null }
  subscriptionStatus: ApplicationSubscriptionStatus
}

export interface MadarCompleteBundle {
  id: "madar-complete"
  name: string
  badgeLabel: string
  description: string
  benefits: string[]
  primaryCtaLabel: string
  secondaryCtaLabel: string
  // Madar Admin's live price for the bundle, once pricing has loaded.
  priceLabel?: string
}

export type ApplicationCatalogEntry = ApplicationDefinition | MadarCompleteBundle

export function isMadarCompleteBundle(
  entry: ApplicationCatalogEntry
): entry is MadarCompleteBundle {
  return entry.id === "madar-complete"
}
