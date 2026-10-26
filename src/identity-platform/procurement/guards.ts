import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Procurement's own copy of ai-chat/guards.ts's isApplicationEnabled/requireApplicationEnabled --
// same duplication convention as every other APPLICATION_SETTINGS_KEY-style copy in this codebase
// (frontend applications-catalog.service.ts, command-handlers.ts, billing/moyasar/service.ts,
// ai-chat/guards.ts itself): feature modules must not reach into each other's internals. Only
// ever checks "procurement" (Supply & Purchase), so there's no need for the full
// ApplicationCategoryId union here -- see ai-chat/guards.ts for the general-purpose version this
// mirrors, including the full explanation of the lazy trial-expiry check below.
//
// Procurement is the second app in this codebase (after AI chat) to get real server-side
// enforcement of its activation flag -- every other app (POS, ecommerce, advertising) is gated
// only by role-based modulePermissions today, never organizations.settings.
export async function isProcurementEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings.procurementEnabled !== true) {
    return false
  }
  const trialEndsAt = settings.procurementTrialEndsAt
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

export async function requireProcurementEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<void> {
  if (!(await isProcurementEnabled(db, organizationId))) {
    throw ERRORS.forbidden()
  }
}
