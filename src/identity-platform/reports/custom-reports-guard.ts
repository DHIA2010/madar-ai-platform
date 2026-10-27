import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Gates the custom report builder specifically -- NOT the ready-made reports (ready-reports-
// service.ts), which stay free/unpaywalled as they are today. Same duplication convention as
// every other *Enabled-flag guard in this codebase (procurement/guards.ts, expenses/guards.ts,
// ai-chat/app-guard.ts): a small, hardcoded check rather than reaching into another feature's
// internals.
export async function isCustomReportsEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings.customReportsEnabled !== true) {
    return false
  }
  const trialEndsAt = settings.customReportsTrialEndsAt
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

export async function requireCustomReportsEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<void> {
  if (!(await isCustomReportsEnabled(db, organizationId))) {
    throw ERRORS.forbidden()
  }
}
