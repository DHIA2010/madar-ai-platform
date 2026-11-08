import type { BillingInterval, PurchasableApplication } from "@/application/contracts"
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// How many branches the organization's subscription allows (every package includes one; more are
// an add-on), how many are in use, and what one more costs -- see the backend's
// subscriptions/branches.ts.
export interface BranchAllowance {
  // Whether creating a branch is limited at all (a running POS / Madar Complete subscription).
  enforced: boolean
  used: number
  allowed: number | null
  subscription: {
    id: string
    application: PurchasableApplication
    packageName: string | null
    includedBranches: number
    interval: BillingInterval | null
    currentPeriodEnd: string | null
    extraBranches: number
  } | null
  extraBranchPriceHalalas: number | null
  canBuyBranches: boolean
  // One branch for what's left of the current period.
  proratedHalalasPerBranch: number | null
}

const ALLOWANCE_ENDPOINT = ["", "v1", "branches", "allowance"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({ getSession: () => sessionManager.restore() })

export const branchAllowanceService = {
  get(): Promise<BranchAllowance> {
    return client.get(ALLOWANCE_ENDPOINT)
  },
}
