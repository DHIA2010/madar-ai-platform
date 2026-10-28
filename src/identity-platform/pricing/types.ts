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
  isRecommended: boolean
  isActive: boolean
  sortOrder: number
  legacyPlanTier: SubscriptionPlanTier | null
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
  isRecommended: boolean
  isActive: boolean
}

// What a customer is buying, resolved and validated against current pricing -- the amount is
// always taken from here, never from the client.
export interface ResolvedPurchase {
  application: PurchasableApplication
  package: PlatformPackage
  interval: BillingInterval
  amountHalalas: number
}
