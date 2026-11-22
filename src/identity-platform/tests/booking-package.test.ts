// @vitest-environment node
//
// Booking is sold as one package that also opens Loyalty (migration 180, subscriptions/types.ts's
// INCLUDED_APPLICATIONS): it is switched on with it, tried with its free trial, switched off with
// it unless the customer has it some other way, and never given a subscription of its own for
// being on. From the cashier it gets only the invoices side (migration 185, app-access.ts).

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { defaultPricingFor } from "../pricing/defaults"
import {
  activationSettingsPatch,
  applicationsCoveredBy,
  deactivationSettingsPatch,
  includedTrialSettingsPatch,
} from "../subscriptions/activation"
import { BRANCH_APPLICATIONS } from "../subscriptions/branches"
import { loadOrganizationEntitlements } from "../subscriptions/entitlements"
import { reconcileSubscriptionsFromSettings } from "../subscriptions/reconcile"
import { enabledSettingsKeysFor } from "../subscriptions/types"

describe("the Booking package", () => {
  it("covers Loyalty but not the cashier, and only Booking brings anything", () => {
    expect(applicationsCoveredBy("booking")).toEqual(["booking", "loyalty"])
    expect(applicationsCoveredBy("pos")).toEqual(["pos"])
    expect(applicationsCoveredBy("loyalty")).toEqual(["loyalty"])
    expect(enabledSettingsKeysFor("booking")).toEqual(["bookingEnabled", "loyaltyEnabled"])
    expect(BRANCH_APPLICATIONS).toContain("booking")
  })

  it("switches both on when paid, clearing any trial marker", () => {
    expect(activationSettingsPatch("booking", null)).toEqual({
      bookingEnabled: true,
      bookingTrialEndsAt: "",
      loyaltyEnabled: true,
      loyaltyTrialEndsAt: "",
    })
  })

  it("switches them off when it ends, except what the customer has another way", () => {
    expect(deactivationSettingsPatch("booking", new Set())).toEqual({
      bookingEnabled: false,
      loyaltyEnabled: false,
    })
    // They also pay for Loyalty on its own: it stays.
    expect(deactivationSettingsPatch("booking", new Set(["loyalty"] as const))).toEqual({
      bookingEnabled: false,
    })
  })

  it("tries Loyalty along with a Booking trial, and leaves the cashier alone", () => {
    const endsAt = "2026-12-01T00:00:00.000Z"
    expect(includedTrialSettingsPatch({}, "booking", endsAt)).toEqual({
      loyaltyEnabled: true,
      loyaltyTrialEndsAt: endsAt,
      loyaltyTrialUsed: true,
    })
    // A Loyalty trial ending later is not cut short; one ending sooner runs to the Booking
    // trial's end.
    expect(
      includedTrialSettingsPatch(
        { posEnabled: true, loyaltyEnabled: true, loyaltyTrialEndsAt: "2026-12-05T00:00:00.000Z" },
        "booking",
        endsAt
      )
    ).toEqual({})
    expect(
      includedTrialSettingsPatch(
        { loyaltyEnabled: true, loyaltyTrialEndsAt: "2026-11-25T00:00:00.000Z" },
        "booking",
        endsAt
      )
    ).toEqual({ loyaltyEnabled: true, loyaltyTrialEndsAt: endsAt, loyaltyTrialUsed: true })
    // No other app brings anything with it.
    expect(includedTrialSettingsPatch({}, "pos", endsAt)).toEqual({})
  })

  it("is one package at 299 a month and 2,999 a year, without the cashier's extras", () => {
    const { mode, packages } = defaultPricingFor("booking")
    expect(mode).toBe("fixed")
    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({
      name: "الحجوزات الشاملة",
      monthlyPriceHalalas: 29900,
      yearlyPriceHalalas: 299900,
      includedBranches: 1,
      extraBranchMonthlyHalalas: 9900,
      extraBranchYearlyHalalas: 99900,
      entitlements: { customRoles: true, customReports: true },
      legacyPlanTier: null,
    })
  })
})

describe("the Booking package in the database", () => {
  let database: PostgresDatabase

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
  })
  afterEach(async () => {
    await database.end()
  })

  async function organization(settings: Record<string, unknown>) {
    const userId = randomUUID()
    const id = randomUUID()
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, $2, 'hash', 'Owner', now())`,
      [userId, `${id}@madar.test`]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status, settings)
       values ($1, 'Salon', $2, 'active', $3::jsonb)`,
      [id, userId, JSON.stringify(settings)]
    )
    return id
  }

  async function subscription(
    organizationId: string,
    application: string,
    status: "trial" | "active"
  ) {
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60_000).toISOString()
    await database.query(
      `insert into organization_subscriptions
         (id, organization_id, application, status, source, started_at, trial_ends_at,
          current_period_end)
       values ($1, $2, $3, $4, $5, now(), $6, $7)`,
      [
        randomUUID(),
        organizationId,
        application,
        status,
        status === "trial" ? "trial" : "payment",
        status === "trial" ? soon : null,
        status === "trial" ? null : soon,
      ]
    )
  }

  const applicationsOf = async (organizationId: string) =>
    (
      await database.query<{ application: string }>(
        "select application from organization_subscriptions where organization_id = $1",
        [organizationId]
      )
    ).rows
      .map((row) => row.application)
      .sort()

  it("gives Loyalty no subscription of its own for coming with Booking", async () => {
    const on = { bookingEnabled: true, loyaltyEnabled: true }
    const withBooking = await organization(on)
    await subscription(withBooking, "booking", "active")
    // Switched on some older way, with nothing recorded: these still get their rows.
    const older = await organization({ loyaltyEnabled: true, posEnabled: true })

    await reconcileSubscriptionsFromSettings(database)

    expect(await applicationsOf(withBooking)).toEqual(["booking"])
    expect(await applicationsOf(older)).toEqual(["loyalty", "pos"])
  })

  it("opens roles and reports, not the cashier's extras, during a Booking trial", async () => {
    const trying = await organization({ bookingEnabled: true })
    await subscription(trying, "booking", "trial")
    expect(await loadOrganizationEntitlements(database, trying)).toMatchObject({
      shiftCash: false,
      customRoles: true,
      customReports: true,
      invoicing: false,
      procurement: false,
    })
  })

  it("writes the one package to an environment that already had pricing", async () => {
    const stored = await database.query<{
      name: string
      monthly_price_halalas: number
      yearly_price_halalas: number
    }>(
      "select name, monthly_price_halalas, yearly_price_halalas from platform_packages where application = 'booking'"
    )
    // A fresh database has no packages until pricing is first read; the revision is recorded so
    // the change is never applied a second time.
    expect(stored.rows.length).toBeLessThanOrEqual(1)
    const revision = await database.query(
      "select id from platform_pricing_revisions where id in ('2026-11-booking-complete', '2026-11-booking-invoices-only')"
    )
    expect(revision.rows).toHaveLength(2)
  })
})
