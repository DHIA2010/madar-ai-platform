// @vitest-environment node
//
// "Today" is fixed to 2026-09-15 (a Tuesday) in UTC for every test, so every range below is
// hand-verified against a known calendar rather than computed by the same code under test.

import { describe, expect, it } from "vitest"

import { precedingPeriod, resolveRelativePeriod } from "../shared/date-range-resolver"

const NOW = new Date("2026-09-15T12:00:00.000Z")
const TZ = "UTC"

describe("resolveRelativePeriod", () => {
  it("today / yesterday", () => {
    expect(resolveRelativePeriod("today", TZ, NOW)).toMatchObject({
      from: "2026-09-15",
      to: "2026-09-15",
    })
    expect(resolveRelativePeriod("yesterday", TZ, NOW)).toMatchObject({
      from: "2026-09-14",
      to: "2026-09-14",
    })
  })

  it("this_week starts on Sunday, not Monday", () => {
    expect(resolveRelativePeriod("this_week", TZ, NOW)).toMatchObject({
      from: "2026-09-13",
      to: "2026-09-15",
    })
  })

  it("last_week is the full equivalent previous week", () => {
    expect(resolveRelativePeriod("last_week", TZ, NOW)).toMatchObject({
      from: "2026-09-06",
      to: "2026-09-12",
    })
  })

  it("this_month and month_to_date are identical: first of month -> today", () => {
    const thisMonth = resolveRelativePeriod("this_month", TZ, NOW)
    const monthToDate = resolveRelativePeriod("month_to_date", TZ, NOW)
    expect(thisMonth).toMatchObject({ from: "2026-09-01", to: "2026-09-15" })
    expect(monthToDate).toMatchObject({ from: "2026-09-01", to: "2026-09-15" })
  })

  it("last_month is the full previous calendar month, not a rolling 30 days", () => {
    expect(resolveRelativePeriod("last_month", TZ, NOW)).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
    })
  })

  it("last_7_days / last_30_days are rolling windows ending today, inclusive", () => {
    expect(resolveRelativePeriod("last_7_days", TZ, NOW)).toMatchObject({
      from: "2026-09-09",
      to: "2026-09-15",
    })
    expect(resolveRelativePeriod("last_30_days", TZ, NOW)).toMatchObject({
      from: "2026-08-17",
      to: "2026-09-15",
    })
  })

  it("this_year / year_to_date: Jan 1 -> today", () => {
    expect(resolveRelativePeriod("this_year", TZ, NOW)).toMatchObject({
      from: "2026-01-01",
      to: "2026-09-15",
    })
    expect(resolveRelativePeriod("year_to_date", TZ, NOW)).toMatchObject({
      from: "2026-01-01",
      to: "2026-09-15",
    })
  })

  it("last_year is the full previous calendar year", () => {
    expect(resolveRelativePeriod("last_year", TZ, NOW)).toMatchObject({
      from: "2025-01-01",
      to: "2025-12-31",
    })
  })

  it("handles a year boundary correctly (today = Jan 2)", () => {
    const jan2 = new Date("2027-01-02T12:00:00.000Z")
    expect(resolveRelativePeriod("yesterday", TZ, jan2)).toMatchObject({
      from: "2027-01-01",
      to: "2027-01-01",
    })
    expect(resolveRelativePeriod("last_month", TZ, jan2)).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-31",
    })
  })

  it("resolves 'today' using the organization's own timezone, not UTC", () => {
    // 2026-09-15T23:30 UTC is already 2026-09-16 in a UTC+something-large zone, and still
    // 2026-09-15 in a negative-offset zone -- proves the timezone parameter actually changes
    // the result, not just a label on it.
    const lateUtc = new Date("2026-09-15T23:30:00.000Z")
    const tokyo = resolveRelativePeriod("today", "Asia/Tokyo", lateUtc) // UTC+9
    const losAngeles = resolveRelativePeriod("today", "America/Los_Angeles", lateUtc) // UTC-7/8
    expect(tokyo.from).toBe("2026-09-16")
    expect(losAngeles.from).toBe("2026-09-15")
  })
})

describe("precedingPeriod", () => {
  it("returns an equal-length window immediately before the given range", () => {
    const current = { from: "2026-09-01", to: "2026-09-30" } // 30 days
    const previous = precedingPeriod(current)
    expect(previous.to).toBe("2026-08-31")
    expect(previous.from).toBe("2026-08-02")
  })

  it("mirrors a single-day range as a single-day previous range", () => {
    const current = { from: "2026-09-15", to: "2026-09-15" }
    const previous = precedingPeriod(current)
    expect(previous).toEqual({ from: "2026-09-14", to: "2026-09-14" })
  })
})
