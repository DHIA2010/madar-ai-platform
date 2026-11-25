// The home page's targets: one per KPI per tab, shared by the organization, with the KPI each
// tab shows remembered.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { HomeTargets } from "../home-targets/service"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"

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

describe("home targets", () => {
  it("saves a target per KPI, remembers the KPI shown, and keeps organizations apart", async () => {
    const targets = new HomeTargets(database)
    const org = randomUUID()
    const other = randomUUID()
    const user = randomUUID()

    expect(await targets.get(org, "campaigns")).toEqual({ selected: null, targets: {} })

    await targets.set(org, user, "campaigns", { kpi: "conversions", target: 120 })
    await targets.set(org, user, "campaigns", { kpi: "ctr", target: 1.5 })
    // Switching back to a KPI keeps its target; only the choice changes.
    expect(await targets.set(org, user, "campaigns", { kpi: "conversions" })).toEqual({
      selected: "conversions",
      targets: { conversions: 120, ctr: 1.5 },
    })
    // A new number replaces the old; null removes it.
    await targets.set(org, user, "campaigns", { kpi: "conversions", target: 150 })
    expect(
      (await targets.set(org, user, "campaigns", { kpi: "ctr", target: null })).targets
    ).toEqual({ conversions: 150 })

    // Each tab and each organization has its own.
    expect(await targets.get(org, "pos")).toEqual({ selected: null, targets: {} })
    expect(await targets.get(other, "campaigns")).toEqual({ selected: null, targets: {} })

    // Only the tab's own KPIs.
    await expect(targets.set(org, user, "pos", { kpi: "clicks", target: 10 })).rejects.toBeTruthy()
  })
})
