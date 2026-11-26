import type { PurchasableApplication } from "@/application/contracts"
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Madar Admin's offers (العروض) on sale right now (/v1/offers) -- several years of a package for
// one price, with other apps and add-ons included. Mirrors the backend's pricing/offers.ts.
export interface MarketplaceOffer {
  id: string
  title: string
  subtitle: string | null
  application: PurchasableApplication
  priceHalalas: number
  years: number
  bonusApplications: string[]
  bonusAddons: string[]
  features: string[]
  endsOn: string | null
  package: { id: string; name: string; yearlyPriceHalalas: number | null } | null
  // What everything in it would cost at normal yearly prices for the same years.
  regularHalalas: number
}

const OFFERS_ENDPOINT = ["", "v1", "offers"].join(String.fromCharCode(47))
const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const offersService = {
  list: () =>
    client.get<{ items: MarketplaceOffer[] }>(OFFERS_ENDPOINT).then((response) => response.items),
}
