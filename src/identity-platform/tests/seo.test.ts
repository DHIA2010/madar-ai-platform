/* eslint-disable @typescript-eslint/no-explicit-any -- fake Search Console client and actors are built loosely */
import { createVerify, generateKeyPairSync } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { PostgresDatabase } from "../infrastructure/postgres/database"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { handleAdminSeoRoute } from "../interfaces/rest/seo-routes"
import {
  parseServiceAccountKey,
  SearchConsoleClient,
  type SearchConsoleQuery,
} from "../seo/search-console"
import { normalizeKeyword, pickSite, SeoService } from "../seo/service"

// Madar Admin → السيو: a service account key is checked with Google before it's saved (sealed),
// the report compares the range with the one before it, and followed searches get their own
// day-by-day position.

const KEY = JSON.stringify({
  type: "service_account",
  client_email: "seo-robot@madar.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
})

function fakeClient(sites: string[] = ["sc-domain:madar.my"]) {
  const queries: SearchConsoleQuery[] = []
  const row = (keys: string[], position: number, clicks = 10) => ({
    keys,
    clicks,
    impressions: clicks * 20,
    ctr: 0.05,
    position,
  })
  return {
    queries,
    async sites() {
      return sites.map((siteUrl) => ({ siteUrl, permissionLevel: "siteRestrictedUser" }))
    },
    async query(_site: string, query: SearchConsoleQuery) {
      queries.push(query)
      const previous = query.startDate < "2026-10-29"
      const dims = query.dimensions ?? []
      if (dims.length === 0) return [row([], previous ? 12 : 8.5, previous ? 40 : 60)]
      if (dims[0] === "date") return [row(["2026-11-02"], 9), row(["2026-11-01"], 8)]
      if (dims[0] === "page") return [row(["https://www.madar.my/"], 5)]
      if (dims.join() === "query,date") {
        return [row(["برنامج كاشير", "2026-11-02"], 7), row(["برنامج كاشير", "2026-11-01"], 9)]
      }
      return [row(["برنامج كاشير"], previous ? 11 : 7), row(["نظام نقاط بيع"], previous ? 15 : 18)]
    },
  }
}

describe("seo", () => {
  let database: PostgresDatabase
  let client: ReturnType<typeof fakeClient>
  let service: SeoService

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    database = new PostgresDatabase(new adapter.Pool())
    await runIdentityMigrations(database, process.cwd())
    client = fakeClient()
    service = new SeoService(
      database,
      () => client as any,
      (text) => `sealed:${text}`,
      (sealed) => sealed.replace(/^sealed:/, ""),
      () => new Date("2026-11-28T09:00:00.000Z")
    )
  })

  it("checks the key, finds madar.my and keeps the key sealed", async () => {
    await expect(service.connect("not json", "owner")).rejects.toThrow()
    expect(await service.connect(KEY, "owner")).toMatchObject({
      connected: true,
      clientEmail: "seo-robot@madar.iam.gserviceaccount.com",
      siteUrl: "sc-domain:madar.my",
    })
    const stored = await database.query<any>(
      `SELECT sealed_service_account FROM seo_settings WHERE id = 1`
    )
    expect(stored.rows[0].sealed_service_account.startsWith("sealed:")).toBe(true)

    // A robot that wasn't added to Search Console yet is told what to do.
    client = fakeClient([])
    await expect(service.connect(KEY, "owner")).rejects.toThrow()
  })

  it("reports the range against the one before, two days behind today", async () => {
    expect(await service.report()).toBeNull()
    await service.connect(KEY, "owner")
    const report = (await service.report({ country: "sau" }))!
    // 28 days ending 2026-11-26 (Search Console settles two days late), and the 28 before.
    expect(report.range).toEqual({ startDate: "2026-10-30", endDate: "2026-11-26" })
    expect(report.previousRange).toEqual({ startDate: "2026-10-02", endDate: "2026-10-29" })
    expect(report.totals.position).toBe(8.5)
    expect(report.previousTotals.position).toBe(12)
    expect(report.daily.map((point) => point.date)).toEqual(["2026-11-01", "2026-11-02"])
    expect(report.queries[0]).toMatchObject({
      key: "برنامج كاشير",
      position: 7,
      previousPosition: 11,
    })
    expect(client.queries.every((query) => query.filters?.[0]?.expression === "sau")).toBe(true)
  })

  it("follows chosen searches day by day", async () => {
    await service.connect(KEY, "owner")
    expect(await service.addKeywords(["  برنامج   كاشير ", "برنامج كاشير", "Cashier"], "o")).toBe(2)
    const report = (await service.report())!
    const cashier = report.tracked.find((entry) => entry.keyword === "برنامج كاشير")!
    expect(cashier.current?.position).toBe(7)
    expect(cashier.previousPosition).toBe(11)
    expect(cashier.daily.map((point) => point.position)).toEqual([9, 7])
    // Not ranking yet: no position rather than a made-up one.
    expect(report.tracked.find((entry) => entry.keyword === "cashier")!.current).toBeNull()
    const regex = client.queries.find((query) =>
      query.filters?.some((filter) => filter.operator === "includingRegex")
    )!
    expect(regex.filters!.at(-1)!.expression).toBe("^(برنامج كاشير|cashier)$")
  })

  it("picks the madar.my property and tidies keywords", () => {
    expect(
      pickSite([{ siteUrl: "https://other.com/" }, { siteUrl: "https://www.madar.my/" }])
    ).toBe("https://www.madar.my/")
    expect(normalizeKeyword("  Madar   POS ")).toBe("madar pos")
  })

  it("signs its own Google token with the key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const key = parseServiceAccountKey(
      JSON.stringify({ client_email: "robot@x.iam.gserviceaccount.com", private_key: pem })
    )
    const calls: Array<{ url: string; body: string }> = []
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, body: String(init?.body ?? "") })
      if (url.includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "t1", expires_in: 3600 }))
      }
      return new Response(JSON.stringify({ rows: [{ keys: ["a"], clicks: 1, position: 3 }] }))
    }) as any
    const gsc = new SearchConsoleClient(key, fetchImpl)
    const rows = await gsc.query("sc-domain:madar.my", {
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      dimensions: ["query"],
    })
    expect(rows[0]).toMatchObject({ keys: ["a"], clicks: 1, position: 3, impressions: 0 })
    const assertion = new URLSearchParams(calls[0].body).get("assertion")!
    const [header, claims, signature] = assertion.split(".")
    const verifier = createVerify("RSA-SHA256")
    verifier.update(`${header}.${claims}`)
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true)
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({
      iss: "robot@x.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
    })
    expect(calls[1].url).toContain(encodeURIComponent("sc-domain:madar.my"))
  })

  it("the admin addresses need CRM access", async () => {
    let sent: any = null
    const call = (permissions: string[], method: string, path: string, body: unknown = {}) =>
      handleAdminSeoRoute({
        method,
        url: new URL(`http://x/v1/platform-admin/seo${path}`),
        actor: { userId: "u1", isPlatformAdmin: true, platformPermissions: permissions } as any,
        service,
        readJsonBody: async () => body,
        send: (status, payload) => {
          sent = { status, payload }
          return true
        },
      })
    await expect(call(["billing:view"], "GET", "/status")).rejects.toThrow()
    await call(["crm:manage"], "GET", "/report")
    expect(sent.payload).toEqual({ status: "not_connected" })
    await call(["crm:manage"], "POST", "/keywords", { keywords: ["برنامج محاسبة"] })
    expect(sent.payload.keywords[0].keyword).toBe("برنامج محاسبة")
  })
})
