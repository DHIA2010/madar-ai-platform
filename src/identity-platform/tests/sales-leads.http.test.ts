// @vitest-environment node
//
// madar.my's "talk to sales" form: the lead is stored and emailed to the sales inbox.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import type { InMemoryEmailGateway } from "../infrastructure/email/in-memory-email-gateway"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let container: ReturnType<typeof createIdentityPlatform>

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"

  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())

  await runIdentityMigrations(database, process.cwd())

  container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database

  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  await database.end()
})

async function submitLead(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/public/sales-leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://madar.my" },
    body: JSON.stringify(body),
  })
  return response
}

async function storedLeads() {
  const rows = await database.query<{ company_name: string; phone: string; email: string | null }>(
    "select company_name, phone, email from sales_leads order by created_at"
  )
  return rows.rows
}

describe("sales leads", () => {
  it("stores the request and emails it to the sales inbox, without signing in", async () => {
    const response = await submitLead({
      companyName: "مؤسسة الريم",
      phone: "٠٥٥ ١٢٣ ٤٥٦٧",
      email: "",
    })
    expect(response.status).toBe(201)
    // madar.my may call the API from the browser.
    expect(response.headers.get("access-control-allow-origin")).toBe("https://madar.my")

    expect(await storedLeads()).toEqual([
      { company_name: "مؤسسة الريم", phone: "0551234567", email: null },
    ])
    const sent = (container.emailGateway as InMemoryEmailGateway).sent.filter(
      (mail) => mail.kind === "sales_lead"
    )
    expect(sent).toMatchObject([
      { to: "support@madar.my", companyName: "مؤسسة الريم", phone: "0551234567" },
    ])
  })

  it("rejects a missing company name or a bad phone, and quietly drops bots", async () => {
    expect((await submitLead({ companyName: "", phone: "0551234567" })).status).toBe(400)
    expect((await submitLead({ companyName: "شركة", phone: "12" })).status).toBe(400)
    expect(
      (await submitLead({ companyName: "شركة", phone: "0551234567", email: "not-an-email" })).status
    ).toBe(400)

    const bot = await submitLead({ companyName: "Spam", phone: "0551234567", website: "x.com" })
    expect(bot.status).toBe(201)
    expect(await storedLeads()).toEqual([])
  })
})
