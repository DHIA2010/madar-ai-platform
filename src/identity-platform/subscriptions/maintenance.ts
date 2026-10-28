import { randomUUID } from "node:crypto"

import type { EmailGateway } from "../application/ports"
import { writeAuditLog } from "../infrastructure/postgres/audit-log-writer"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PlatformSettingsRepository } from "../platform-settings/types"
import { applicationsCoveredBy, deactivationSettingsPatch } from "./activation"
import { effectiveSubscriptionStatus } from "./lifecycle"
import { reconcileSubscriptionsFromSettings } from "./reconcile"
import {
  mapOrganizationSubscription,
  PostgresOrganizationSubscriptionRepository,
} from "./repository"
import type { OrganizationSubscriptionState, PurchasableApplication } from "./types"

const DAY_MS = 24 * 60 * 60 * 1000

// Arabic names for the reminder emails (the backend has no i18n layer; customers read Arabic).
const APPLICATION_LABEL_AR: Record<PurchasableApplication, string> = {
  advertising: "الحملات الإعلانية",
  ecommerce: "المتاجر الإلكترونية",
  pos: "نقطة البيع",
  madarApps: "تطبيقات مدار",
  procurement: "الموردون والمشتريات",
  expenses: "المصروفات",
  ai: "الذكاء الاصطناعي",
  customReports: "التقارير المخصصة",
  madarComplete: "مدار الكامل",
}

export interface BillingMaintenanceResult {
  remindersSent: number
  expired: number
}

// The periodic billing pass (no automatic card renewal yet -- customers renew by paying again):
//   1. Emails a reminder once per trial / paid period, `renewalReminderDays` before it ends.
//   2. Switches off a paid subscription whose period ended more than `gracePeriodDays` ago,
//      marking it expired. Trials need no step here -- their access already lapses on its own at
//      trialEndsAt (every access check reads it).
// Safe to run concurrently from several backend tasks: a reminder is claimed by inserting its row
// before sending (the unique index lets only one task win), and expiring is idempotent.
export async function runBillingMaintenance(input: {
  db: PostgresDatabase
  settings: PlatformSettingsRepository
  emailGateway: EmailGateway
  appUrl: string
  now?: Date
}): Promise<BillingMaintenanceResult> {
  const { db } = input
  const now = input.now ?? new Date()
  const nowIso = now.toISOString()
  await reconcileSubscriptionsFromSettings(db)
  const settings = await input.settings.get()

  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM organization_subscriptions WHERE status IN ('trial', 'active')"
  )
  const subscriptions = rows.rows.map(mapOrganizationSubscription)
  let remindersSent = 0
  let expired = 0

  for (const subscription of subscriptions) {
    const endsAt =
      subscription.status === "trial" ? subscription.trialEndsAt : subscription.currentPeriodEnd
    if (!endsAt) continue
    const endsAtMs = new Date(endsAt).getTime()

    if (
      endsAtMs > now.getTime() &&
      endsAtMs <= now.getTime() + settings.renewalReminderDays * DAY_MS
    ) {
      if (await sendReminder(input, subscription, endsAt)) remindersSent += 1
    }

    // A free period ends exactly on time; only paid ones get the grace period.
    const graceDays = subscription.source === "free" ? 0 : settings.gracePeriodDays
    const lapsed =
      subscription.status === "active" && endsAtMs + graceDays * DAY_MS <= now.getTime()
    if (lapsed) {
      await expire(db, subscription, subscriptions, nowIso)
      expired += 1
    }
  }

  return { remindersSent, expired }
}

async function sendReminder(
  input: { db: PostgresDatabase; emailGateway: EmailGateway; appUrl: string },
  subscription: OrganizationSubscriptionState,
  endsAt: string
): Promise<boolean> {
  const already = await input.db.query(
    "SELECT 1 FROM subscription_renewal_reminders WHERE subscription_id = $1 AND period_end = $2",
    [subscription.id, endsAt]
  )
  if (already.rows.length > 0) return false
  // The unique index is the real guard between two tasks racing past the check above.
  const claimed = await input.db.query<{ id: string }>(
    `INSERT INTO subscription_renewal_reminders (id, subscription_id, period_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (subscription_id, period_end) DO NOTHING
     RETURNING id`,
    [randomUUID(), subscription.id, endsAt]
  )
  if (claimed.rows.length === 0) return false

  const owner = await input.db.query<{ name: string; email: string | null }>(
    `SELECT o.name, u.email
       FROM organizations o
       LEFT JOIN users u ON u.id = o.owner_user_id
      WHERE o.id = $1`,
    [subscription.organizationId]
  )
  const row = owner.rows[0]
  if (!row?.email) return false
  try {
    await input.emailGateway.sendRenewalReminderEmail({
      email: row.email,
      organizationName: row.name,
      applicationLabel: APPLICATION_LABEL_AR[subscription.application],
      kind: subscription.status === "trial" || subscription.source === "free" ? "trial" : "paid",
      endsAt,
      renewUrl: `${input.appUrl.replace(/\/$/, "")}/marketplace`,
    })
    return true
  } catch (error) {
    // The reminder stays claimed -- better one missed email than a retry loop spamming the
    // customer every pass if their mailbox keeps rejecting it.
    console.error("billing.renewal_reminder_failed", { subscriptionId: subscription.id, error })
    return false
  }
}

async function expire(
  db: PostgresDatabase,
  subscription: OrganizationSubscriptionState,
  all: OrganizationSubscriptionState[],
  nowIso: string
) {
  await db.withTransaction(async () => {
    await new PostgresOrganizationSubscriptionRepository(db).save({
      ...subscription,
      status: "expired",
      updatedAt: nowIso,
    })
    // Keep any app the customer still has through another running subscription.
    const stillCovered = new Set(
      all
        .filter((other) => other.organizationId === subscription.organizationId)
        .filter((other) => other.id !== subscription.id)
        .filter((other) => {
          const status = effectiveSubscriptionStatus(other, nowIso)
          return status === "active" || status === "trial" || status === "overdue"
        })
        .flatMap((other) => applicationsCoveredBy(other.application))
    )
    const patch = deactivationSettingsPatch(subscription.application, stillCovered)
    const existing = await db.query<{ settings: Record<string, unknown> | null }>(
      "SELECT settings FROM organizations WHERE id = $1 FOR UPDATE",
      [subscription.organizationId]
    )
    await db.query(
      "UPDATE organizations SET settings = $2::jsonb, updated_at = now() WHERE id = $1",
      [
        subscription.organizationId,
        JSON.stringify({ ...(existing.rows[0]?.settings ?? {}), ...patch }),
      ]
    )
    await writeAuditLog(db, {
      action: "billing.subscription_expired",
      actorUserId: null,
      organizationId: subscription.organizationId,
      workspaceId: null,
      entityType: "organization_subscription",
      entityId: subscription.id,
      metadata: { application: subscription.application, periodEnd: subscription.currentPeriodEnd },
    })
  })
}
