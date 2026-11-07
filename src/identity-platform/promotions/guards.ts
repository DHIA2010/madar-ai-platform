import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Promotions' own copy of expenses/guards.ts -- same duplication convention as every other
// per-application guard: feature modules must not reach into each other's internals.
export async function isPromotionsEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings.promotionsEnabled !== true) {
    return false
  }
  const trialEndsAt = settings.promotionsTrialEndsAt
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

export async function requirePromotionsEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<void> {
  if (!(await isPromotionsEnabled(db, organizationId))) {
    throw ERRORS.forbidden()
  }
}
