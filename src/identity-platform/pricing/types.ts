import type {
  BillingInterval,
  PurchasableApplication,
  SubscriptionPlanTier,
} from "../subscriptions/types"

// How an application is sold:
//   packages -- the customer picks one of its packages
//   fixed    -- one price, no choice (its first active package carries the price)
//   contact  -- no online price; the customer contacts Madar
//   free     -- the customer activates it without paying, for freeDays (at most a year)
export type PricingMode = "packages" | "fixed" | "contact" | "free"

// What a package unlocks beyond its own app. Switches are off unless set; a limit that's absent
// means no limit.
export interface PackageEntitlements {
  // The AI purchase-invoice reader.
  invoiceReader?: boolean
  // Cash movements (withdrawals/deposits) and the detailed shift report. Opening and closing a
  // shift -- needed to sell -- is in every plan.
  shiftCash?: boolean
  // Custom roles and per-member permissions.
  customRoles?: boolean
  // Suppliers, purchases and expenses, without their own subscriptions.
  procurement?: boolean
  // The custom report builder, without its own subscription.
  customReports?: boolean
  // Invoicing & Quotations (B2B tax invoices), without its own subscription.
  invoicing?: boolean
  // How many ad platforms (Meta, Google Ads, TikTok, Snapchat) can be connected.
  maxAdPlatforms?: number
  // How many stores (Salla, Zid, Shopify) can be connected.
  maxStores?: number
}

// Several years of a package bought at once for one price, set per package in Madar Admin. After
// those years the subscription renews at the package's normal yearly price.
export interface PackageOffer {
  // The line the customer sees on the offer (e.g. "عرض السنتين").
  title: string
  // Halalas, for all the years together.
  priceHalalas: number
  years: number
  // The last day the offer can be bought (YYYY-MM-DD, Riyadh time); null = until removed.
  endsOn: string | null
}

export interface PlatformPackage {
  id: string
  application: PurchasableApplication
  name: string
  description: string
  features: string[]
  // Halalas. A package offers each billing period it has a price for (at least one, unless the
  // application is "contact").
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  // Branches the package includes (at least 1); each further branch costs this much per period.
  // null = this package doesn't sell branches.
  includedBranches: number
  // What the package unlocks beyond its app (see subscriptions/entitlements.ts).
  entitlements: PackageEntitlements
  extraBranchMonthlyHalalas: number | null
  extraBranchYearlyHalalas: number | null
  isRecommended: boolean
  isActive: boolean
  sortOrder: number
  legacyPlanTier: SubscriptionPlanTier | null
  // The package's multi-year offer as stored (null = none). Whether it can be bought right now
  // is activeOffer() in pricing/service.ts.
  offer: PackageOffer | null
}

export interface ApplicationPricing {
  application: PurchasableApplication
  mode: PricingMode
  // false = hidden from the customer marketplace; can't be bought or trialled.
  visible: boolean
  // Free mode only: how many days a free activation lasts (1-365); null in every other mode.
  freeDays: number | null
  packages: PlatformPackage[]
}

export interface PackageInput {
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  includedBranches: number
  entitlements: PackageEntitlements
  extraBranchMonthlyHalalas: number | null
  extraBranchYearlyHalalas: number | null
  isRecommended: boolean
  isActive: boolean
  // Omitted = leave the package's offer as it is; null = remove it.
  offer?: PackageOffer | null
}

// What a customer is buying, resolved and validated against current pricing -- the amount is
// always taken from here, never from the client.
export interface ResolvedPurchase {
  application: PurchasableApplication
  package: PlatformPackage
  interval: BillingInterval
  // Branches bought on top of those the package includes, and what they add to the amount.
  extraBranches: number
  extraBranchesHalalas: number
  amountHalalas: number
  // Set when the package's offer is being bought: the years paid for now, and what one year
  // costs when the subscription renews after them.
  offerYears: number | null
  renewalHalalas: number | null
}
