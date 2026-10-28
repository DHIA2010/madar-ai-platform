import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type {
  OrganizationSubscriptionRepository,
  OrganizationSubscriptionState,
  PurchasableApplication,
} from "./types"

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

export function mapOrganizationSubscription(
  row: Record<string, unknown>
): OrganizationSubscriptionState {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    application: row.application as OrganizationSubscriptionState["application"],
    status: row.status as OrganizationSubscriptionState["status"],
    planTier: (row.plan_tier as OrganizationSubscriptionState["planTier"]) ?? null,
    packageId: (row.package_id as string | null) ?? null,
    packageName: (row.package_name as string | null) ?? null,
    billingInterval:
      (row.billing_interval as OrganizationSubscriptionState["billingInterval"]) ?? null,
    priceHalalas:
      row.price_halalas === null || row.price_halalas === undefined
        ? null
        : Number(row.price_halalas),
    currency: String(row.currency ?? "SAR"),
    source: row.source as OrganizationSubscriptionState["source"],
    startedAt: toIso(row.started_at) ?? "",
    currentPeriodEnd: toIso(row.current_period_end),
    trialEndsAt: toIso(row.trial_ends_at),
    cancelledAt: toIso(row.cancelled_at),
    cancelledByUserId: (row.cancelled_by_user_id as string | null) ?? null,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

// Plain-db implementation, usable both through IdentityRepositories and directly by services that
// already write organizations.settings with raw SQL (Moyasar billing, Madar Admin) -- inside their
// own db.withTransaction, since PostgresDatabase scopes queries to the active transaction.
export class PostgresOrganizationSubscriptionRepository implements OrganizationSubscriptionRepository {
  constructor(private readonly db: PostgresDatabase) {}

  async findByOrganizationAndApplication(
    organizationId: string,
    application: PurchasableApplication
  ) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "organization-subscriptions-find",
      text: "SELECT * FROM organization_subscriptions WHERE organization_id = $1 AND application = $2 LIMIT 1",
      values: [organizationId, application],
    })
    return result.rows[0] ? mapOrganizationSubscription(result.rows[0]) : null
  }

  async listByOrganizationId(organizationId: string) {
    const result = await this.db.query<Record<string, unknown>>({
      name: "organization-subscriptions-list-org",
      text: "SELECT * FROM organization_subscriptions WHERE organization_id = $1 ORDER BY started_at DESC",
      values: [organizationId],
    })
    return result.rows.map(mapOrganizationSubscription)
  }

  async save(entry: OrganizationSubscriptionState) {
    await this.db.query({
      name: "organization-subscriptions-upsert",
      text: `
        INSERT INTO organization_subscriptions (
          id, organization_id, application, status, plan_tier, billing_interval, price_halalas,
          currency, source, started_at, current_period_end, trial_ends_at, cancelled_at,
          cancelled_by_user_id, created_at, updated_at, package_id, package_name
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (organization_id, application) DO UPDATE SET
          status = EXCLUDED.status,
          plan_tier = EXCLUDED.plan_tier,
          billing_interval = EXCLUDED.billing_interval,
          price_halalas = EXCLUDED.price_halalas,
          currency = EXCLUDED.currency,
          source = EXCLUDED.source,
          started_at = EXCLUDED.started_at,
          current_period_end = EXCLUDED.current_period_end,
          trial_ends_at = EXCLUDED.trial_ends_at,
          cancelled_at = EXCLUDED.cancelled_at,
          cancelled_by_user_id = EXCLUDED.cancelled_by_user_id,
          updated_at = EXCLUDED.updated_at,
          package_id = EXCLUDED.package_id,
          package_name = EXCLUDED.package_name
      `,
      values: [
        entry.id,
        entry.organizationId,
        entry.application,
        entry.status,
        entry.planTier,
        entry.billingInterval,
        entry.priceHalalas,
        entry.currency,
        entry.source,
        entry.startedAt,
        entry.currentPeriodEnd,
        entry.trialEndsAt,
        entry.cancelledAt,
        entry.cancelledByUserId,
        entry.createdAt,
        entry.updatedAt,
        entry.packageId,
        entry.packageName,
      ],
    })
  }
}

export class InMemoryOrganizationSubscriptionRepository implements OrganizationSubscriptionRepository {
  private readonly rows = new Map<string, OrganizationSubscriptionState>()

  private key(organizationId: string, application: string) {
    return `${organizationId}:${application}`
  }

  async findByOrganizationAndApplication(
    organizationId: string,
    application: PurchasableApplication
  ) {
    const row = this.rows.get(this.key(organizationId, application))
    return row ? { ...row } : null
  }

  async listByOrganizationId(organizationId: string) {
    return [...this.rows.values()]
      .filter((row) => row.organizationId === organizationId)
      .map((row) => ({ ...row }))
  }

  async save(entry: OrganizationSubscriptionState) {
    this.rows.set(this.key(entry.organizationId, entry.application), { ...entry })
  }
}
