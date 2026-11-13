import { MADAR_COMPLETE, SUBSCRIPTION_APPLICATIONS } from "./types"

// The organizations.settings keys that grant paid access. Only billing paths (trial, payment,
// bank-transfer approval, Madar Admin) may turn them on -- a customer's own settings update may
// only switch an app OFF (and clear its trial marker while doing so). Without this, any
// organization owner could unlock any paid app with a plain settings PATCH.
export type BillingSettingsViolation = { key: string; reason: string }

export function findBillingSettingsViolations(
  settings: Record<string, unknown> | undefined
): BillingSettingsViolation[] {
  if (!settings) return []
  const violations: BillingSettingsViolation[] = []
  for (const key of Object.keys(settings)) {
    if (key === "currentPlanTier") {
      violations.push({ key, reason: "The plan is set by billing, not by settings." })
      continue
    }
    // The bundle has no flags of its own, only the marker that its one trial has been taken.
    if (key === `${MADAR_COMPLETE}TrialUsed`) {
      violations.push({ key, reason: "Trial usage is set by billing, not by settings." })
      continue
    }
    const application = SUBSCRIPTION_APPLICATIONS.find(
      (app) => key === `${app}Enabled` || key === `${app}TrialEndsAt` || key === `${app}TrialUsed`
    )
    if (!application) continue
    // Switching an application on or off is billing's: it's activated by subscribing (or a trial)
    // and runs to the end of its period -- customers can't cancel it from their settings.
    if (key === `${application}Enabled`) {
      violations.push({
        key,
        reason: "Applications are switched on and off by their subscription, not by settings.",
      })
    } else if (key === `${application}TrialEndsAt`) {
      violations.push({ key, reason: "Trial dates are set by billing, not by settings." })
    } else if (key === `${application}TrialUsed`) {
      violations.push({ key, reason: "Trial usage is set by billing, not by settings." })
    }
  }
  return violations
}
