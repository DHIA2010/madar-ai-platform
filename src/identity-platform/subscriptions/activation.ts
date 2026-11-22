import {
  INCLUDED_APPLICATIONS,
  MADAR_COMPLETE,
  type PurchasableApplication,
  SUBSCRIPTION_APPLICATIONS,
  type SubscriptionApplication,
  type SubscriptionPlanTier,
} from "./types"

// The applications a purchase covers: the application itself with the ones that come with it
// (Booking brings Loyalty), or every application for the Madar Complete bundle.
export function applicationsCoveredBy(
  application: PurchasableApplication
): SubscriptionApplication[] {
  if (application === MADAR_COMPLETE) return [...SUBSCRIPTION_APPLICATIONS]
  return [application, ...(INCLUDED_APPLICATIONS[application] ?? [])]
}

// organizations.settings changes for the applications that come with the one being tried: each
// opens until the trial ends, under the same rules as the bundle's trial below (one the customer
// pays for is left alone; one on its own trial is only ever extended).
export function includedTrialSettingsPatch(
  settings: Record<string, unknown>,
  application: SubscriptionApplication,
  trialEndsAt: string
): Record<string, string | boolean> {
  const patch: Record<string, string | boolean> = {}
  const endsAtMs = new Date(trialEndsAt).getTime()
  for (const app of INCLUDED_APPLICATIONS[application] ?? []) {
    if (settings[`${app}Enabled`] === true) {
      const marker = settings[`${app}TrialEndsAt`]
      const onTrial = typeof marker === "string" && marker !== ""
      if (!onTrial || new Date(marker).getTime() >= endsAtMs) continue
    }
    patch[`${app}Enabled`] = true
    patch[`${app}TrialEndsAt`] = trialEndsAt
    patch[`${app}TrialUsed`] = true
  }
  return patch
}

// organizations.settings changes for a paid activation: switch the covered applications on and
// clear any trial marker (a stale *TrialEndsAt would otherwise make access checks treat the paid
// app as a lapsed trial). The account-wide tier is kept in step when the package maps to one.
export function activationSettingsPatch(
  application: PurchasableApplication,
  legacyPlanTier: SubscriptionPlanTier | null
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const app of applicationsCoveredBy(application)) {
    patch[`${app}Enabled`] = true
    patch[`${app}TrialEndsAt`] = ""
  }
  if (legacyPlanTier) patch.currentPlanTier = legacyPlanTier
  return patch
}

// organizations.settings changes for a trial of the Madar Complete bundle: every application the
// customer doesn't already have opens until the trial ends. An application they pay for (or have
// free) is left alone, and one on its own trial is only ever extended, never cut short. `opened`
// lists the applications the trial actually gives them -- none means there's nothing to try.
export function bundleTrialSettingsPatch(
  settings: Record<string, unknown>,
  trialEndsAt: string
): { patch: Record<string, string | boolean>; opened: SubscriptionApplication[] } {
  const patch: Record<string, string | boolean> = {}
  const opened: SubscriptionApplication[] = []
  const endsAtMs = new Date(trialEndsAt).getTime()
  for (const app of SUBSCRIPTION_APPLICATIONS) {
    if (settings[`${app}Enabled`] === true) {
      const marker = settings[`${app}TrialEndsAt`]
      const onTrial = typeof marker === "string" && marker !== ""
      if (!onTrial || new Date(marker).getTime() >= endsAtMs) continue
    }
    patch[`${app}Enabled`] = true
    patch[`${app}TrialEndsAt`] = trialEndsAt
    patch[`${app}TrialUsed`] = true
    opened.push(app)
  }
  patch[`${MADAR_COMPLETE}TrialUsed`] = true
  return { patch, opened }
}

// organizations.settings changes when a subscription ends: switch its applications off, except
// any the customer still has through another running subscription (e.g. ending the bundle keeps
// an app they also pay for on its own).
export function deactivationSettingsPatch(
  application: PurchasableApplication,
  stillCovered: ReadonlySet<SubscriptionApplication>
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const app of applicationsCoveredBy(application)) {
    if (!stillCovered.has(app)) patch[`${app}Enabled`] = false
  }
  return patch
}
