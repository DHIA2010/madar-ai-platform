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
import { reconcileSubscriptionsFromSettings } from "../subscriptions/reconcile"
import {
  mapOrganizationSubscription,
  PostgresOrganizationSubscriptionRepository,
} from "../subscriptions/repository"
import type {
  BillingInterval,
  OrganizationSubscriptionState,
  SubscriptionApplication,
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

  constructor(private readonly db: PostgresDatabase) {
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

  // Turns an application on for a customer from Madar Admin (a deal agreed outside checkout, a
  // goodwill extension, ...). With no price it's complimentary and adds nothing to revenue.
  async grantSubscription(
    actor: AuthenticatedActor,
    organizationId: string,
    input: {
      application: SubscriptionApplication
      planTier: SubscriptionPlanTier | null
      interval: BillingInterval
      priceHalalas: number | null
    }
  ): Promise<PlatformAdminSubscriptionView> {
    requirePlatformAdmin(actor)
    const now = new Date().toISOString()
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
          planTier: input.planTier,
          interval: input.interval,
          priceHalalas: input.priceHalalas,
          source: "admin",
          now,
        }
      )
      await this.subscriptions.save(next)
      await this.applySettingsPatch(organizationId, {
        [`${input.application}Enabled`]: true,
        [`${input.application}TrialEndsAt`]: "",
        ...(input.planTier ? { currentPlanTier: input.planTier } : {}),
      })
      await this.audit(actor, "platform_admin.subscription_granted", next, {
        application: input.application,
        planTier: input.planTier,
        interval: input.interval,
        priceHalalas: input.priceHalalas,
        currentPeriodEnd: next.currentPeriodEnd,
      })
      return toView(next, now)
    })
  }

  // Manual renewal (e.g. a bank transfer received for the next period): adds one period on top of
  // whatever is still running, at the subscription's existing price.
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
      await this.applySettingsPatch(existing.organizationId, {
        [`${existing.application}Enabled`]: true,
        [`${existing.application}TrialEndsAt`]: "",
      })
      await this.audit(actor, "platform_admin.subscription_renewed", next, {
        application: next.application,
        interval: input.interval,
        currentPeriodEnd: next.currentPeriodEnd,
      })
      return toView(next, now)
    })
  }

  // Ends the subscription now and switches the application off. Sign-in is never affected -- the
  // customer keeps their account and can subscribe again.
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
      await this.applySettingsPatch(existing.organizationId, {
        [`${existing.application}Enabled`]: false,
      })
      await this.audit(actor, "platform_admin.subscription_cancelled", next, {
        application: next.application,
      })
      return toView(next, now)
    })
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
