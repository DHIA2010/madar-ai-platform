import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"

import type { ApplicationCategoryId } from "./types"

// A third copy of this map (frontend: applications-catalog.service.ts, backend:
// command-handlers.ts's private APPLICATION_SETTINGS_KEY) -- consistent with the existing
// duplication precedent there: ai-chat/ must not reach into IdentityCommandHandlers' private
// members, and command-handlers.ts must not import feature modules.
const APPLICATION_SETTINGS_KEY: Record<ApplicationCategoryId, string> = {
  advertising: "advertisingEnabled",
  ecommerce: "ecommerceEnabled",
  pos: "posEnabled",
  madarApps: "madarAppsEnabled",
}

// A free trial (command-handlers.ts's startApplicationTrial) sets the *Enabled flag true and
// never clears it itself -- expiry is a lazy, read-time check against *TrialEndsAt rather than a
// scheduled job flipping the flag back off (see that command's own comment). So *Enabled alone is
// not enough here: a trial that has lapsed without a real paid approval must read as disabled,
// while a real approval (which always clears *TrialEndsAt, see approveSubscriptionActivationRequest)
// is unaffected by any earlier trial history.
export async function isApplicationEnabled(
  db: PostgresDatabase,
  organizationId: string,
  category: ApplicationCategoryId
): Promise<boolean> {
  const result = await db.query<{ settings: Record<string, unknown> }>(
    "select settings from organizations where id = $1 and deleted_at is null",
    [organizationId]
  )
  const settings = result.rows[0]?.settings ?? {}
  if (settings[APPLICATION_SETTINGS_KEY[category]] !== true) {
    return false
  }
  const trialEndsAt = settings[`${category}TrialEndsAt`]
  if (
    typeof trialEndsAt === "string" &&
    trialEndsAt !== "" &&
    new Date(trialEndsAt).getTime() <= Date.now()
  ) {
    return false
  }
  return true
}

// First check in this codebase that actually enforces application-activation server-side --
// every existing data route only checks role-based modulePermissions, never the org's
// *Enabled flags. Called on both session creation AND every message send (an org can
// deactivate an application mid-conversation; a stale session must not keep answering).
export async function requireApplicationEnabled(
  db: PostgresDatabase,
  organizationId: string,
  category: ApplicationCategoryId
): Promise<void> {
  if (!(await isApplicationEnabled(db, organizationId, category))) {
    throw ERRORS.forbidden()
  }
}
