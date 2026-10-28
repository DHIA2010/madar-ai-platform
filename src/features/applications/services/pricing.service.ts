import type { BillingInterval, PurchasableApplication } from "@/application/contracts"
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Per-application pricing set in Madar Admin (/v1/pricing) -- the only source of every price the
// marketplace shows. Mirrors the backend's src/identity-platform/pricing/types.ts.
export type PricingMode = "packages" | "fixed" | "contact" | "free"

export interface PricingPackage {
  id: string
  application: PurchasableApplication
  name: string
  description: string
  features: string[]
  monthlyPriceHalalas: number | null
  yearlyPriceHalalas: number | null
  isRecommended: boolean
}

export interface ApplicationPricing {
  application: PurchasableApplication
  mode: PricingMode
  // false = Madar Admin hid it from the marketplace.
  visible: boolean
  // Free mode: how many days a free activation lasts (1-365); null in every other mode.
  freeDays: number | null
  packages: PricingPackage[]
}

export interface PublicPlatformSettings {
  platformName: string
  supportEmail: string
  announcementBanner: string
  maintenanceMode: boolean
  newSignupsEnabled: boolean
  trialDays: number
}

const PATH_SEPARATOR = String.fromCharCode(47)
const PRICING_ENDPOINT = ["", "v1", "pricing"].join(PATH_SEPARATOR)
const PUBLIC_SETTINGS_ENDPOINT = ["", "v1", "platform", "public-settings"].join(PATH_SEPARATOR)
const COUPON_QUOTE_ENDPOINT = ["", "v1", "billing", "coupons", "quote"].join(PATH_SEPARATOR)

export interface CouponQuote {
  code: string
  originalAmountHalalas: number
  discountHalalas: number
  finalAmountHalalas: number
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const pricingService = {
  getCatalog(): Promise<ApplicationPricing[]> {
    return client.get(PRICING_ENDPOINT)
  },
  getPublicSettings(): Promise<PublicPlatformSettings> {
    return client.get(PUBLIC_SETTINGS_ENDPOINT)
  },
  // A preview only -- the coupon is checked again when the checkout is created.
  quoteCoupon(input: {
    code: string
    application: PurchasableApplication
    packageId: string
    interval: BillingInterval
  }): Promise<CouponQuote> {
    return client.post(COUPON_QUOTE_ENDPOINT, input)
  },
}

// The packages a customer can actually choose: a fixed-price app sells only its first package.
export function purchasablePackages(pricing: ApplicationPricing | undefined): PricingPackage[] {
  if (!pricing || pricing.mode === "contact") return []
  const priced = pricing.packages.filter(
    (pkg) => pkg.monthlyPriceHalalas !== null || pkg.yearlyPriceHalalas !== null
  )
  return pricing.mode === "fixed" ? priced.slice(0, 1) : priced
}

export function priceFor(pkg: PricingPackage, interval: BillingInterval): number | null {
  return interval === "yearly" ? pkg.yearlyPriceHalalas : pkg.monthlyPriceHalalas
}

// How much cheaper a year is than 12 monthly payments, as a whole percentage (null when the
// package doesn't offer both, or yearly isn't actually cheaper).
export function yearlySavingPercent(pkg: PricingPackage): number | null {
  if (pkg.monthlyPriceHalalas === null || pkg.yearlyPriceHalalas === null) return null
  const fullYear = pkg.monthlyPriceHalalas * 12
  if (fullYear <= 0 || pkg.yearlyPriceHalalas >= fullYear) return null
  return Math.round(((fullYear - pkg.yearlyPriceHalalas) / fullYear) * 100)
}

export function formatRiyals(halalas: number): string {
  const riyals = halalas / 100
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(riyals) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(riyals)
}
