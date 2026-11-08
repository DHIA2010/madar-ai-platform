import { randomUUID } from "node:crypto"

import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  type BillingInterval,
  PURCHASABLE_APPLICATIONS,
  type PurchasableApplication,
  type SubscriptionPlanTier,
} from "../subscriptions/types"
import { defaultPricingFor } from "./defaults"
import type {
  ApplicationPricing,
  PackageEntitlements,
  PackageInput,
  PlatformPackage,
  PricingMode,
  ResolvedPurchase,
} from "./types"

// Only the known keys, with the right types -- anything else stored there is ignored.
export function parseEntitlements(value: unknown): PackageEntitlements {
  const raw =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as Record<string, unknown>
          } catch {
            return {}
          }
        })()
      : ((value ?? {}) as Record<string, unknown>)
  const entitlements: PackageEntitlements = {}
  for (const key of [
    "invoiceReader",
    "shiftCash",
    "customRoles",
    "procurement",
    "customReports",
  ] as const) {
    if (raw[key] === true) entitlements[key] = true
  }
  for (const key of ["maxAdPlatforms", "maxStores"] as const) {
    const limit = Number(raw[key])
    if (raw[key] !== undefined && raw[key] !== null && Number.isInteger(limit) && limit >= 0) {
      entitlements[key] = limit
    }
  }
  return entitlements
}

function mapPackage(row: Record<string, unknown>): PlatformPackage {
  const toPrice = (value: unknown) => (value === null || value === undefined ? null : Number(value))
  return {
    id: String(row.id),
    application: row.application as PurchasableApplication,
    name: String(row.name),
    description: String(row.description ?? ""),
    features: Array.isArray(row.features) ? (row.features as unknown[]).map(String) : [],
    monthlyPriceHalalas: toPrice(row.monthly_price_halalas),
    yearlyPriceHalalas: toPrice(row.yearly_price_halalas),
    includedBranches: Math.max(1, Number(row.included_branches ?? 1)),
    entitlements: parseEntitlements(row.entitlements),
    extraBranchMonthlyHalalas: toPrice(row.extra_branch_monthly_halalas),
    extraBranchYearlyHalalas: toPrice(row.extra_branch_yearly_halalas),
    isRecommended: row.is_recommended === true,
    isActive: row.is_active === true,
    sortOrder: Number(row.sort_order ?? 0),
    legacyPlanTier: (row.legacy_plan_tier as SubscriptionPlanTier | null) ?? null,
  }
}

const purchaseUnavailable = (message: string) => ERRORS.conflict("PACKAGE_NOT_PURCHASABLE", message)

// What one branch beyond the included one costs on this package for the period -- null when the
// package doesn't sell branches.
export function extraBranchPrice(pkg: PlatformPackage, interval: BillingInterval): number | null {
  return interval === "yearly" ? pkg.extraBranchYearlyHalalas : pkg.extraBranchMonthlyHalalas
}

// Per-application pricing (modes + packages), edited from Madar Admin and read by the customer
// marketplace, Moyasar checkout, and bank-transfer requests -- the single source of every price.
export class PricingService {
  private seeded = false

  constructor(private readonly db: PostgresDatabase) {}

  // Writes the default pricing for any application that has none yet (first read after deploy,
  // or a newly added application). Insert-only: never touches pricing an admin has edited.
  private async ensureSeeded() {
    if (this.seeded) return
    const existing = await this.db.query<{ application: string }>(
      "SELECT application FROM platform_app_pricing"
    )
    const have = new Set(existing.rows.map((row) => row.application))
    for (const application of PURCHASABLE_APPLICATIONS) {
      if (have.has(application)) continue
      const defaults = defaultPricingFor(application)
      await this.db.withTransaction(async () => {
        await this.db.query(
          `INSERT INTO platform_app_pricing (application, pricing_mode) VALUES ($1, $2)
           ON CONFLICT (application) DO NOTHING`,
          [application, defaults.mode]
        )
        for (const [index, pkg] of defaults.packages.entries()) {
          await this.db.query(
            `INSERT INTO platform_packages (
               id, application, name, description, features, monthly_price_halalas,
               yearly_price_halalas, is_recommended, is_active, sort_order, legacy_plan_tier,
               extra_branch_monthly_halalas, extra_branch_yearly_halalas, included_branches,
               entitlements
             ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, true, $9, $10, $11, $12, $13, $14::jsonb)`,
            [
              randomUUID(),
              application,
              pkg.name,
              pkg.description,
              JSON.stringify(pkg.features),
              pkg.monthlyPriceHalalas,
              pkg.yearlyPriceHalalas,
              pkg.isRecommended,
              index,
              pkg.legacyPlanTier,
              pkg.extraBranchMonthlyHalalas ?? null,
              pkg.extraBranchYearlyHalalas ?? null,
              pkg.includedBranches ?? 1,
              JSON.stringify(pkg.entitlements ?? {}),
            ]
          )
        }
      })
    }
    this.seeded = true
  }

  async getCatalog(options: { includeInactive: boolean }): Promise<ApplicationPricing[]> {
    await this.ensureSeeded()
    const modes = await this.db.query<{
      application: string
      pricing_mode: string
      is_visible: boolean
      free_days: number | null
    }>("SELECT application, pricing_mode, is_visible, free_days FROM platform_app_pricing")
    const packages = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM platform_packages ORDER BY sort_order, created_at"
    )
    const byApp = new Map(modes.rows.map((row) => [row.application, row]))
    return PURCHASABLE_APPLICATIONS.map((application) => ({
      application,
      mode: (byApp.get(application)?.pricing_mode ?? "contact") as PricingMode,
      visible: byApp.get(application)?.is_visible ?? true,
      freeDays: byApp.get(application)?.free_days ?? null,
      packages: packages.rows
        .map(mapPackage)
        .filter((pkg) => pkg.application === application)
        .filter((pkg) => options.includeInactive || pkg.isActive),
    }))
  }

  async getPackage(packageId: string): Promise<PlatformPackage> {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM platform_packages WHERE id = $1",
      [packageId]
    )
    if (!result.rows[0]) throw ERRORS.notFound("Package")
    return mapPackage(result.rows[0])
  }

  // Validates a purchase against current pricing and returns the amount to charge.
  async resolvePurchase(input: {
    application: PurchasableApplication
    packageId: string
    interval: BillingInterval
    extraBranches?: number
  }): Promise<ResolvedPurchase> {
    const pricing = (await this.getCatalog({ includeInactive: false })).find(
      (entry) => entry.application === input.application
    )
    if (!pricing || !pricing.visible || pricing.mode === "contact") {
      throw purchaseUnavailable("This application isn't sold online -- contact Madar.")
    }
    if (pricing.mode === "free") {
      throw purchaseUnavailable("This application is free -- activate it instead.")
    }
    const purchasable = pricing.mode === "fixed" ? pricing.packages.slice(0, 1) : pricing.packages
    const pkg = purchasable.find((entry) => entry.id === input.packageId)
    if (!pkg) throw purchaseUnavailable("This package isn't available for this application.")
    const amount = input.interval === "yearly" ? pkg.yearlyPriceHalalas : pkg.monthlyPriceHalalas
    if (amount === null) {
      throw purchaseUnavailable(`This package has no ${input.interval} price.`)
    }
    const extraBranches = Math.max(0, Math.floor(input.extraBranches ?? 0))
    const branchPrice = extraBranchPrice(pkg, input.interval)
    if (extraBranches > 0 && branchPrice === null) {
      throw purchaseUnavailable("This package doesn't sell extra branches.")
    }
    const extraBranchesHalalas = extraBranches * (branchPrice ?? 0)
    return {
      application: input.application,
      package: pkg,
      interval: input.interval,
      extraBranches,
      extraBranchesHalalas,
      amountHalalas: amount + extraBranchesHalalas,
    }
  }

  // freeDays only applies to free mode (1-365 days); other modes clear it.
  async setMode(
    application: PurchasableApplication,
    mode: PricingMode,
    freeDays: number | null = null
  ): Promise<void> {
    await this.ensureSeeded()
    await this.db.query(
      `UPDATE platform_app_pricing SET pricing_mode = $2, free_days = $3, updated_at = now()
        WHERE application = $1`,
      [application, mode, mode === "free" ? freeDays : null]
    )
  }

  async isVisible(application: PurchasableApplication): Promise<boolean> {
    const result = await this.db.query<{ is_visible: boolean }>(
      "SELECT is_visible FROM platform_app_pricing WHERE application = $1",
      [application]
    )
    return result.rows[0]?.is_visible ?? true
  }

  async setVisibility(application: PurchasableApplication, visible: boolean): Promise<void> {
    await this.ensureSeeded()
    await this.db.query(
      "UPDATE platform_app_pricing SET is_visible = $2, updated_at = now() WHERE application = $1",
      [application, visible]
    )
  }

  async createPackage(
    application: PurchasableApplication,
    input: PackageInput
  ): Promise<PlatformPackage> {
    await this.ensureSeeded()
    const order = await this.db.query<{ next: number | null }>(
      "SELECT MAX(sort_order) + 1 AS next FROM platform_packages WHERE application = $1",
      [application]
    )
    const id = randomUUID()
    await this.db.query(
      `INSERT INTO platform_packages (
         id, application, name, description, features, monthly_price_halalas,
         yearly_price_halalas, is_recommended, is_active, sort_order,
         extra_branch_monthly_halalas, extra_branch_yearly_halalas, included_branches,
         entitlements
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        id,
        application,
        input.name,
        input.description,
        JSON.stringify(input.features),
        input.monthlyPriceHalalas,
        input.yearlyPriceHalalas,
        input.isRecommended,
        input.isActive,
        Number(order.rows[0]?.next ?? 0),
        input.extraBranchMonthlyHalalas,
        input.extraBranchYearlyHalalas,
        input.includedBranches,
        JSON.stringify(input.entitlements ?? {}),
      ]
    )
    return this.getPackage(id)
  }

  async updatePackage(packageId: string, input: PackageInput): Promise<PlatformPackage> {
    await this.getPackage(packageId)
    await this.db.query(
      `UPDATE platform_packages
          SET name = $2, description = $3, features = $4::jsonb, monthly_price_halalas = $5,
              yearly_price_halalas = $6, is_recommended = $7, is_active = $8,
              extra_branch_monthly_halalas = $9, extra_branch_yearly_halalas = $10,
              included_branches = $11, entitlements = $12::jsonb, updated_at = now()
        WHERE id = $1`,
      [
        packageId,
        input.name,
        input.description,
        JSON.stringify(input.features),
        input.monthlyPriceHalalas,
        input.yearlyPriceHalalas,
        input.isRecommended,
        input.isActive,
        input.extraBranchMonthlyHalalas,
        input.extraBranchYearlyHalalas,
        input.includedBranches,
        JSON.stringify(input.entitlements ?? {}),
      ]
    )
    return this.getPackage(packageId)
  }

  // A package someone is subscribed to can't be deleted (their subscription would point at
  // nothing) -- switch it off instead, which stops new purchases but keeps current subscribers.
  async deletePackage(packageId: string): Promise<void> {
    await this.getPackage(packageId)
    const inUse = await this.db.query(
      `SELECT 1 FROM organization_subscriptions
        WHERE package_id = $1 AND status <> 'cancelled' LIMIT 1`,
      [packageId]
    )
    if (inUse.rows.length > 0) {
      throw ERRORS.conflict(
        "PACKAGE_IN_USE",
        "Customers are subscribed to this package -- deactivate it instead of deleting it."
      )
    }
    await this.db.query("DELETE FROM platform_packages WHERE id = $1", [packageId])
  }

  async reorderPackages(application: PurchasableApplication, packageIds: string[]): Promise<void> {
    await this.db.withTransaction(async () => {
      for (const [index, packageId] of packageIds.entries()) {
        await this.db.query(
          "UPDATE platform_packages SET sort_order = $3 WHERE id = $1 AND application = $2",
          [packageId, application, index]
        )
      }
    })
  }

  // Customers currently on each package (running trials/paid, not cancelled), for Madar Admin.
  async countSubscribersByPackage(): Promise<Record<string, number>> {
    const result = await this.db.query<{ package_id: string; total: unknown }>(
      `SELECT package_id, COUNT(*) AS total FROM organization_subscriptions
        WHERE package_id IS NOT NULL AND status <> 'cancelled'
        GROUP BY package_id`
    )
    return Object.fromEntries(result.rows.map((row) => [row.package_id, Number(row.total)]))
  }
}
