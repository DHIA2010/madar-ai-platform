import { IdentityError } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { extraBranchPrice, type PricingService } from "../pricing/service"
import type { PlatformPackage } from "../pricing/types"
import { effectiveSubscriptionStatus } from "./lifecycle"
import { PostgresOrganizationSubscriptionRepository } from "./repository"
import type {
  BillingInterval,
  OrganizationSubscriptionState,
  PurchasableApplication,
} from "./types"

// Branches as an add-on: a package includes some branches, and each further one is paid for
// (organization_subscriptions.extra_branches). POS calls them branches; Ads and E-commerce call the
// same records workspaces and sell them the same way. Workspaces are shared by every app, so an
// organization may have as many as its most generous running plan allows (the plans don't add
// up). An organization with none of these plans isn't limited here.
//
// Branches that already exist are never locked or hidden -- the limit only stops creating new ones.

// In order of preference when two plans allow the same number.
export const BRANCH_APPLICATIONS: PurchasableApplication[] = [
  "madarComplete",
  "pos",
  "advertising",
  "ecommerce",
]

export interface BranchAllowance {
  // Whether creating a branch is limited at all (a running POS / Madar Complete subscription).
  enforced: boolean
  // Active branches now.
  used: number
  // The package's included branches + the extra ones paid for; null when not enforced.
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
  // What one more branch costs per period on that package (null = it doesn't sell branches).
  extraBranchPriceHalalas: number | null
  // A running paid period can take more branches now, for what's left of it.
  canBuyBranches: boolean
  // One branch for the rest of the current period (what buying one costs today).
  proratedHalalasPerBranch: number | null
}

const LIVE = new Set(["active", "trial", "overdue"])

function periodStart(periodEnd: string, interval: BillingInterval): Date {
  const date = new Date(periodEnd)
  if (interval === "yearly") date.setUTCFullYear(date.getUTCFullYear() - 1)
  else date.setUTCMonth(date.getUTCMonth() - 1)
  return date
}

// One branch for what's left of the period, at least 1 SAR.
export function proratedBranchPrice(
  fullPriceHalalas: number,
  periodEnd: string,
  interval: BillingInterval,
  now: Date
): number {
  const end = new Date(periodEnd).getTime()
  const start = periodStart(periodEnd, interval).getTime()
  const remaining = Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)))
  return Math.max(100, Math.round(fullPriceHalalas * remaining))
}

export class BranchAllowanceService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly pricing: PricingService
  ) {}

  private async activeBranches(organizationId: string): Promise<number> {
    const result = await this.db.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM workspaces
        WHERE organization_id = $1 AND deleted_at IS NULL AND status = 'active'`,
      [organizationId]
    )
    return Number(result.rows[0]?.total ?? 0)
  }

  // The running plan that allows the most branches / workspaces, with its package.
  async branchSubscription(organizationId: string): Promise<{
    subscription: OrganizationSubscriptionState
    pkg: PlatformPackage | null
  } | null> {
    const now = new Date().toISOString()
    const subscriptions = await new PostgresOrganizationSubscriptionRepository(
      this.db
    ).listByOrganizationId(organizationId)
    const live = subscriptions.filter(
      (entry) =>
        BRANCH_APPLICATIONS.includes(entry.application) &&
        LIVE.has(effectiveSubscriptionStatus(entry, now))
    )
    const candidates = await Promise.all(
      live.map(async (subscription) => {
        const pkg = subscription.packageId
          ? await this.pricing.getPackage(subscription.packageId).catch(() => null)
          : null
        return {
          subscription,
          pkg,
          allowed: (pkg?.includedBranches ?? 1) + subscription.extraBranches,
        }
      })
    )
    candidates.sort(
      (a, b) =>
        b.allowed - a.allowed ||
        BRANCH_APPLICATIONS.indexOf(a.subscription.application) -
          BRANCH_APPLICATIONS.indexOf(b.subscription.application)
    )
    return candidates[0]
      ? { subscription: candidates[0].subscription, pkg: candidates[0].pkg }
      : null
  }

  async get(organizationId: string): Promise<BranchAllowance> {
    const [used, chosen] = await Promise.all([
      this.activeBranches(organizationId),
      this.branchSubscription(organizationId),
    ])
    if (!chosen) {
      return {
        enforced: false,
        used,
        allowed: null,
        subscription: null,
        extraBranchPriceHalalas: null,
        canBuyBranches: false,
        proratedHalalasPerBranch: null,
      }
    }
    const { subscription, pkg } = chosen
    const interval = subscription.billingInterval
    const price = pkg && interval ? extraBranchPrice(pkg, interval) : null
    const now = new Date()
    const runningPaid =
      subscription.status === "active" &&
      !!subscription.currentPeriodEnd &&
      new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
    const canBuyBranches = runningPaid && price !== null && interval !== null
    return {
      enforced: true,
      used,
      allowed: (pkg?.includedBranches ?? 1) + subscription.extraBranches,
      subscription: {
        id: subscription.id,
        application: subscription.application,
        packageName: subscription.packageName,
        includedBranches: pkg?.includedBranches ?? 1,
        interval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        extraBranches: subscription.extraBranches,
      },
      extraBranchPriceHalalas: price,
      canBuyBranches,
      proratedHalalasPerBranch:
        canBuyBranches && price !== null
          ? proratedBranchPrice(price, subscription.currentPeriodEnd!, interval!, now)
          : null,
    }
  }

  // Bringing an archived branch back takes a slot like a new one does.
  async assertCanReactivate(workspaceId: string): Promise<void> {
    const result = await this.db.query<{ organization_id: string; status: string }>(
      "SELECT organization_id, status FROM workspaces WHERE id = $1 AND deleted_at IS NULL",
      [workspaceId]
    )
    const row = result.rows[0]
    if (row && row.status !== "active") await this.assertCanAddBranch(row.organization_id)
  }

  // Refuses a new branch past what's paid for.
  async assertCanAddBranch(organizationId: string): Promise<void> {
    const allowance = await this.get(organizationId)
    if (allowance.enforced && allowance.allowed !== null && allowance.used >= allowance.allowed) {
      throw new IdentityError(
        "BRANCH_LIMIT_REACHED",
        409,
        "business",
        `Your subscription includes ${allowance.allowed} branch(es) -- add a branch to it first.`
      )
    }
  }
}
