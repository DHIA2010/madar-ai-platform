import { describe, expect, it } from "vitest"

import {
  APPLICATION_CATALOG,
  APPLICATION_SETTINGS_KEY,
  APPLICATION_TRIAL_ENDS_AT_KEY,
  resolveApplicationStatus,
} from "./applications-catalog.service"

describe("resolveApplicationStatus", () => {
  const application = APPLICATION_CATALOG.find((entry) => entry.category === "advertising")!
  const enabledKey = APPLICATION_SETTINGS_KEY.advertising
  const trialEndsAtKey = APPLICATION_TRIAL_ENDS_AT_KEY.advertising

  it("returns subscribed when enabled and not on a trial", () => {
    expect(resolveApplicationStatus(application, { [enabledKey]: true })).toBe("subscribed")
  })

  it("returns not_subscribed when disabled with no trial", () => {
    expect(resolveApplicationStatus(application, { [enabledKey]: false })).toBe("not_subscribed")
  })

  it("returns trial while an unexpired trial is active, even if *Enabled is also true", () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(
      resolveApplicationStatus(application, { [enabledKey]: true, [trialEndsAtKey]: farFuture })
    ).toBe("trial")
  })

  // The actual bug, confirmed in production (2026-10-05): cancelling an app that's still inside
  // its free-trial window only ever cleared *Enabled -- trialEndsAt was left untouched, so this
  // branch kept returning "trial" regardless, and the card never updated even though the
  // deactivation call itself succeeded (confirmed via toast). deactivateApplication now clears
  // both fields together; this locks in that trialEndsAt must actually be cleared for a
  // cancellation to take effect while a trial is still running.
  it("regression: clearing only *Enabled is NOT enough to cancel an active trial", () => {
    const farFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    // Simulates the old, buggy deactivateApplication payload (only *Enabled flipped off).
    expect(
      resolveApplicationStatus(application, { [enabledKey]: false, [trialEndsAtKey]: farFuture })
    ).toBe("trial")

    // Simulates the fixed payload (*Enabled AND trialEndsAt cleared together).
    expect(
      resolveApplicationStatus(application, { [enabledKey]: false, [trialEndsAtKey]: "" })
    ).toBe("not_subscribed")
  })

  it("returns not_subscribed (not trial) once the trial has expired, even if trialEndsAt is still set", () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    expect(
      resolveApplicationStatus(application, { [enabledKey]: false, [trialEndsAtKey]: pastDate })
    ).toBe("not_subscribed")
  })

  it("returns pending_review when a subscription activation request is pending and nothing else applies", () => {
    expect(
      resolveApplicationStatus(application, { [enabledKey]: false }, new Set(["advertising"]))
    ).toBe("pending_review")
  })
})
