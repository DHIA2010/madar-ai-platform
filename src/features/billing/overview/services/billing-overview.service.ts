import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same per-feature duplication convention as moyasar-billing.service.ts's own copy of this helper.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

const OVERVIEW_ENDPOINT = ["", "v1", "billing", "overview"].join(String.fromCharCode(47))

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export type BillingSubscriptionStatus = "trial" | "active" | "cancelled" | "expired" | "overdue"
export type BillingInterval = "monthly" | "yearly"

export interface BillingSubscription {
  id: string
  application: string
  status: BillingSubscriptionStatus
  source: string
  packageName: string | null
  billingInterval: BillingInterval | null
  price: number | null
  currency: string
  startedAt: string
  endsAt: string | null
}

export interface BillingPayment {
  id: string
  invoiceNumber: string | null
  date: string
  application: string
  packageName: string | null
  billingInterval: BillingInterval | null
  method: "card" | "bank_transfer" | "cash" | "other"
  status: "paid" | "failed" | "pending" | "rejected"
  amount: number | null
  originalAmount: number | null
  discount: number | null
  currency: string
  reference: string | null
  rejectionReason: string | null
}

export interface BillingOverview {
  organization: { id: string; name: string; taxNumber: string | null }
  subscriptions: BillingSubscription[]
  payments: BillingPayment[]
}

export const billingOverviewService = {
  get(): Promise<BillingOverview> {
    return client.get<BillingOverview>(OVERVIEW_ENDPOINT)
  },
}
