import { randomUUID } from "node:crypto"

import type { PostgresDatabase } from "../infrastructure/postgres/database"
import { PostgresOrganizationSubscriptionRepository } from "./repository"
import { SUBSCRIPTION_APPLICATIONS, type SubscriptionPlanTier } from "./types"

const PLAN_TIERS = new Set(["starter", "growth", "pro", "enterprise"])
// Every trial started before subscriptions were recorded ran for exactly this long (the fixed
// TRIAL_DURATION_DAYS at the time), so its real start date can be recovered from its end.
const LEGACY_TRIAL_DAYS = 7

// Gives every application an organization has switched on in organizations.settings a
// subscription row, if it doesn't have one yet -- the lazy backfill for apps activated before
// organization_subscriptions existed (or by any path that only sets the flag, e.g. a Zid install
// that provisions ecommerce). Insert-only and idempotent: a row that already exists is never
// touched, so dates written by a real trial/payment/approval always win. Done here rather than in
// the migration because every migration replays on every boot and pg-mem has no gen_random_uuid().
export async function reconcileSubscriptionsFromSettings(db: PostgresDatabase): Promise<number> {
  const organizations = await db.query<{ id: string; settings: Record<string, unknown> | null }>(
    "SELECT id, settings FROM organizations WHERE deleted_at IS NULL"
  )
  const existing = await db.query<{ organization_id: string; application: string }>(
    "SELECT organization_id, application FROM organization_subscriptions"
  )
  const have = new Set(existing.rows.map((row) => `${row.organization_id}:${row.application}`))
  const repository = new PostgresOrganizationSubscriptionRepository(db)
  const now = new Date().toISOString()
  let created = 0

  for (const organization of organizations.rows) {
    const settings = organization.settings ?? {}
    for (const application of SUBSCRIPTION_APPLICATIONS) {
      if (settings[`${application}Enabled`] !== true) continue
      if (have.has(`${organization.id}:${application}`)) continue

      const trialEndsAt = settings[`${application}TrialEndsAt`]
      const isTrial = typeof trialEndsAt === "string" && trialEndsAt.length > 0
      const tier = settings.currentPlanTier
      await repository.save({
        id: randomUUID(),
        organizationId: organization.id,
        application,
        status: isTrial ? "trial" : "active",
        planTier:
          !isTrial && typeof tier === "string" && PLAN_TIERS.has(tier)
            ? (tier as SubscriptionPlanTier)
            : null,
        billingInterval: null,
        priceHalalas: null,
        currency: "SAR",
        source: isTrial ? "trial" : "existing",
        // A pre-existing paid activation's start is unknown ("existing" tells the UI not to show
        // it); a trial's is its end minus the fixed trial length.
        startedAt: isTrial
          ? new Date(
              new Date(trialEndsAt).getTime() - LEGACY_TRIAL_DAYS * 24 * 60 * 60 * 1000
            ).toISOString()
          : now,
        currentPeriodEnd: null,
        trialEndsAt: isTrial ? new Date(trialEndsAt).toISOString() : null,
        cancelledAt: null,
        cancelledByUserId: null,
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    }
  }
  return created
}
