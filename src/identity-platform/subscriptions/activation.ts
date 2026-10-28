import {
  MADAR_COMPLETE,
  type PurchasableApplication,
  SUBSCRIPTION_APPLICATIONS,
  type SubscriptionApplication,
  type SubscriptionPlanTier,
} from "./types"

// The applications a purchase covers: one, or every application for the Madar Complete bundle.
export function applicationsCoveredBy(
  application: PurchasableApplication
): SubscriptionApplication[] {
  return application === MADAR_COMPLETE ? [...SUBSCRIPTION_APPLICATIONS] : [application]
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
