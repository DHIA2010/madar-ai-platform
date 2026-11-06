// @vitest-environment node

// Covers Madar's WhatsApp Business Platform setup (whatsapp/platform-config.ts): secrets stored
// encrypted and never returned, the connection check against Meta (stubbed), and the public
// webhook -- Meta's URL verification handshake and signed event delivery.
import { createHmac } from "node:crypto"
import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { createIdentityApiServer } from "../interfaces/rest/server"
import { credentialsFromSecret } from "../whatsapp/credentials"
import { verifyWhatsAppSignature, WhatsAppPlatformService } from "../whatsapp/platform-config"

let database: PostgresDatabase
let server: ReturnType<typeof createIdentityApiServer>
let baseUrl = ""
let service: WhatsAppPlatformService
const actorId = "10000000-0000-0000-0000-000000000001"

beforeEach(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.IDENTITY_PLATFORM_TOKEN_HASH_SECRET = "12345678901234567890123456789012"
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'staff@madar.my', 'hash', 'Staff', now())`,
    [actorId]
  )
  const container = createIdentityPlatform({ mode: "memory" })
  ;(container.infrastructure as { database?: PostgresDatabase }).database = database
  server = createIdentityApiServer(container)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  service = new WhatsAppPlatformService(database)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await database.end()
})

describe("WhatsApp platform config", () => {
  it("stores the secrets encrypted and only ever shows that they're set", async () => {
    const initial = await service.get()
    expect(initial.webhookVerifyToken).toMatch(/^[0-9a-f]{48}$/)
    expect(initial.hasSystemUserToken).toBe(false)

    const saved = await service.update(
      { appId: "123456", appSecret: "app-secret-value", systemUserToken: "EAAGtokenABCD" },
      actorId
    )
    expect(saved).toMatchObject({
      appId: "123456",
      hasAppSecret: true,
      hasSystemUserToken: true,
      systemUserTokenHint: "ABCD",
    })
    expect(JSON.stringify(saved)).not.toContain("app-secret-value")
    const row = (
      await database.query<{ app_secret_encrypted: string; system_user_token_encrypted: string }>(
        "select app_secret_encrypted, system_user_token_encrypted from whatsapp_platform_config"
      )
    ).rows[0]
    expect(row.app_secret_encrypted).not.toContain("app-secret-value")
    expect(row.system_user_token_encrypted).not.toContain("EAAGtoken")
    expect(await service.appSecret()).toBe("app-secret-value")

    // Leaving a secret out keeps it; an empty one clears it. The verify token never changes.
    await service.update({ embeddedSignupConfigId: "777" }, actorId)
    expect((await service.get()).hasAppSecret).toBe(true)
    const cleared = await service.update({ systemUserToken: "" }, actorId)
    expect(cleared.hasSystemUserToken).toBe(false)
    expect(cleared.webhookVerifyToken).toBe(initial.webhookVerifyToken)
  })

  it("checks the token, its permissions, the account and the numbers against Meta", async () => {
    await service.update({ systemUserToken: "EAAGtoken", madarWabaId: "555" }, actorId)
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      const body = url.pathname.endsWith("/me")
        ? { id: "42", name: "Madar System User" }
        : url.pathname.endsWith("/me/permissions")
          ? {
              data: [
                { permission: "whatsapp_business_management", status: "granted" },
                { permission: "whatsapp_business_messaging", status: "declined" },
              ],
            }
          : url.pathname.endsWith("/555/phone_numbers")
            ? {
                data: [
                  { id: "9", display_phone_number: "+966 50 000 0000", verified_name: "Madar" },
                ],
              }
            : { id: "555", name: "Madar WABA", account_review_status: "APPROVED" }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const { checks, phoneNumbers } = await service.testConnection()
    expect(checks).toEqual([
      { key: "token", ok: true, detail: "Madar System User (42)" },
      { key: "permissions", ok: false, detail: "Missing: whatsapp_business_messaging" },
      { key: "account", ok: true, detail: "Madar WABA -- APPROVED" },
      { key: "phoneNumbers", ok: true, detail: "+966 50 000 0000 (Madar, ID 9)" },
      {
        key: "configuredNumber",
        ok: false,
        detail: "No phone number ID saved -- use one of the IDs above.",
      },
    ])
    expect(phoneNumbers).toHaveLength(1)
  })
})

describe("WhatsApp credentials from AWS Secrets Manager", () => {
  it("uses the secret's values over Madar Admin's, and checks the token never expires", async () => {
    const aws = new WhatsAppPlatformService(database, {
      load: async () =>
        credentialsFromSecret({
          App_ID: "1592",
          App_Secret: "aws-secret",
          WHATSAPP_ACCESS_TOKEN: "EAAG-aws-token-1234",
          WHATSAPP_BUSINESS_ACCOUNT_ID: "555",
          WHATSAPP_PHONE_NUMBER_ID: "9",
          WHATSAPP_API_VERSION: "v26.0",
        }),
    })
    await aws.update({ appId: "999", systemUserToken: "EAAG-own-token" }, actorId)
    const view = await aws.get()
    expect(view).toMatchObject({
      appId: "1592",
      madarWabaId: "555",
      madarPhoneNumberId: "9",
      apiVersion: "v26.0",
      systemUserTokenHint: "1234",
    })
    expect(view.fromAws).toEqual([
      "appId",
      "appSecret",
      "systemUserToken",
      "madarWabaId",
      "madarPhoneNumberId",
      "apiVersion",
    ])
    expect(await aws.appSecret()).toBe("aws-secret")

    const urls: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      urls.push(url.pathname)
      const body = url.pathname.endsWith("/debug_token")
        ? { data: { type: "SYSTEM_USER", is_valid: true, expires_at: 0 } }
        : url.pathname.endsWith("/me")
          ? { id: "42", name: "Employee" }
          : url.pathname.endsWith("/me/permissions")
            ? {
                data: [
                  { permission: "whatsapp_business_management", status: "granted" },
                  { permission: "whatsapp_business_messaging", status: "granted" },
                ],
              }
            : url.pathname.endsWith("/555/phone_numbers")
              ? {
                  data: [
                    { id: "9", display_phone_number: "+966 53 770 1753", verified_name: "Madar" },
                  ],
                }
              : { id: "555", name: "Madar" }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const { checks } = await aws.testConnection()
    expect(checks.every((check) => check.ok)).toBe(true)
    expect(checks.find((check) => check.key === "tokenExpiry")?.detail).toBe(
      "SYSTEM_USER -- never expires"
    )
    expect(checks.find((check) => check.key === "configuredNumber")?.detail).toBe(
      "Madar sends from +966 53 770 1753 (Madar)"
    )
    expect(urls.every((path) => path.startsWith("/v26.0/"))).toBe(true)
  })
})

describe("WhatsApp connection check errors", () => {
  it("never shows the token Meta repeats in its error", async () => {
    await service.update({ systemUserToken: "EAAG-secret-token-WXYZ" }, actorId)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Malformed access token EAAG-secret-token-WXYZ" } }),
        { status: 400 }
      )
    )
    const { checks } = await service.testConnection()
    expect(checks).toEqual([{ key: "token", ok: false, detail: "Malformed access token …WXYZ" }])
  })
})

describe("WhatsApp webhook", () => {
  it("answers Meta's verification with the challenge only for the right verify token", async () => {
    const { webhookVerifyToken } = await service.get()
    const ok = await fetch(
      `${baseUrl}/v1/public/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${webhookVerifyToken}&hub.challenge=12345`
    )
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe("12345")

    const wrong = await fetch(
      `${baseUrl}/v1/public/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`
    )
    expect(wrong.status).toBe(403)
  })

  it("keeps events signed with the app secret and refuses the rest", async () => {
    await service.update({ appSecret: "the-app-secret" }, actorId)
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "555" }] })
    const signature = `sha256=${createHmac("sha256", "the-app-secret").update(body).digest("hex")}`

    const forged = await fetch(`${baseUrl}/v1/public/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" },
      body,
    })
    expect(forged.status).toBe(401)

    const signed = await fetch(`${baseUrl}/v1/public/webhooks/whatsapp`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body,
    })
    expect(signed.status).toBe(200)
    const events = await database.query<{ payload: { entry: Array<{ id: string }> } }>(
      "select payload from whatsapp_webhook_events"
    )
    expect(events.rows.map((row) => row.payload.entry[0].id)).toEqual(["555"])
    expect(verifyWhatsAppSignature(Buffer.from(body), signature, "other-secret")).toBe(false)
  })
})
