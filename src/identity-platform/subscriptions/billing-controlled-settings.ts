import { SUBSCRIPTION_APPLICATIONS, type SubscriptionApplication } from "./types"

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
  for (const [key, value] of Object.entries(settings)) {
    if (key === "currentPlanTier") {
      violations.push({ key, reason: "The plan is set by billing, not by settings." })
      continue
    }
    const application = SUBSCRIPTION_APPLICATIONS.find(
      (app) => key === `${app}Enabled` || key === `${app}TrialEndsAt` || key === `${app}TrialUsed`
    )
    if (!application) continue
    if (key === `${application}Enabled` && value !== false) {
      violations.push({
        key,
        reason: "Applications are activated by subscribing, not by settings.",
      })
    } else if (key === `${application}TrialEndsAt` && value !== "") {
      violations.push({ key, reason: "Trial dates are set by billing, not by settings." })
    } else if (key === `${application}TrialUsed`) {
      violations.push({ key, reason: "Trial usage is set by billing, not by settings." })
    }
  }
  return violations
}

// Apps a settings update is switching off -- their subscriptions end with it.
export function applicationsBeingDisabled(
  settings: Record<string, unknown> | undefined
): SubscriptionApplication[] {
  if (!settings) return []
  return SUBSCRIPTION_APPLICATIONS.filter((app) => settings[`${app}Enabled`] === false)
}
