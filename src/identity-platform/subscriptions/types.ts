// The real subscription behind each organization's per-application `{app}Enabled` settings flag --
// see identity-platform/migrations/116_organization_subscriptions.sql.

export const SUBSCRIPTION_APPLICATIONS = [
  "advertising",
  "ecommerce",
  "pos",
  "madarApps",
  "procurement",
  "expenses",
  "ai",
  "customReports",
] as const
export type SubscriptionApplication = (typeof SUBSCRIPTION_APPLICATIONS)[number]

// Everything a customer can buy: each application, plus the "Madar Complete" bundle, which turns
// every application on (it has no settings flag of its own).
export const MADAR_COMPLETE = "madarComplete"
export const PURCHASABLE_APPLICATIONS = [...SUBSCRIPTION_APPLICATIONS, MADAR_COMPLETE] as const
export type PurchasableApplication = (typeof PURCHASABLE_APPLICATIONS)[number]

// The organizations.settings flags a purchase of `application` switches on.
export function enabledSettingsKeysFor(application: PurchasableApplication): string[] {
  const applications = application === MADAR_COMPLETE ? SUBSCRIPTION_APPLICATIONS : [application]
  return applications.map((app) => `${app}Enabled`)
}

// What's stored. "expired" and "overdue" are never stored -- they're derived from the dates at read
// time (see effectiveSubscriptionStatus), the same lazy-expiry approach the `{app}TrialEndsAt`
// access checks already use, so nothing has to run on a schedule for them to be accurate.
export type StoredSubscriptionStatus = "trial" | "active" | "cancelled" | "expired"
export type SubscriptionStatus = StoredSubscriptionStatus | "overdue" | "expired"

export type SubscriptionPlanTier = "starter" | "growth" | "pro" | "enterprise"
export type BillingInterval = "monthly" | "yearly"
// How the subscription was obtained. "existing" marks one created from an organization's
// settings for an app activated before subscriptions were recorded (dates unknown). "free" is an
// application Madar Admin sells as free, activated by the customer without paying.
export type SubscriptionSource =
  | "trial"
  | "payment"
  | "bank_transfer"
  | "admin"
  | "existing"
  | "free"

export interface OrganizationSubscriptionState {
  id: string
  organizationId: string
  application: PurchasableApplication
  status: StoredSubscriptionStatus
  planTier: SubscriptionPlanTier | null
  // The Madar Admin package bought (null for trials and pre-package activations), with its name
  // snapshotted at purchase so a later rename/delete doesn't rewrite history.
  packageId: string | null
  packageName: string | null
  billingInterval: BillingInterval | null
  priceHalalas: number | null
  currency: string
  source: SubscriptionSource
  startedAt: string
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelledAt: string | null
  cancelledByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationSubscriptionRepository {
  findByOrganizationAndApplication(
    organizationId: string,
    application: PurchasableApplication
  ): Promise<OrganizationSubscriptionState | null>
  listByOrganizationId(organizationId: string): Promise<OrganizationSubscriptionState[]>
  // Upserts on (organization_id, application) -- one current subscription per app.
  save(entry: OrganizationSubscriptionState): Promise<void>
}
