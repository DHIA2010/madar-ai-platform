import { describe, expect, it } from "vitest"

import { computeNextRunAt } from "../integrations/scheduling/next-run"

const RIYADH = "Asia/Riyadh"

describe("computeNextRunAt: fixed-frequency presets", () => {
  it("picks the next same-day slot when the frequency hasn't elapsed yet", () => {
    // 2026-01-04 is a Sunday in Riyadh -- 10:15 local, hourly from a 09:00 start -> next slot
    // is 11:00 local the same day.
    const from = new Date("2026-01-04T07:15:00.000Z") // 10:15 Asia/Riyadh (+3)
    const next = computeNextRunAt(
      {
        frequencyMinutes: 60,
        customCron: null,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        startTimeLocal: "09:00",
        timezone: RIYADH,
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-04T08:00:00.000Z")
  })

  it("rolls over to the next active day's start time once today's slots are exhausted", () => {
    // Sunday 23:30 local, hourly from 09:00 -- every slot for Sunday has passed; Monday isn't
    // active, so the next run is Tuesday 09:00 local.
    const from = new Date("2026-01-04T20:30:00.000Z") // 23:30 Asia/Riyadh Sunday
    const next = computeNextRunAt(
      {
        frequencyMinutes: 60,
        customCron: null,
        activeDays: [0, 2, 4], // Sun, Tue, Thu
        startTimeLocal: "09:00",
        timezone: RIYADH,
      },
      from
    )
    // 2026-01-06 is the following Tuesday.
    expect(next.toISOString()).toBe("2026-01-06T06:00:00.000Z")
  })

  it("daily frequency fires once at startTime on the next active day", () => {
    const from = new Date("2026-01-04T05:00:00.000Z") // 08:00 Asia/Riyadh Sunday, before 09:00
    const next = computeNextRunAt(
      {
        frequencyMinutes: 1440,
        customCron: null,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        startTimeLocal: "09:00",
        timezone: RIYADH,
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-04T06:00:00.000Z")
  })

  it("daily frequency skips to tomorrow once today's start time has already passed", () => {
    const from = new Date("2026-01-04T10:00:00.000Z") // 13:00 Asia/Riyadh Sunday, after 09:00
    const next = computeNextRunAt(
      {
        frequencyMinutes: 1440,
        customCron: null,
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        startTimeLocal: "09:00",
        timezone: RIYADH,
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-05T06:00:00.000Z")
  })

  it("defaults to every day of the week when activeDays is empty", () => {
    const from = new Date("2026-01-04T07:15:00.000Z")
    const next = computeNextRunAt(
      {
        frequencyMinutes: 30,
        customCron: null,
        activeDays: [],
        startTimeLocal: "00:00",
        timezone: RIYADH,
      },
      from
    )
    expect(next.getTime()).toBeGreaterThan(from.getTime())
  })
})

describe("computeNextRunAt: custom cron", () => {
  it("resolves a simple every-30-minutes cron to the next matching minute", () => {
    const from = new Date("2026-01-04T07:05:00.000Z")
    const next = computeNextRunAt(
      {
        frequencyMinutes: null,
        customCron: "*/30 * * * *",
        activeDays: [],
        startTimeLocal: "00:00",
        timezone: "UTC",
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-04T07:30:00.000Z")
  })

  it("resolves a specific hour-and-minute cron to the same day if still ahead", () => {
    const from = new Date("2026-01-04T05:00:00.000Z")
    const next = computeNextRunAt(
      {
        frequencyMinutes: null,
        customCron: "30 9 * * *",
        activeDays: [],
        startTimeLocal: "00:00",
        timezone: "UTC",
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-04T09:30:00.000Z")
  })

  it("respects a day-of-week restriction (1 = Monday)", () => {
    // 2026-01-04 is a Sunday -- "0 12 * * 1" should resolve to Monday 2026-01-05 at 12:00 UTC.
    const from = new Date("2026-01-04T00:00:00.000Z")
    const next = computeNextRunAt(
      {
        frequencyMinutes: null,
        customCron: "0 12 * * 1",
        activeDays: [],
        startTimeLocal: "00:00",
        timezone: "UTC",
      },
      from
    )
    expect(next.toISOString()).toBe("2026-01-05T12:00:00.000Z")
  })

  it("fails safe instead of throwing on a malformed cron expression", () => {
    const from = new Date("2026-01-04T00:00:00.000Z")
    const next = computeNextRunAt(
      {
        frequencyMinutes: null,
        customCron: "not a cron",
        activeDays: [],
        startTimeLocal: "00:00",
        timezone: "UTC",
      },
      from
    )
    expect(next.getTime()).toBeGreaterThan(from.getTime())
  })
})
