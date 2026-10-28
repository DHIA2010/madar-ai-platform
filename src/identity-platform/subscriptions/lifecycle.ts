import type {
  BillingInterval,
  OrganizationSubscriptionState,
  PurchasableApplication,
  SubscriptionPlanTier,
  SubscriptionSource,
  SubscriptionStatus,
} from "./types"

// Pure state transitions for an organization's per-app subscription. Every activation path (trial,
// bank-transfer approval, Moyasar payment, Madar Admin actions) goes through these, so the dates
// and status mean the same thing no matter which path wrote the row.

export function addBillingInterval(fromIso: string, interval: BillingInterval): string {
  const date = new Date(fromIso)
  if (interval === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1)
  else date.setUTCMonth(date.getUTCMonth() + 1)
  return date.toISOString()
}

// Read-time status: a trial past its end is expired; a paid period past its end is overdue (the
// renewal is due -- access is still on until renewal enforcement lands with reminders/grace).
export function effectiveSubscriptionStatus(
  subscription: Pick<OrganizationSubscriptionState, "status" | "trialEndsAt" | "currentPeriodEnd">,
  nowIso: string
): SubscriptionStatus {
  const now = new Date(nowIso).getTime()
  if (subscription.status === "cancelled") return "cancelled"
  // Lapsed past its grace period and switched off by billing maintenance.
  if (subscription.status === "expired") return "expired"
  if (subscription.status === "trial") {
    return subscription.trialEndsAt && new Date(subscription.trialEndsAt).getTime() <= now
      ? "expired"
      : "trial"
  }
  return subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() <= now
    ? "overdue"
    : "active"
}

interface Identity {
  id: string
  organizationId: string
  application: PurchasableApplication
}

export function startTrial(
  existing: OrganizationSubscriptionState | null,
  input: Identity & { trialEndsAt: string; now: string }
): OrganizationSubscriptionState {
  return {
    id: existing?.id ?? input.id,
    organizationId: input.organizationId,
    application: input.application,
    status: "trial",
    planTier: null,
    packageId: null,
    packageName: null,
    billingInterval: null,
    priceHalalas: null,
    currency: "SAR",
    source: "trial",
    startedAt: input.now,
    currentPeriodEnd: null,
    trialEndsAt: input.trialEndsAt,
    cancelledAt: null,
    cancelledByUserId: null,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  }
}

// A paid activation or renewal. While a paid period is still running, the new period stacks on
// top of it (renewing early never loses days); otherwise it starts now. A trial or a cancelled /
// lapsed subscription always starts a fresh period.
export function activatePaid(
  existing: OrganizationSubscriptionState | null,
  input: Identity & {
    planTier: SubscriptionPlanTier | null
    // Omitted = keep whatever package the subscription already has (a manual renewal).
    package?: { id: string; name: string } | null
    interval: BillingInterval
    priceHalalas: number | null
    source: SubscriptionSource
    now: string
  }
): OrganizationSubscriptionState {
  const stillRunning =
    existing?.status === "active" &&
    existing.currentPeriodEnd !== null &&
    new Date(existing.currentPeriodEnd).getTime() > new Date(input.now).getTime()
  const periodStart = stillRunning ? existing.currentPeriodEnd! : input.now
  return {
    id: existing?.id ?? input.id,
    organizationId: input.organizationId,
    application: input.application,
    status: "active",
    planTier: input.planTier ?? existing?.planTier ?? null,
    packageId:
      input.package === undefined ? (existing?.packageId ?? null) : (input.package?.id ?? null),
    packageName:
      input.package === undefined ? (existing?.packageName ?? null) : (input.package?.name ?? null),
    billingInterval: input.interval,
    priceHalalas: input.priceHalalas,
    currency: "SAR",
    source: input.source,
    startedAt: stillRunning ? existing.startedAt : input.now,
    currentPeriodEnd: addBillingInterval(periodStart, input.interval),
    trialEndsAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  }
}

// A free application: active right away, with no price, until endsAt -- when billing maintenance
// switches it off with no grace period.
export function activateFree(
  existing: OrganizationSubscriptionState | null,
  input: Identity & { endsAt: string; now: string }
): OrganizationSubscriptionState {
  return {
    id: existing?.id ?? input.id,
    organizationId: input.organizationId,
    application: input.application,
    status: "active",
    planTier: null,
    packageId: null,
    packageName: null,
    billingInterval: null,
    priceHalalas: 0,
    currency: "SAR",
    source: "free",
    startedAt: input.now,
    currentPeriodEnd: input.endsAt,
    trialEndsAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  }
}

export function cancelSubscription(
  existing: OrganizationSubscriptionState,
  input: { cancelledByUserId: string; now: string }
): OrganizationSubscriptionState {
  return {
    ...existing,
    status: "cancelled",
    cancelledAt: input.now,
    cancelledByUserId: input.cancelledByUserId,
    updatedAt: input.now,
  }
}
