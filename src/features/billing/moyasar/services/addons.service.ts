import type { BillingInterval } from "@/application/contracts"
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Paid add-ons bought on their own, independent of any app package (backend:
// subscriptions/addons.ts) -- their prices, and the organization's own while it runs.

export type AddonCode = "whatsapp_daily_report"

export interface AddonOverview {
  code: AddonCode
  monthlyPriceHalalas: number
  yearlyPriceHalalas: number
  isActive: boolean
  active: {
    interval: BillingInterval
    currentPeriodEnd: string
    source: "payment" | "grant"
  } | null
}

const ADDONS_ENDPOINT = ["", "v1", "addons"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const addonsService = {
  async list(): Promise<AddonOverview[]> {
    return (await client.get<{ items: AddonOverview[] }>(ADDONS_ENDPOINT)).items
  },

  async get(code: AddonCode): Promise<AddonOverview | null> {
    return (await this.list()).find((addon) => addon.code === code) ?? null
  },
}
