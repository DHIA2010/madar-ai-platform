import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

// Gates the AI feature itself -- a separate, standalone subscription from the per-category
// *Enabled flags this same file's sibling guards.ts already enforces. A chat session is always
// scoped to exactly one of those OTHER categories (which data to ask about), but using AI at all
// now additionally requires this flag, checked alongside (not instead of) that per-category one.
// Deliberately not parameterized by ApplicationCategoryId the way guards.ts's
// isApplicationEnabled/requireApplicationEnabled are -- "ai" is intentionally excluded from that
// local chat-scope union (see types.ts's own comment), so this is its own small, hardcoded check
// rather than a 7th case shoehorned into that generic function.
export async function isAiAppEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings.aiEnabled !== true) {
    return false
  }
  const trialEndsAt = settings.aiTrialEndsAt
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

export async function requireAiAppEnabled(
  db: PostgresDatabase,
  organizationId: string
): Promise<void> {
  if (!(await isAiAppEnabled(db, organizationId))) {
    throw ERRORS.forbidden()
  }
}
