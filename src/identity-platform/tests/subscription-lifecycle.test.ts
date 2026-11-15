// @vitest-environment node
//
// When a paid period starts (subscriptions/lifecycle.ts): paying early, whether during a free
// trial or before a paid period runs out, never costs the days that are left.

import { describe, expect, it } from "vitest"

import { activatePaid, addBillingInterval, startTrial } from "../subscriptions/lifecycle"

const identity = { id: "sub-1", organizationId: "org-1", application: "pos" as const }
const paid = { planTier: null, interval: "monthly" as const, priceHalalas: 7900 }

describe("subscription lifecycle: paying early", () => {
  it("starts the paid period at the trial's end when paid during the trial", () => {
    const trial = startTrial(null, {
      ...identity,
      now: "2026-11-13T09:00:00.000Z",
      trialEndsAt: "2026-11-27T09:00:00.000Z",
    })
    const subscription = activatePaid(trial, {
      ...identity,
      ...paid,
      source: "payment",
      now: "2026-11-15T12:00:00.000Z",
    })
    expect(subscription).toMatchObject({ status: "active", trialEndsAt: null, priceHalalas: 7900 })
    expect(subscription.currentPeriodEnd).toBe(
      addBillingInterval("2026-11-27T09:00:00.000Z", "monthly")
    )
  })

  it("keeps the bundle trial's days for an app whose own trial already ended", () => {
    // Its own trial ran out, then the bundle's trial opened it again: no trial row of its own is
    // running, but the account's settings say when the app's access ends.
    const ownTrial = startTrial(null, {
      ...identity,
      now: "2026-11-05T09:00:00.000Z",
      trialEndsAt: "2026-11-12T09:00:00.000Z",
    })
    const bundleTrialEnd = "2026-11-28T05:55:03.819Z"
    const subscription = activatePaid(ownTrial, {
      ...identity,
      ...paid,
      source: "payment",
      now: "2026-11-15T12:00:00.000Z",
      trialEndsAt: bundleTrialEnd,
    })
    expect(subscription.currentPeriodEnd).toBe(addBillingInterval(bundleTrialEnd, "monthly"))

    // And for an app with no subscription of its own at all.
    const fresh = activatePaid(null, {
      ...identity,
      ...paid,
      source: "payment",
      now: "2026-11-15T12:00:00.000Z",
      trialEndsAt: bundleTrialEnd,
    })
    expect(fresh.currentPeriodEnd).toBe(addBillingInterval(bundleTrialEnd, "monthly"))
  })

  it("starts now when the trial has already ended", () => {
    const trial = startTrial(null, {
      ...identity,
      now: "2026-10-01T09:00:00.000Z",
      trialEndsAt: "2026-10-15T09:00:00.000Z",
    })
    const now = "2026-11-15T12:00:00.000Z"
    const subscription = activatePaid(trial, { ...identity, ...paid, source: "payment", now })
    expect(subscription.currentPeriodEnd).toBe(addBillingInterval(now, "monthly"))
  })

  it("stacks a renewal on top of a paid period that is still running", () => {
    const first = activatePaid(null, {
      ...identity,
      ...paid,
      source: "payment",
      now: "2026-11-01T00:00:00.000Z",
    })
    const renewed = activatePaid(first, {
      ...identity,
      ...paid,
      source: "payment",
      now: "2026-11-10T00:00:00.000Z",
    })
    expect(renewed.currentPeriodEnd).toBe(addBillingInterval(first.currentPeriodEnd!, "monthly"))
  })
})
