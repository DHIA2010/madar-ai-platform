/* eslint-disable @typescript-eslint/no-explicit-any -- test actors and rows are built loosely */
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AdChange } from "../campaigns/ad-changes"
import { AdChangeTracker, metaSnapshot, tiktokSnapshot } from "../campaigns/ad-changes"
import type { DailyPoint } from "../campaigns/ad-history"
import { buildCheckup } from "../campaigns/checkup"
import type { CampaignPerformanceRow } from "../campaigns/performance-service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

// The campaign check-up as a media buyer's coach: every running ad gets a stage (too early to
// judge, promising, winning, steady, tired, not working), and Madar's own change log points at
// habits that cost money -- editing while an ad set is learning, big budget jumps, bids changed
// again and again, switching on and off.

const ORG = "20000000-0000-0000-0000-000000000001"
const USER = "10000000-0000-0000-0000-000000000001"
const WORKSPACE = "30000000-0000-0000-0000-000000000001"

describe("ad change log", () => {
  let database: PostgresDatabase
  let connectionId: string
  let clock: Date

  const squad = (overrides: Record<string, unknown> = {}) => ({
    id: "squad-1",
    name: "Riyadh women",
    campaign_id: "camp-1",
    status: "ACTIVE",
    daily_budget_micro: 50_000_000,
    bid_micro: 2_000_000,
    bid_strategy: "LOWEST_COST_WITH_MAX_BID",
    optimization_goal: "PIXEL_SIGNUP",
    targeting: { geos: [{ country_code: "sa" }] },
    delivery_status: ["LEARNING_PHASE", "VALID"],
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
    ...overrides,
  })

  async function saveSquad(payload: Record<string, unknown>) {
    await database.query(`DELETE FROM snapchat_records WHERE entity_id = 'squad-1'`)
    await database.query(
      `insert into snapchat_records (id, connection_id, customer_id, entity_type, entity_id,
         record_date, payload, created_at, updated_at)
       values ($1, $2, 'acct-1', 'ad_squads', 'squad-1', '2026-11-01'::date, $3::jsonb, now(), now())`,
      [randomUUID(), connectionId, JSON.stringify(payload)]
    )
  }

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'changes@madar.test', 'hash', 'Changes', now())`,
      [USER]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status, settings)
       values ($1, 'Org', $2, 'active', '{}'::jsonb)`,
      [ORG, USER]
    )
    await database.query(
      `insert into workspaces (id, organization_id, name, status) values ($1, $2, 'Main', 'active')`,
      [WORKSPACE, ORG]
    )
    connectionId = randomUUID()
    await database.query(
      `insert into snapchat_oauth_connections (id, organization_id, workspace_id, project_id,
         status, created_by_user_id, updated_by_user_id, created_at, updated_at)
       values ($1, $2, $3, $4, 'connected', $5, $5, now(), now())`,
      [connectionId, ORG, WORKSPACE, randomUUID(), USER]
    )
    await database.query(
      `insert into snapchat_records (id, connection_id, customer_id, entity_type, entity_id,
         record_date, payload, created_at, updated_at)
       values ($1, $2, 'acct-1', 'campaigns', 'camp-1', '2026-11-01'::date, $3::jsonb, now(), now())`,
      [
        randomUUID(),
        connectionId,
        JSON.stringify({ id: "camp-1", name: "Leads", status: "ACTIVE" }),
      ]
    )
    clock = new Date("2026-11-20T09:00:00.000Z")
  })

  afterEach(async () => {
    await database.end()
  })

  const actor = { organizationId: ORG, workspaceId: WORKSPACE } as any

  it("remembers the first pass and records what changed on the next, learning included", async () => {
    const tracker = new AdChangeTracker(database, () => clock)
    await saveSquad(squad())
    expect(await tracker.capture(ORG)).toEqual({ checked: 2, changes: 0 })

    // The media buyer doubles the budget and raises the bid while Snapchat says it is learning.
    await saveSquad(
      squad({
        daily_budget_micro: 100_000_000,
        bid_micro: 3_000_000,
        updated_at: "2026-11-20T10:00:00.000Z",
      })
    )
    clock = new Date("2026-11-20T11:00:00.000Z")
    expect((await tracker.capture(ORG)).changes).toBe(2)

    const changes = await tracker.list(
      actor,
      new Date("2026-11-19T00:00:00Z"),
      new Date("2026-11-21T00:00:00Z")
    )
    expect(
      changes
        .map((change) => [
          change.field,
          change.oldValue,
          change.newValue,
          change.duringLearning,
          change.learningSource,
        ])
        .sort()
    ).toEqual([
      ["bid", "2", "3", true, "platform"],
      ["dailyBudget", "50", "100", true, "platform"],
    ])
    // Dated by Snapchat's own "last edited" time, not by when Madar noticed.
    expect(changes[0].changedAt).toBe("2026-11-20T10:00:00.000Z")
    expect(changes[0].rowId).toBe(`snapchat_ads:${connectionId}:acct-1:squad-1`)
    expect(changes[0].campaignRowId).toBe(`snapchat_ads:${connectionId}:acct-1:camp-1`)

    // Nothing new on the next pass.
    clock = new Date("2026-11-20T12:00:00.000Z")
    expect((await tracker.capture(ORG)).changes).toBe(0)
  })

  it("writes a change once even when two passes run at the same time", async () => {
    const tracker = new AdChangeTracker(database, () => clock)
    await saveSquad(squad())
    await tracker.capture(ORG)
    await saveSquad(squad({ status: "PAUSED", updated_at: "2026-11-20T10:00:00.000Z" }))
    clock = new Date("2026-11-20T11:00:00.000Z")
    await Promise.all([tracker.capture(ORG), tracker.capture(null)])
    const rows = await database.query(`SELECT field FROM ad_entity_changes`)
    expect(rows.rows.map((row: any) => row.field)).toEqual(["status"])
  })

  it("does not count a setting the platform stopped sending as a change", async () => {
    const tracker = new AdChangeTracker(database, () => clock)
    await saveSquad(squad())
    await tracker.capture(ORG)
    await saveSquad(squad({ bid_micro: undefined }))
    expect((await tracker.capture(ORG)).changes).toBe(0)
  })

  it("estimates learning where the platform says nothing: new within 7 days", async () => {
    const tracker = new AdChangeTracker(database, () => clock)
    // Paused: Snapchat lists no delivery state, so learning is unknown.
    await saveSquad(
      squad({ status: "PAUSED", delivery_status: [], created_at: "2026-11-18T08:00:00Z" })
    )
    await tracker.capture(ORG)
    await saveSquad(
      squad({
        status: "PAUSED",
        delivery_status: [],
        created_at: "2026-11-18T08:00:00Z",
        targeting: { geos: [{ country_code: "ae" }] },
      })
    )
    await tracker.capture(ORG)
    const [change] = await tracker.list(
      actor,
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-11-30T00:00:00Z")
    )
    expect([change.field, change.duringLearning, change.learningSource]).toEqual([
      "targeting",
      true,
      "estimate",
    ])
  })
})

describe("what each platform's saved rows say", () => {
  it("reads a TikTok ad group's budget, bid, goal and audience", () => {
    const snapshot = tiktokSnapshot({
      connection_id: "c",
      customer_id: "a",
      entity_type: "adgroups",
      entity_id: "g1",
      organization_id: ORG,
      workspace_id: null,
      payload: {
        adgroup_name: "KSA",
        campaign_id: "k1",
        operation_status: "ENABLE",
        budget_mode: "BUDGET_MODE_DAY",
        budget: 75,
        bid_type: "BID_TYPE_NO_BID",
        bid_price: 0,
        conversion_bid_price: 4.5,
        optimization_goal: "CONVERT",
        location_ids: ["102358"],
        modify_time: "2026-11-21 03:22:07",
      },
    })
    expect(snapshot?.campaignRowId).toBe("tiktok_ads:c:a:k1")
    expect(snapshot?.settings).toMatchObject({
      status: "on",
      dailyBudget: 75,
      lifetimeBudget: null,
      bid: 4.5,
      bidStrategy: "BID_TYPE_NO_BID",
      optimization: "CONVERT",
    })
    expect(snapshot?.updatedAt).toBe("2026-11-21T03:22:07.000Z")
  })

  it("reads Meta's budgets in the currency's smallest unit and its learning state", () => {
    const snapshot = metaSnapshot({
      connection_id: "c",
      customer_id: "act_1",
      entity_type: "adsets",
      entity_id: "s1",
      organization_id: ORG,
      workspace_id: null,
      payload: {
        name: "Set",
        campaign_id: "k1",
        status: "ACTIVE",
        daily_budget: "5000",
        bid_amount: 250,
        learning_stage_info: { status: "LEARNING" },
      },
    })
    expect(snapshot?.settings.dailyBudget).toBe(50)
    expect(snapshot?.settings.bid).toBe(2.5)
    expect(snapshot?.learning).toBe(true)
  })
})

// -- The check-up's reading ----------------------------------------------------------------

const row = (values: Partial<CampaignPerformanceRow>): CampaignPerformanceRow => {
  const spend = values.spend ?? 0
  const impressions = values.impressions ?? 0
  const clicks = values.clicks ?? 0
  const conversions = values.conversions ?? 0
  return {
    parentId: null,
    platform: "Snapchat",
    level: "campaign",
    status: "ACTIVE",
    objective: null,
    activityDate: null,
    currency: "SAR",
    revenue: 0,
    roas: 0,
    conversionRate: 0,
    cpc: 0,
    pageViews: null,
    dailyBudget: null,
    ...values,
    spend,
    impressions,
    clicks,
    conversions,
    ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
  } as CampaignPerformanceRow
}
const ad = (id: string, values: Partial<CampaignPerformanceRow>) =>
  row({ id, name: id, level: "ad", parentId: "set", ...values })

const NOW = new Date("2026-11-26T09:00:00.000Z")

const run = (input: {
  ads: CampaignPerformanceRow[]
  createdAt?: Record<string, string>
  history?: Record<string, DailyPoint[]>
  changes?: AdChange[]
}) => {
  const totals = input.ads.reduce(
    (sum, entry) => ({
      spend: sum.spend + entry.spend,
      impressions: sum.impressions + entry.impressions,
      clicks: sum.clicks + entry.clicks,
      conversions: sum.conversions + entry.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  )
  return buildCheckup({
    campaigns: [row({ id: "camp", name: "Leads", ...totals })],
    spendTodayByCampaignId: new Map(),
    spendYesterdayByCampaignId: new Map(),
    adsByCampaignId: new Map([["camp", input.ads]]),
    adSetBudgetByCampaignId: new Map(),
    range: { startDate: "2026-11-20", endDate: "2026-11-26", days: 7 },
    adCreatedAt: new Map(Object.entries(input.createdAt ?? {})),
    history: new Map(Object.entries(input.history ?? {})),
    changes: input.changes ?? [],
    now: NOW,
  })
}

describe("campaign check-up: every running ad gets a stage", () => {
  // The campaign's proven ad: 10 results at 20 SAR each.
  const proven = ad("proven", { spend: 200, impressions: 20_000, clicks: 300, conversions: 10 })

  it("tells you to wait on a new ad instead of calling it weak", () => {
    // A day old, 15 SAR spent, tapped less than the proven ad so far.
    const fresh = ad("fresh", { spend: 15, impressions: 1_500, clicks: 6 })
    const result = run({
      ads: [proven, fresh],
      createdAt: { fresh: "2026-11-25T09:00:00.000Z", proven: "2026-11-01T09:00:00.000Z" },
    })
    const entry = result.ads.find((item) => item.id === "fresh")
    expect(entry?.stage).toBe("too_early")
    // Two results' worth of spend in this campaign (2 x 21.50 = 43, 15 spent) and 2 more days.
    expect(entry?.spendToJudge).toBe(28)
    expect(entry?.daysToJudge).toBe(2)
    const kinds = result.findings.filter((finding) => finding.adName === "fresh").map((f) => f.kind)
    expect(kinds).toEqual(["ad_wait"])
    expect(kinds).not.toContain("low_ctr")
  })

  it("calls an ad that brings results clearly cheaper a winner", () => {
    const cheap = ad("cheap", { spend: 120, impressions: 9_000, clicks: 200, conversions: 12 })
    const result = run({
      ads: [proven, cheap],
      createdAt: { cheap: "2026-11-10T09:00:00.000Z", proven: "2026-11-01T09:00:00.000Z" },
    })
    expect(result.ads.find((item) => item.id === "cheap")?.stage).toBe("winning")
    expect(result.findings.find((finding) => finding.adName === "cheap")?.kind).toBe("ad_winning")
  })

  it("spots a tired ad: its last 3 days are tapped far less than before", () => {
    const day = (date: string, clicks: number): DailyPoint => ({
      day: date,
      spend: 20,
      impressions: 2_000,
      clicks,
      conversions: 1,
    })
    const history = [
      day("2026-11-16", 40),
      day("2026-11-17", 42),
      day("2026-11-18", 41),
      day("2026-11-19", 40),
      day("2026-11-20", 39),
      day("2026-11-21", 40),
      day("2026-11-22", 18),
      day("2026-11-23", 16),
      day("2026-11-24", 15),
      day("2026-11-25", 14),
    ]
    const worn = ad("worn", { spend: 200, impressions: 20_000, clicks: 305, conversions: 10 })
    const result = run({
      ads: [proven, worn],
      createdAt: { worn: "2026-11-15T09:00:00.000Z", proven: "2026-11-01T09:00:00.000Z" },
      history: { worn: history },
    })
    const entry = result.ads.find((item) => item.id === "worn")
    expect(entry?.stage).toBe("tired")
    expect(entry?.trend).toEqual({ earlyCtr: 1.86, recentCtr: 0.75, earlyCpa: 20, recentCpa: 20 })
    expect(result.findings.find((finding) => finding.adName === "worn")?.kind).toBe("ad_tired")
  })

  it("points at the page when an ad is tapped like the others but nobody finishes", () => {
    const leaky = ad("leaky", { spend: 90, impressions: 6_000, clicks: 95 })
    const result = run({
      ads: [proven, leaky],
      createdAt: { leaky: "2026-11-15T09:00:00.000Z", proven: "2026-11-01T09:00:00.000Z" },
    })
    const entry = result.ads.find((item) => item.id === "leaky")
    expect(entry?.stage).toBe("not_working")
    expect(entry?.diagnosis).toBe("page")
    // Compared against the campaign's other ad and the whole account.
    expect(entry?.campaignAverage).toMatchObject({ ctr: 1.5, cpa: 20 })
    expect(entry?.accountAverage?.cpa).toBe(29)
  })
})

describe("campaign check-up: how the account is being managed", () => {
  const SET = "snapchat_ads:c:a:set-1"
  const change = (
    field: AdChange["field"],
    changedAt: string,
    oldValue: string,
    newValue: string,
    duringLearning: boolean | null = false
  ): AdChange => ({
    id: randomUUID(),
    rowId: SET,
    campaignRowId: "camp",
    level: "adset",
    name: "Riyadh women",
    field,
    oldValue,
    newValue,
    duringLearning,
    learningSource: duringLearning === null ? null : "platform",
    changedAt,
  })
  const base = ad("one", { spend: 100, impressions: 10_000, clicks: 100, conversions: 5 })

  it("flags edits made while the ad set was learning, and a big budget jump", () => {
    const result = run({
      ads: [base],
      changes: [change("dailyBudget", "2026-11-22T10:00:00.000Z", "50", "100", true)],
    })
    const kinds = result.findings.map((finding) => finding.kind)
    expect(kinds).toContain("edit_in_learning")
    expect(kinds).toContain("big_budget_jump")
    const jump = result.findings.find((finding) => finding.kind === "big_budget_jump")
    expect(jump?.values).toMatchObject({ oldValue: 50, newValue: 100, percent: 100 })
    expect(jump?.adName).toBe("Riyadh women")
  })

  it("flags too many edits in a week, bids changed within 3 days, and on/off switching", () => {
    const result = run({
      ads: [base],
      changes: [
        change("bid", "2026-11-20T10:00:00.000Z", "2", "2.5"),
        change("bid", "2026-11-21T10:00:00.000Z", "2.5", "3"),
        change("targeting", "2026-11-23T10:00:00.000Z", "x", "y"),
        change("status", "2026-11-24T10:00:00.000Z", "on", "off", null),
        change("status", "2026-11-24T18:00:00.000Z", "off", "on", null),
        change("status", "2026-11-25T10:00:00.000Z", "on", "off", null),
      ],
    })
    const byKind = new Map(result.findings.map((finding) => [finding.kind, finding]))
    expect(byKind.get("too_many_edits")?.values).toMatchObject({ edits: 3 })
    expect(byKind.get("bid_churn")?.values).toMatchObject({ edits: 2 })
    expect(byKind.get("on_off_flapping")?.values).toMatchObject({ switches: 3 })
    expect(byKind.has("edit_in_learning")).toBe(false)
  })

  it("shows what a change did: the 3 days before against the days after", () => {
    const point = (day: string, spend: number, clicks: number, conversions: number) => ({
      day,
      spend,
      impressions: 1_000,
      clicks,
      conversions,
    })
    const result = run({
      ads: [base],
      changes: [change("dailyBudget", "2026-11-22T10:00:00.000Z", "50", "60")],
      history: {
        [SET]: [
          point("2026-11-19", 50, 10, 2),
          point("2026-11-20", 50, 10, 3),
          point("2026-11-21", 50, 10, 0),
          point("2026-11-22", 60, 10, 2),
          point("2026-11-23", 60, 20, 1),
          point("2026-11-24", 60, 20, 1),
          point("2026-11-25", 60, 20, 1),
        ],
      },
    })
    const [entry] = result.changes
    expect(entry.changePercent).toBe(20)
    expect(entry.effect?.before).toMatchObject({ days: 3, spend: 150, conversions: 5, cpa: 30 })
    expect(entry.effect?.after).toMatchObject({ days: 3, spend: 180, conversions: 3, cpa: 60 })
    expect(entry.effect?.after.ctr).toBe(2)
    // A 20% move is within the advice: no jump note.
    expect(result.findings.map((finding) => finding.kind)).not.toContain("big_budget_jump")
  })
})
