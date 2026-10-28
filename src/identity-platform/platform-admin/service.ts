import { randomUUID } from "node:crypto"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { ERRORS } from "../application/errors/IdentityError"
import { writeAuditLog } from "../infrastructure/postgres/audit-log-writer"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  activatePaid,
  cancelSubscription,
  effectiveSubscriptionStatus,
} from "../subscriptions/lifecycle"
import type { PlatformReceipt, ReceiptService } from "../billing/receipts"
import type { CouponService } from "../coupons/service"
import type { BillingMaintenanceResult } from "../subscriptions/maintenance"
import type { Coupon, CouponInput } from "../coupons/types"
import type { PlatformSettings, PlatformSettingsRepository } from "../platform-settings/types"
import type { PricingService } from "../pricing/service"
import type { PackageInput, PlatformPackage, PricingMode } from "../pricing/types"
import {
  activationSettingsPatch,
  applicationsCoveredBy,
  deactivationSettingsPatch,
} from "../subscriptions/activation"
import { reconcileSubscriptionsFromSettings } from "../subscriptions/reconcile"
import {
  mapOrganizationSubscription,
  PostgresOrganizationSubscriptionRepository,
} from "../subscriptions/repository"
import type {
  BillingInterval,
  OrganizationSubscriptionState,
  PurchasableApplication,
  SubscriptionPlanTier,
  SubscriptionStatus,
} from "../subscriptions/types"
import { requirePlatformAdmin } from "./guard"
import type {
  CustomerStatus,
  Page,
  PageRequest,
  PlatformAdminCustomer,
  PlatformAdminCustomerDetail,
  PlatformAdminCustomerFilters,
  PlatformAdminCustomerSummary,
  PlatformAdminOverview,
  PlatformAdminPayment,
  PlatformAdminPaymentFilters,
  PlatformAdminPaymentSummary,
  PlatformAdminSubscriptionFilters,
  PlatformAdminSubscriptionRow,
  PlatformAdminSubscriptionSummary,
  PlatformAdminSubscriptionView,
  StorePlatform,
} from "./types"

const DAY_MS = 24 * 60 * 60 * 1000
const RENEWING_SOON_DAYS = 7

// Best standing first: a customer with one active app and one expired trial is "active".
const STATUS_RANK: Record<SubscriptionStatus, number> = {
  active: 0,
  trial: 1,
  overdue: 2,
  expired: 3,
  cancelled: 4,
}
const TIER_RANK: Record<SubscriptionPlanTier, number> = {
  enterprise: 0,
  pro: 1,
  growth: 2,
  starter: 3,
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function paginate<T>(rows: T[], page: PageRequest): Page<T> {
  const start = (page.page - 1) * page.pageSize
  return {
    items: rows.slice(start, start + page.pageSize),
    total: rows.length,
    page: page.page,
    pageSize: page.pageSize,
  }
}

function toView(
  subscription: OrganizationSubscriptionState,
  now: string
): PlatformAdminSubscriptionView {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    application: subscription.application,
    status: effectiveSubscriptionStatus(subscription, now),
    planTier: subscription.planTier,
    packageId: subscription.packageId,
    packageName: subscription.packageName,
    billingInterval: subscription.billingInterval,
    priceHalalas: subscription.priceHalalas,
    currency: subscription.currency,
    source: subscription.source,
    startedAt: subscription.startedAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
    cancelledAt: subscription.cancelledAt,
  }
}

// What a running paid subscription brings in per month (a yearly price spread over 12 months).
function monthlyRevenueOf(view: PlatformAdminSubscriptionView): number {
  if ((view.status !== "active" && view.status !== "overdue") || view.priceHalalas === null) {
    return 0
  }
  return view.billingInterval === "yearly" ? Math.round(view.priceHalalas / 12) : view.priceHalalas
}

// Cross-tenant reads and actions behind the Madar Admin console. Every method is platform-admin
// only. Lists are filtered and paged in memory over one pass of the tables: the customer base is
// in the hundreds-to-low-thousands, status is derived from dates at read time (not a column SQL
// could filter on), and this keeps every filter exactly consistent with what the rows display.
export class PlatformAdminService {
  private readonly subscriptions: PostgresOrganizationSubscriptionRepository

  constructor(
    private readonly db: PostgresDatabase,
    private readonly pricing: PricingService,
    private readonly settings: PlatformSettingsRepository,
    private readonly coupons: CouponService,
    private readonly receipts: ReceiptService,
    private readonly runMaintenance: () => Promise<BillingMaintenanceResult>
  ) {
    this.subscriptions = new PostgresOrganizationSubscriptionRepository(db)
  }

  private async loadCustomers(now: string): Promise<PlatformAdminCustomer[]> {
    await reconcileSubscriptionsFromSettings(this.db)

    const organizations = await this.db.query<Record<string, unknown>>(`
      SELECT o.id, o.name, o.settings, o.created_at, o.owner_user_id,
             u.full_name AS owner_name, u.email AS owner_email
        FROM organizations o
        LEFT JOIN users u ON u.id = o.owner_user_id
       WHERE o.deleted_at IS NULL
    `)
    const subscriptionRows = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM organization_subscriptions"
    )
    const activityRows = await this.db.query<{ organization_id: string; last_at: unknown }>(`
      SELECT organization_id, MAX(created_at) AS last_at
        FROM audit_logs
       WHERE organization_id IS NOT NULL
       GROUP BY organization_id
    `)
    const storesByOrg = await this.loadStoresByOrganization()

    const subscriptionsByOrg = new Map<string, PlatformAdminSubscriptionView[]>()
    for (const row of subscriptionRows.rows) {
      const view = toView(mapOrganizationSubscription(row), now)
      const list = subscriptionsByOrg.get(view.organizationId) ?? []
      list.push(view)
      subscriptionsByOrg.set(view.organizationId, list)
    }
    const lastActivity = new Map(
      activityRows.rows.map((row) => [row.organization_id, toIso(row.last_at)])
    )

    return organizations.rows.map((row) => {
      const id = String(row.id)
      const subscriptions = (subscriptionsByOrg.get(id) ?? []).sort(
        (left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status]
      )
      const stores = storesByOrg.get(id) ?? []
      const settings = (row.settings as Record<string, unknown> | null) ?? {}
      // The account-wide tier today (set by every paid activation); falls back to the highest
      // tier among the customer's running subscriptions.
      const settingsTier = settings.currentPlanTier as SubscriptionPlanTier | undefined
      const runningTiers = subscriptions
        .filter((view) => view.status === "active" || view.status === "overdue")
        .map((view) => view.planTier)
        .filter((tier): tier is SubscriptionPlanTier => tier !== null)
        .sort((left, right) => TIER_RANK[left] - TIER_RANK[right])
      return {
        id,
        name: String(row.name),
        createdAt: toIso(row.created_at) ?? "",
        owner: row.owner_user_id
          ? {
              userId: String(row.owner_user_id),
              name: String(row.owner_name ?? ""),
              email: String(row.owner_email ?? ""),
            }
          : null,
        status: (subscriptions[0]?.status ?? "none") as CustomerStatus,
        planTier:
          settingsTier && settingsTier in TIER_RANK ? settingsTier : (runningTiers[0] ?? null),
        subscriptions,
        monthlyRevenueHalalas: subscriptions.reduce((sum, view) => sum + monthlyRevenueOf(view), 0),
        storeCount: stores.length,
        platforms: [...new Set(stores)],
        lastActivityAt: lastActivity.get(id) ?? null,
      }
    })
  }

  // One entry per connected, selected storefront, per organization.
  private async loadStoresByOrganization(): Promise<Map<string, StorePlatform[]>> {
    const byOrg = new Map<string, StorePlatform[]>()
    for (const platform of ["salla", "zid", "shopify"] as const) {
      const result = await this.db.query<{ organization_id: string }>(`
        SELECT c.organization_id
          FROM ${platform}_stores s
          JOIN ${platform}_oauth_connections c ON c.id = s.connection_id
         WHERE c.status = 'connected' AND c.deleted_at IS NULL
           AND s.status = 'active' AND s.is_selected = true
      `)
      for (const row of result.rows) {
        const list = byOrg.get(row.organization_id) ?? []
        list.push(platform)
        byOrg.set(row.organization_id, list)
      }
    }
    return byOrg
  }

  async listCustomers(
    actor: AuthenticatedActor,
    filters: PlatformAdminCustomerFilters,
    page: PageRequest
  ): Promise<Page<PlatformAdminCustomer>> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    const search = filters.search?.trim().toLowerCase()
    const rows = (await this.loadCustomers(now))
      .filter((customer) => {
        if (filters.status && customer.status !== filters.status) return false
        if (filters.planTier && customer.planTier !== filters.planTier) return false
        if (filters.platform && !customer.platforms.includes(filters.platform)) return false
        if (
          filters.application &&
          !customer.subscriptions.some((view) => view.application === filters.application)
        ) {
          return false
        }
        if (search) {
          const haystack = [customer.name, customer.owner?.name, customer.owner?.email, customer.id]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(search)) return false
        }
        return true
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return paginate(rows, page)
  }

  async getCustomerSummary(actor: AuthenticatedActor): Promise<PlatformAdminCustomerSummary> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    const soon = Date.now() + RENEWING_SOON_DAYS * DAY_MS
    const customers = await this.loadCustomers(now)
    return {
      total: customers.length,
      active: customers.filter((customer) => customer.status === "active").length,
      trial: customers.filter((customer) => customer.status === "trial").length,
      overdue: customers.filter((customer) => customer.status === "overdue").length,
      renewingSoon: customers.filter((customer) =>
        customer.subscriptions.some((view) => {
          const end =
            view.status === "trial"
              ? view.trialEndsAt
              : view.status === "active"
                ? view.currentPeriodEnd
                : null
          return end !== null && new Date(end).getTime() <= soon
        })
      ).length,
    }
  }

  async getCustomer(
    actor: AuthenticatedActor,
    organizationId: string
  ): Promise<PlatformAdminCustomerDetail> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    const customer = (await this.loadCustomers(now)).find((entry) => entry.id === organizationId)
    if (!customer) throw ERRORS.notFound("Customer")

    // One membership row per workspace -- deduped to one entry per person below.
    const memberships = await this.db.query<Record<string, unknown>>(
      `SELECT m.user_id, m.role_code, m.status, u.full_name, u.email
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.deleted_at IS NULL
        ORDER BY m.created_at`,
      [organizationId]
    )
    const seenMembers = new Set<string>()
    const members = memberships.rows.filter((row) => {
      const userId = String(row.user_id)
      if (seenMembers.has(userId)) return false
      seenMembers.add(userId)
      return true
    })
    const payments = await this.db.query<Record<string, unknown>>(
      `SELECT id, application, plan_tier, amount, currency, status, created_at
         FROM billing_moyasar_payments
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [organizationId]
    )
    const activity = await this.db.query<Record<string, unknown>>(
      `SELECT a.action, a.created_at, u.full_name AS actor_name
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.organization_id = $1
        ORDER BY a.created_at DESC
        LIMIT 20`,
      [organizationId]
    )

    return {
      ...customer,
      members: members.map((row) => ({
        userId: String(row.user_id),
        name: String(row.full_name ?? ""),
        email: String(row.email ?? ""),
        role: String(row.role_code ?? ""),
        status: String(row.status ?? ""),
      })),
      payments: payments.rows.map((row) => ({
        id: String(row.id),
        application: String(row.application),
        planTier: String(row.plan_tier),
        amountHalalas: Number(row.amount),
        currency: String(row.currency),
        status: String(row.status),
        createdAt: toIso(row.created_at) ?? "",
      })),
      activity: activity.rows.map((row) => ({
        action: String(row.action),
        actorName: (row.actor_name as string | null) ?? null,
        createdAt: toIso(row.created_at) ?? "",
      })),
    }
  }

  private async loadSubscriptionRows(now: string): Promise<PlatformAdminSubscriptionRow[]> {
    const customers = await this.loadCustomers(now)
    const cardBrands = await this.db.query<Record<string, unknown>>(`
      SELECT organization_id, application, raw_payload, created_at
        FROM billing_moyasar_payments
       WHERE status = 'paid'
       ORDER BY created_at DESC
    `)
    const latestBrand = new Map<string, string>()
    for (const row of cardBrands.rows) {
      const key = `${row.organization_id}:${row.application}`
      if (latestBrand.has(key)) continue
      const source = (row.raw_payload as { source?: { company?: string } } | null)?.source
      if (source?.company) latestBrand.set(key, source.company)
    }

    return customers.flatMap((customer) =>
      customer.subscriptions.map((view) => ({
        ...view,
        organizationName: customer.name,
        ownerEmail: customer.owner?.email ?? null,
        paymentMethod:
          view.source === "payment"
            ? (latestBrand.get(`${customer.id}:${view.application}`) ?? null)
            : view.source === "bank_transfer"
              ? "bank_transfer"
              : null,
      }))
    )
  }

  async listSubscriptions(
    actor: AuthenticatedActor,
    filters: PlatformAdminSubscriptionFilters,
    page: PageRequest
  ): Promise<Page<PlatformAdminSubscriptionRow>> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    const search = filters.search?.trim().toLowerCase()
    const rows = (await this.loadSubscriptionRows(now))
      .filter((row) => {
        if (filters.status && row.status !== filters.status) return false
        if (filters.application && row.application !== filters.application) return false
        if (filters.planTier && row.planTier !== filters.planTier) return false
        if (search) {
          const haystack = [row.organizationName, row.ownerEmail, row.id]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
          if (!haystack.includes(search)) return false
        }
        return true
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    return paginate(rows, page)
  }

  async getSubscriptionSummary(
    actor: AuthenticatedActor
  ): Promise<PlatformAdminSubscriptionSummary> {
    requirePlatformAdmin(actor)
    const rows = await this.loadSubscriptionRows(new Date().toISOString())
    const count = (status: SubscriptionStatus) => rows.filter((row) => row.status === status).length
    return {
      total: rows.length,
      active: count("active"),
      trial: count("trial"),
      overdue: count("overdue"),
      expired: count("expired"),
      cancelled: count("cancelled"),
    }
  }

  // Turns an application (or the bundle) on for a customer from Madar Admin -- a deal agreed
  // outside checkout, a goodwill extension, ... -- optionally on one of its packages. The price is
  // whatever staff entered (the package's own price is only prefilled); null = complimentary,
  // which adds nothing to revenue.
  async grantSubscription(
    actor: AuthenticatedActor,
    organizationId: string,
    input: {
      application: PurchasableApplication
      packageId: string | null
      interval: BillingInterval
      priceHalalas: number | null
    }
  ): Promise<PlatformAdminSubscriptionView> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    const pkg = input.packageId ? await this.pricing.getPackage(input.packageId) : null
    if (pkg && pkg.application !== input.application) {
      throw ERRORS.validation({ packageId: "This package belongs to a different application." })
    }
    return this.db.withTransaction(async () => {
      await this.requireOrganization(organizationId)
      const next = activatePaid(
        await this.subscriptions.findByOrganizationAndApplication(
          organizationId,
          input.application
        ),
        {
          id: randomUUID(),
          organizationId,
          application: input.application,
          planTier: pkg?.legacyPlanTier ?? null,
          package: pkg ? { id: pkg.id, name: pkg.name } : null,
          interval: input.interval,
          priceHalalas: input.priceHalalas,
          source: "admin",
          now,
        }
      )
      await this.subscriptions.save(next)
      await this.applySettingsPatch(
        organizationId,
        activationSettingsPatch(input.application, pkg?.legacyPlanTier ?? null)
      )
      await this.audit(actor, "platform_admin.subscription_granted", next, {
        application: input.application,
        packageId: input.packageId,
        interval: input.interval,
        priceHalalas: input.priceHalalas,
        currentPeriodEnd: next.currentPeriodEnd,
      })
      return toView(next, now)
    })
  }

  // Manual renewal (e.g. a bank transfer received for the next period): adds one period on top of
  // whatever is still running, at the subscription's existing price and package.
  async renewSubscription(
    actor: AuthenticatedActor,
    subscriptionId: string,
    input: { interval: BillingInterval }
  ): Promise<PlatformAdminSubscriptionView> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    return this.db.withTransaction(async () => {
      const existing = await this.requireSubscription(subscriptionId)
      const next = activatePaid(existing, {
        id: existing.id,
        organizationId: existing.organizationId,
        application: existing.application,
        planTier: existing.planTier,
        interval: input.interval,
        priceHalalas: existing.priceHalalas,
        source:
          existing.source === "trial" || existing.source === "existing" ? "admin" : existing.source,
        now,
      })
      await this.subscriptions.save(next)
      await this.applySettingsPatch(
        existing.organizationId,
        activationSettingsPatch(existing.application, null)
      )
      await this.audit(actor, "platform_admin.subscription_renewed", next, {
        application: next.application,
        interval: input.interval,
        currentPeriodEnd: next.currentPeriodEnd,
      })
      return toView(next, now)
    })
  }

  // Ends the subscription now and switches its application(s) off -- except any the customer
  // still has through another running subscription (ending the bundle keeps an app they also pay
  // for separately). Sign-in is never affected; the customer can subscribe again.
  async cancelSubscription(
    actor: AuthenticatedActor,
    subscriptionId: string
  ): Promise<PlatformAdminSubscriptionView> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
    return this.db.withTransaction(async () => {
      const existing = await this.requireSubscription(subscriptionId)
      if (existing.status === "cancelled") {
        throw ERRORS.conflict(
          "SUBSCRIPTION_ALREADY_CANCELLED",
          "This subscription is already cancelled."
        )
      }
      const next = cancelSubscription(existing, { cancelledByUserId: actor.userId, now })
      await this.subscriptions.save(next)
      const stillCovered = new Set(
        (await this.subscriptions.listByOrganizationId(existing.organizationId))
          .filter((other) => other.id !== existing.id)
          .filter((other) => {
            const status = effectiveSubscriptionStatus(other, now)
            return status === "active" || status === "trial" || status === "overdue"
          })
          .flatMap((other) => applicationsCoveredBy(other.application))
      )
      await this.applySettingsPatch(
        existing.organizationId,
        deactivationSettingsPatch(existing.application, stillCovered)
      )
      await this.audit(actor, "platform_admin.subscription_cancelled", next, {
        application: next.application,
      })
      return toView(next, now)
    })
  }

  // ---- Pricing (per-application packages) ----

  async getPricing(actor: AuthenticatedActor) {
    requirePlatformAdmin(actor)
    const [catalog, subscribers] = await Promise.all([
      this.pricing.getCatalog({ includeInactive: true }),
      this.pricing.countSubscribersByPackage(),
    ])
    return catalog.map((entry) => ({
      ...entry,
      packages: entry.packages.map((pkg) => ({
        ...pkg,
        subscriberCount: subscribers[pkg.id] ?? 0,
      })),
    }))
  }

  async setPricingMode(
    actor: AuthenticatedActor,
    application: PurchasableApplication,
    mode: PricingMode,
    freeDays: number | null = null
  ) {
    requirePlatformAdmin(actor)
    await this.pricing.setMode(application, mode, freeDays)
    await this.auditPlatform(actor, "platform_admin.pricing_mode_changed", null, {
      application,
      mode,
      ...(mode === "free" ? { freeDays } : {}),
    })
  }

  async setApplicationVisibility(
    actor: AuthenticatedActor,
    application: PurchasableApplication,
    visible: boolean
  ) {
    requirePlatformAdmin(actor)
    await this.pricing.setVisibility(application, visible)
    await this.auditPlatform(actor, "platform_admin.application_visibility_changed", null, {
      application,
      visible,
    })
  }

  async createPackage(
    actor: AuthenticatedActor,
    application: PurchasableApplication,
    input: PackageInput
  ): Promise<PlatformPackage> {
    requirePlatformAdmin(actor)
    const created = await this.pricing.createPackage(application, input)
    await this.auditPlatform(actor, "platform_admin.package_created", created.id, {
      application,
      ...input,
    })
    return created
  }

  async updatePackage(
    actor: AuthenticatedActor,
    packageId: string,
    input: PackageInput
  ): Promise<PlatformPackage> {
    requirePlatformAdmin(actor)
    const updated = await this.pricing.updatePackage(packageId, input)
    await this.auditPlatform(actor, "platform_admin.package_updated", packageId, { ...input })
    return updated
  }

  async deletePackage(actor: AuthenticatedActor, packageId: string): Promise<void> {
    requirePlatformAdmin(actor)
    await this.pricing.deletePackage(packageId)
    await this.auditPlatform(actor, "platform_admin.package_deleted", packageId, {})
  }

  async reorderPackages(
    actor: AuthenticatedActor,
    application: PurchasableApplication,
    packageIds: string[]
  ): Promise<void> {
    requirePlatformAdmin(actor)
    await this.pricing.reorderPackages(application, packageIds)
  }

  // ---- Overview ----

  async getOverview(actor: AuthenticatedActor): Promise<PlatformAdminOverview> {
    requirePlatformAdmin(actor)
    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const customers = await this.loadCustomers(now)
    const payments = await this.loadPayments()
    const subscriptions = customers.flatMap((customer) => customer.subscriptions)
    const running = subscriptions.filter(
      (view) => view.status === "active" || view.status === "overdue"
    )
    const storeCount = customers.reduce((sum, customer) => sum + customer.storeCount, 0)
    const mrr = customers.reduce((sum, customer) => sum + customer.monthlyRevenueHalalas, 0)

    // Today's headline numbers, recorded for future month-over-month comparisons.
    const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
    const today = new Date(nowMs + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
    const startOfToday = new Date(`${today}T00:00:00+03:00`).getTime()
    await this.db.query(
      `INSERT INTO platform_daily_metrics (day, customers, stores, active_subscriptions, mrr_halalas)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (day) DO UPDATE SET
         customers = EXCLUDED.customers, stores = EXCLUDED.stores,
         active_subscriptions = EXCLUDED.active_subscriptions, mrr_halalas = EXCLUDED.mrr_halalas,
         updated_at = now()`,
      [today, customers.length, storeCount, running.length, mrr]
    )
    const monthAgo = new Date(nowMs + RIYADH_OFFSET_MS - 30 * DAY_MS).toISOString().slice(0, 10)
    const baseline = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM platform_daily_metrics WHERE day <= $1 ORDER BY day DESC LIMIT 1",
      [monthAgo]
    )
    const base = baseline.rows[0]
    const delta = (current: number, column: string) => {
      if (!base) return null
      const previous = Number(base[column])
      if (previous === 0) return null
      return Math.round(((current - previous) / previous) * 100)
    }

    // Revenue collected and new paid subscriptions, per month, for the last 8 months.
    const months: PlatformAdminOverview["trend"] = []
    const cursor = new Date(nowMs + RIYADH_OFFSET_MS)
    cursor.setUTCDate(1)
    cursor.setUTCHours(0, 0, 0, 0)
    for (let back = 7; back >= 0; back -= 1) {
      const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - back, 1))
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      const inMonth = (iso: string) => {
        const at = new Date(iso).getTime() + RIYADH_OFFSET_MS
        return at >= start.getTime() && at < end.getTime()
      }
      months.push({
        month: start.toISOString().slice(0, 7),
        revenueHalalas: payments
          .filter((payment) => payment.status === "paid" && inMonth(payment.createdAt))
          .reduce((sum, payment) => sum + payment.amountHalalas, 0),
        newSubscriptions: subscriptions.filter(
          (view) => view.source !== "trial" && view.source !== "existing" && inMonth(view.startedAt)
        ).length,
      })
    }

    const statusCounts = (["active", "trial", "overdue", "expired", "cancelled"] as const).map(
      (status) => ({ status, count: subscriptions.filter((view) => view.status === status).length })
    )
    const byApplication = new Map<string, number>()
    for (const view of running) {
      byApplication.set(view.application, (byApplication.get(view.application) ?? 0) + 1)
    }
    const byPlatform = new Map<string, number>()
    for (const customer of customers) {
      for (const platform of customer.platforms) {
        byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + 1)
      }
    }

    const tracking = await this.db.query<{ event_type: string; total: unknown }>(
      `SELECT event_type, COUNT(*) AS total FROM tracking_events
        WHERE occurred_at >= $1 GROUP BY event_type`,
      [new Date(startOfToday).toISOString()]
    )
    const live = await this.db.query<{ total: unknown }>(
      "SELECT COUNT(*) AS total FROM tracking_live_visitors WHERE last_seen_at >= $1",
      [new Date(nowMs - 5 * 60 * 1000).toISOString()]
    )
    const recentActivity = await this.db.query<Record<string, unknown>>(
      `SELECT a.action, a.created_at, a.metadata, o.name AS organization_name, u.full_name AS actor_name
         FROM audit_logs a
         LEFT JOIN organizations o ON o.id = a.organization_id
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.action LIKE 'platform_admin.%' OR a.action LIKE 'billing.%'
           OR a.action LIKE 'subscription_request.%' OR a.action LIKE 'application_trial.%'
        ORDER BY a.created_at DESC
        LIMIT 8`
    )
    const failedSyncsToday = await this.countFailedSyncsSince(new Date(startOfToday).toISOString())
    const createdToday = (iso: string) => new Date(iso).getTime() >= startOfToday

    return {
      kpis: {
        customers: { value: customers.length, deltaPct: delta(customers.length, "customers") },
        stores: { value: storeCount, deltaPct: delta(storeCount, "stores") },
        activeSubscriptions: {
          value: running.length,
          deltaPct: delta(running.length, "active_subscriptions"),
        },
        mrrHalalas: { value: mrr, deltaPct: delta(mrr, "mrr_halalas") },
        liveVisitors: { value: Number(live.rows[0]?.total ?? 0), deltaPct: null },
      },
      trend: months,
      subscriptionsByApplication: [...byApplication.entries()]
        .map(([application, count]) => ({ application, count }))
        .sort((left, right) => right.count - left.count),
      subscriptionStatus: statusCounts,
      storesByPlatform: [...byPlatform.entries()].map(([platform, count]) => ({ platform, count })),
      today: {
        events: tracking.rows.reduce((sum, row) => sum + Number(row.total), 0),
        purchases: Number(tracking.rows.find((row) => row.event_type === "PURCHASE")?.total ?? 0),
        newCustomers: customers.filter((customer) => createdToday(customer.createdAt)).length,
        paymentsToday: payments.filter(
          (payment) => payment.status === "paid" && createdToday(payment.createdAt)
        ).length,
        integrationErrors: failedSyncsToday,
      },
      recentCustomers: [...customers]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 5)
        .map((customer) => ({
          id: customer.id,
          name: customer.name,
          createdAt: customer.createdAt,
          status: customer.status,
          platforms: customer.platforms,
        })),
      recentActivity: recentActivity.rows.map((row) => ({
        action: String(row.action),
        organizationName: (row.organization_name as string | null) ?? null,
        actorName: (row.actor_name as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        createdAt: toIso(row.created_at) ?? "",
      })),
    }
  }

  private async countFailedSyncsSince(sinceIso: string): Promise<number> {
    let total = 0
    for (const table of [
      "google_ads_sync_runs",
      "meta_sync_runs",
      "snapchat_sync_runs",
      "tiktok_ads_sync_runs",
      "google_analytics_sync_runs",
      "salla_sync_runs",
      "zid_sync_runs",
      "shopify_sync_runs",
    ]) {
      const result = await this.db.query<{ total: unknown }>(
        `SELECT COUNT(*) AS total FROM ${table} WHERE status = 'failed' AND created_at >= $1`,
        [sinceIso]
      )
      total += Number(result.rows[0]?.total ?? 0)
    }
    return total
  }

  // ---- Payments & receipts ----

  // Every payment across customers: card payments (paid, failed, or still in checkout) and
  // approved bank transfers.
  private async loadPayments(): Promise<PlatformAdminPayment[]> {
    await this.receipts.ensureReceipts()
    const receipts = await this.db.query<{ id: string; source_type: string; source_id: string }>(
      "SELECT id, source_type, source_id FROM platform_receipts"
    )
    const receiptBySource = new Map(
      receipts.rows.map((row) => [`${row.source_type}:${row.source_id}`, row.id])
    )
    const cards = await this.db.query<Record<string, unknown>>(`
      SELECT p.*, o.name AS organization_name, pp.name AS package_name, c.code AS coupon_code
        FROM billing_moyasar_payments p
        JOIN organizations o ON o.id = p.organization_id
        LEFT JOIN platform_packages pp ON pp.id = p.package_id
        LEFT JOIN platform_coupons c ON c.id = p.coupon_id
    `)
    const transfers = await this.db.query<Record<string, unknown>>(`
      SELECT s.*, o.name AS current_organization_name
        FROM subscription_activation_requests s
        JOIN organizations o ON o.id = s.organization_id
       WHERE s.status = 'approved' AND s.deleted_at IS NULL
    `)
    const num = (value: unknown) => (value === null || value === undefined ? null : Number(value))
    return [
      ...cards.rows.map(
        (row): PlatformAdminPayment => ({
          id: String(row.id),
          method: "card",
          organizationId: String(row.organization_id),
          organizationName: String(row.organization_name),
          application: row.application as PurchasableApplication,
          packageName: (row.package_name as string | null) ?? null,
          billingInterval: (row.billing_interval as BillingInterval | null) ?? null,
          amountHalalas: Number(row.amount),
          originalAmountHalalas: num(row.original_amount),
          discountHalalas: num(row.discount_halalas),
          couponCode: (row.coupon_code as string | null) ?? null,
          status: row.status as PlatformAdminPayment["status"],
          cardBrand:
            (row.raw_payload as { source?: { company?: string } } | null)?.source?.company ?? null,
          reference: (row.moyasar_payment_id as string | null) ?? null,
          receiptId: receiptBySource.get(`card:${row.id}`) ?? null,
          createdAt: toIso(row.created_at) ?? "",
        })
      ),
      ...transfers.rows.map(
        (row): PlatformAdminPayment => ({
          id: String(row.id),
          method: "bank_transfer",
          organizationId: String(row.organization_id),
          organizationName: String(row.current_organization_name),
          application: row.application as PurchasableApplication,
          packageName: (row.package_name as string | null) ?? null,
          billingInterval: (row.billing_interval as BillingInterval | null) ?? null,
          amountHalalas: num(row.price_halalas) ?? 0,
          originalAmountHalalas: null,
          discountHalalas: null,
          couponCode: null,
          status: "paid",
          cardBrand: null,
          reference: (row.attachment_url as string | null) ?? null,
          receiptId: receiptBySource.get(`bank_transfer:${row.id}`) ?? null,
          createdAt: toIso(row.reviewed_at ?? row.created_at) ?? "",
        })
      ),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async listPayments(
    actor: AuthenticatedActor,
    filters: PlatformAdminPaymentFilters,
    page: PageRequest
  ): Promise<Page<PlatformAdminPayment>> {
    requirePlatformAdmin(actor)
    const search = filters.search?.trim().toLowerCase()
    const from = filters.from ? new Date(`${filters.from}T00:00:00+03:00`).getTime() : null
    const to = filters.to ? new Date(`${filters.to}T23:59:59.999+03:00`).getTime() : null
    const rows = (await this.loadPayments()).filter((payment) => {
      if (filters.status && payment.status !== filters.status) return false
      if (filters.method && payment.method !== filters.method) return false
      if (filters.application && payment.application !== filters.application) return false
      const at = new Date(payment.createdAt).getTime()
      if (from !== null && at < from) return false
      if (to !== null && at > to) return false
      if (search) {
        const haystack = [
          payment.organizationName,
          payment.reference,
          payment.couponCode,
          payment.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
    return paginate(rows, page)
  }

  async getPaymentSummary(actor: AuthenticatedActor): Promise<PlatformAdminPaymentSummary> {
    requirePlatformAdmin(actor)
    const payments = await this.loadPayments()
    const paid = payments.filter((payment) => payment.status === "paid")
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)
    return {
      collectedHalalas: paid.reduce((sum, payment) => sum + payment.amountHalalas, 0),
      collectedThisMonthHalalas: paid
        .filter((payment) => new Date(payment.createdAt) >= monthStart)
        .reduce((sum, payment) => sum + payment.amountHalalas, 0),
      paidCount: paid.length,
      failedCount: payments.filter((payment) => payment.status === "failed").length,
      discountsHalalas: paid.reduce((sum, payment) => sum + (payment.discountHalalas ?? 0), 0),
    }
  }

  async listReceipts(
    actor: AuthenticatedActor,
    filters: { search?: string; organizationId?: string },
    page: PageRequest
  ): Promise<Page<PlatformReceipt>> {
    requirePlatformAdmin(actor)
    const search = filters.search?.trim().toLowerCase()
    const rows = (await this.receipts.list({ organizationId: filters.organizationId })).filter(
      (receipt) =>
        !search ||
        [receipt.number, receipt.customer.name, receipt.customer.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search)
    )
    return paginate(rows, page)
  }

  async getReceipt(
    actor: AuthenticatedActor,
    receiptId: string
  ): Promise<PlatformReceipt & { seller: { name: string; email: string } }> {
    requirePlatformAdmin(actor)
    const receipt = await this.receipts.get(receiptId)
    if (!receipt) throw ERRORS.notFound("Receipt")
    const settings = await this.settings.get()
    return { ...receipt, seller: { name: settings.platformName, email: settings.supportEmail } }
  }

  // Runs the billing pass now instead of waiting for the timer (reminders, lapsing).
  async runBillingMaintenance(actor: AuthenticatedActor): Promise<BillingMaintenanceResult> {
    requirePlatformAdmin(actor)
    return this.runMaintenance()
  }

  // ---- Coupons ----

  async listCoupons(actor: AuthenticatedActor): Promise<Coupon[]> {
    requirePlatformAdmin(actor)
    return this.coupons.list()
  }

  async createCoupon(actor: AuthenticatedActor, input: CouponInput): Promise<Coupon> {
    requirePlatformAdmin(actor)
    const created = await this.coupons.create(input, actor.userId)
    await this.auditPlatform(actor, "platform_admin.coupon_created", created.id, { ...input })
    return created
  }

  async updateCoupon(
    actor: AuthenticatedActor,
    couponId: string,
    input: CouponInput
  ): Promise<Coupon> {
    requirePlatformAdmin(actor)
    const updated = await this.coupons.update(couponId, input)
    await this.auditPlatform(actor, "platform_admin.coupon_updated", couponId, { ...input })
    return updated
  }

  async deleteCoupon(actor: AuthenticatedActor, couponId: string): Promise<void> {
    requirePlatformAdmin(actor)
    await this.coupons.delete(couponId)
    await this.auditPlatform(actor, "platform_admin.coupon_deleted", couponId, {})
  }

  // ---- Platform settings ----

  async getSettings(actor: AuthenticatedActor): Promise<PlatformSettings> {
    requirePlatformAdmin(actor)
    return this.settings.get()
  }

  async updateSettings(
    actor: AuthenticatedActor,
    patch: Partial<PlatformSettings>
  ): Promise<PlatformSettings> {
    requirePlatformAdmin(actor)
    const updated = await this.settings.update(patch, actor.userId)
    await this.auditPlatform(actor, "platform_admin.settings_updated", null, { ...patch })
    return updated
  }

  private async requireOrganization(organizationId: string) {
    const result = await this.db.query(
      "SELECT 1 FROM organizations WHERE id = $1 AND deleted_at IS NULL",
      [organizationId]
    )
    if (result.rows.length === 0) throw ERRORS.notFound("Customer")
  }

  private async requireSubscription(subscriptionId: string) {
    const result = await this.db.query<Record<string, unknown>>(
      "SELECT * FROM organization_subscriptions WHERE id = $1",
      [subscriptionId]
    )
    if (!result.rows[0]) throw ERRORS.notFound("Subscription")
    return mapOrganizationSubscription(result.rows[0])
  }

  // Read, merge in JS, overwrite -- the same additive-merge approach MoyasarBillingRepository
  // takes (pg-mem doesn't handle `settings || $n::jsonb`).
  private async applySettingsPatch(organizationId: string, patch: Record<string, unknown>) {
    const existing = await this.db.query<{ settings: Record<string, unknown> | null }>(
      "SELECT settings FROM organizations WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [organizationId]
    )
    const merged = { ...(existing.rows[0]?.settings ?? {}), ...patch }
    await this.db.query(
      "UPDATE organizations SET settings = $2::jsonb, updated_at = now() WHERE id = $1",
      [organizationId, JSON.stringify(merged)]
    )
  }

  // A platform-level change (pricing, settings) -- not tied to any one customer.
  private async auditPlatform(
    actor: AuthenticatedActor,
    action: string,
    entityId: string | null,
    metadata: Record<string, unknown>
  ) {
    await writeAuditLog(this.db, {
      action,
      actorUserId: actor.userId,
      organizationId: null,
      workspaceId: null,
      entityType: "platform",
      entityId,
      metadata,
    })
  }

  private async audit(
    actor: AuthenticatedActor,
    action: string,
    subscription: OrganizationSubscriptionState,
    metadata: Record<string, unknown>
  ) {
    await writeAuditLog(this.db, {
      action,
      actorUserId: actor.userId,
      organizationId: subscription.organizationId,
      workspaceId: null,
      entityType: "organization_subscription",
      entityId: subscription.id,
      metadata,
    })
  }
}
