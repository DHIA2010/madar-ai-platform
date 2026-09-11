// @vitest-environment node
//
// Covers point-of-sale hardware settings (migration 048): GET and PUT /v1/pos/device-settings.

import type { AddressInfo } from "node:net"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createIdentityPlatform } from "../bootstrap/create-identity-platform"
import { runIdentityMigrations, runSqlFile } from "../infrastructure/postgres/migration-runner"
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
  await runSqlFile(
    database,
    `${process.cwd()}/src/project-platform/migrations/001_project_core.sql`
  )

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

async function signIn(email: string, orgName: string) {
  const registerResponse = await fetch(`${baseUrl}/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "VeryStrongPassword123!",
      fullName: "Devices Test",
      organizationName: orgName,
    }),
  })
  const registration = (await registerResponse.json()) as { verificationToken: string }

  await fetch(`${baseUrl}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: registration.verificationToken }),
  })

  const loginResponse = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "VeryStrongPassword123!" }),
  })
  const login = (await loginResponse.json()) as { session: { accessToken: string } }
  const actor = await container.commands.resolveActorFromAccessToken(login.session.accessToken)

  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, $2, 'hash', 'Devices Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )

  // Registration creates the workspace inside the in-memory container rather than in this
  // pg-mem instance, so products.workspace_id would have nothing to reference.
  if (actor.workspaceId) {
    await database.query(
      `insert into workspaces (id, organization_id, name, status)
       values ($1, $2, $3, 'active') on conflict (id) do nothing`,
      [actor.workspaceId, actor.organizationId, `${orgName} Workspace`]
    )
  }

  return { token: login.session.accessToken, actor }
}

function authHeaders(token: string) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

async function getSettings(token: string) {
  const response = await fetch(`${baseUrl}/v1/pos/device-settings`, { headers: authHeaders(token) })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function putSettings(token: string, settings: unknown) {
  const response = await fetch(`${baseUrl}/v1/pos/device-settings`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(settings),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const SETTINGS = {
  scale: {
    enabled: true,
    name: "الميزان الرئيسي",
    connection: "serial",
    port: "COM3",
    baudRate: 9600,
    defaultWeightUnit: "kg",
    trailingDigits: "weight",
    indicatorStart: 99,
    decimals: 3,
    blockUnstableWeight: true,
    autoZero: true,
  },
  receiptPrinter: {
    enabled: true,
    name: "Epson TM-T20",
    model: "Epson TM-T20",
    connection: "network",
    port: null,
    baudRate: 9600,
    networkAddress: "192.168.1.50",
    paperWidth: "80mm",
    printDirection: "vertical",
    printDensity: "normal",
    charset: "utf8",
    copies: 2,
    autoCut: true,
    printLogo: true,
    extraCopy: false,
    footerText: "شكراً لزيارتكم",
  },
  barcodeScanner: {
    enabled: true,
    name: "ماسح الكاشير",
    connection: "usb",
    inputMode: "keyboard_wedge",
    charset: "utf8",
    lineEnding: "cr",
    prefix: null,
    suffix: "\\n",
    inputDelayMs: 0,
    allowRepeatScans: false,
    beepOnScan: true,
    uppercaseOutput: false,
    hideControlChars: true,
  },
  cashDrawer: {
    enabled: true,
    name: "درج الكاشير",
    connection: "printer",
    port: null,
    openTimeMs: 500,
    openMethod: "printer_signal",
    openTrigger: "on_sale",
    openOnCancel: false,
  },
  customerDisplay: {
    enabled: true,
    name: "شاشة الكاشير",
    connection: "usb",
    port: null,
    brightness: "medium",
    screenTimeout: "30s",
    language: "ar",
    textDirection: "normal",
    welcomeMessage: "أهلاً بك",
    showStoreLogo: true,
    showProductName: true,
    showPrice: true,
    showQuantity: true,
    showTotal: true,
    showPromoMessages: false,
  },
  cardReader: {
    enabled: true,
    name: "قارئ الكاشير",
    provider: "mada",
    terminalId: "T-1001",
    connectionMethod: "api",
    port: null,
    apiUrl: null,
    authType: "bearer",
    apiKey: null,
    requestTimeoutSeconds: 30,
    sendDigitalReceipt: true,
    autoCompleteAfterSuccess: true,
    sandboxMode: false,
  },
}

describe("point-of-sale device settings", () => {
  it("returns usable defaults before anything is configured", async () => {
    const { token } = await signIn("devices-default@example.com", "Devices Default")

    const response = await getSettings(token)
    expect(response.status).toBe(200)
    // Marked unconfigured so the screen can say so rather than implying a real setup exists.
    expect(response.body.configured).toBe(false)
    expect(response.body.settings).toMatchObject({
      receiptPrinter: { connection: "usb", paperWidth: "80mm", copies: 1 },
      cashDrawer: { connection: "printer", openTrigger: "on_sale" },
      cardReader: { enabled: false },
    })
  })

  it("saves and reads back the configuration", async () => {
    const { token } = await signIn("devices-save@example.com", "Devices Save")

    const saved = await putSettings(token, SETTINGS)
    expect(saved.status).toBe(200)
    expect(saved.body.configured).toBe(true)
    expect(saved.body.settings).toMatchObject(SETTINGS)

    const reread = await getSettings(token)
    expect(reread.body.settings).toMatchObject(SETTINGS)
    expect(reread.body.updatedAt).toEqual(expect.any(String))
  })

  it("updates in place rather than adding a second row", async () => {
    const { token } = await signIn("devices-update@example.com", "Devices Update")

    await putSettings(token, SETTINGS)
    const changed = await putSettings(token, {
      ...SETTINGS,
      receiptPrinter: { ...SETTINGS.receiptPrinter, copies: 1, paperWidth: "58mm" },
    })

    expect(changed.status).toBe(200)
    expect(changed.body.settings).toMatchObject({
      receiptPrinter: { copies: 1, paperWidth: "58mm" },
    })

    const rows = await database.query("select count(*)::int as n from pos_device_settings")
    expect(rows.rows[0].n).toBe(1)
  })

  it("fills in a peripheral a stored row predates", async () => {
    const { token } = await signIn("devices-partial@example.com", "Devices Partial")
    await putSettings(token, SETTINGS)

    // Simulates a row written before the card reader existed as a concept.
    await database.query(`update pos_device_settings set settings = settings - 'cardReader'`)

    const response = await getSettings(token)
    expect(response.status).toBe(200)
    // Comes back as the default rather than undefined, which would crash the screen reading it.
    expect(response.body.settings).toMatchObject({ cardReader: { enabled: false } })
  })

  it("keeps one organization's hardware out of another's", async () => {
    const first = await signIn("devices-org-a@example.com", "Devices Org A")
    const second = await signIn("devices-org-b@example.com", "Devices Org B")

    await putSettings(first.token, SETTINGS)

    const other = await getSettings(second.token)
    expect(other.body.configured).toBe(false)
    expect(other.body.settings).toMatchObject({ receiptPrinter: { name: null } })
  })

  it("rejects values outside the allowed set", async () => {
    const { token } = await signIn("devices-invalid@example.com", "Devices Invalid")

    expect(
      (
        await putSettings(token, {
          ...SETTINGS,
          receiptPrinter: { ...SETTINGS.receiptPrinter, connection: "carrier-pigeon" },
        })
      ).status
    ).toBe(400)

    // Five copies is the documented ceiling; six is a misconfiguration that costs paper on
    // every single sale.
    expect(
      (
        await putSettings(token, {
          ...SETTINGS,
          receiptPrinter: { ...SETTINGS.receiptPrinter, copies: 6 },
        })
      ).status
    ).toBe(400)
  })

  it("refuses an unauthenticated read", async () => {
    const response = await fetch(`${baseUrl}/v1/pos/device-settings`)
    expect(response.status).toBe(401)
  })
})
