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

// What's stored. "expired" and "overdue" are never stored -- they're derived from the dates at read
// time (see effectiveSubscriptionStatus), the same lazy-expiry approach the `{app}TrialEndsAt`
// access checks already use, so nothing has to run on a schedule for them to be accurate.
export type StoredSubscriptionStatus = "trial" | "active" | "cancelled"
export type SubscriptionStatus = StoredSubscriptionStatus | "overdue" | "expired"

export type SubscriptionPlanTier = "starter" | "growth" | "pro" | "enterprise"
export type BillingInterval = "monthly" | "yearly"
// How the subscription was obtained. "existing" marks one created from an organization's
// settings for an app activated before subscriptions were recorded (dates unknown).
export type SubscriptionSource = "trial" | "payment" | "bank_transfer" | "admin" | "existing"

export interface OrganizationSubscriptionState {
  id: string
  organizationId: string
  application: SubscriptionApplication
  status: StoredSubscriptionStatus
  planTier: SubscriptionPlanTier | null
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
    application: SubscriptionApplication
  ): Promise<OrganizationSubscriptionState | null>
  listByOrganizationId(organizationId: string): Promise<OrganizationSubscriptionState[]>
  // Upserts on (organization_id, application) -- one current subscription per app.
  save(entry: OrganizationSubscriptionState): Promise<void>
}
