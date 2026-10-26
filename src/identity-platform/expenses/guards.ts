import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Expenses' own copy of procurement/guards.ts's isProcurementEnabled/requireProcurementEnabled
// (itself a copy of ai-chat/guards.ts's general-purpose version) -- same duplication convention
// as every other APPLICATION_SETTINGS_KEY-style copy in this codebase: feature modules must not
// reach into each other's internals. Only ever checks "expenses", so there's no need for the full
// ApplicationCategoryId union here.
export async function isExpensesEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings.expensesEnabled !== true) {
    return false
  }
  const trialEndsAt = settings.expensesTrialEndsAt
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

export async function requireExpensesEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<void> {
  if (!(await isExpensesEnabled(db, organizationId))) {
    throw ERRORS.forbidden()
  }
}
