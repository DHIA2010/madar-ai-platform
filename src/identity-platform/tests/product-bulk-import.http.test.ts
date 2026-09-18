// @vitest-environment node
//
// Covers the native product catalogue's CSV bulk import: POST /v1/products/bulk-import
// (ProductCatalogService.bulkImport, migration 047's catalogue).

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
      fullName: "Bulk Import Test",
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
     values ($1, $2, 'hash', 'Bulk Import Test', now()) on conflict (id) do nothing`,
    [actor.userId, email]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, $2, $3, 'active') on conflict (id) do nothing`,
    [actor.organizationId, orgName, actor.userId]
  )
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

async function bulkImport(token: string, products: Array<Record<string, unknown>>) {
  const response = await fetch(`${baseUrl}/v1/products/bulk-import`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ products }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

async function listProducts(token: string) {
  const response = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
  return (await response.json()) as { items: Array<Record<string, unknown>> }
}

describe("native product catalogue bulk import", () => {
  it("imports a simple product with the minimum required columns", async () => {
    const { token } = await signIn("bulk-simple@example.com", "Bulk Simple")

    const result = await bulkImport(token, [
      { name: "قميص قطن", sku: "SKU-500", sellPrice: "120", stockQuantity: "10" },
    ])

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ created: 1, skipped: [] })

    const list = await listProducts(token)
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({
      name: "قميص قطن",
      sku: "SKU-500",
      productType: "simple",
      status: "Draft",
      sellingPrice: 120,
      availableStock: 10,
    })
  })

  it("imports every flat product type in one file, each with its own required fields", async () => {
    const { token } = await signIn("bulk-all-types@example.com", "Bulk All Types")

    const result = await bulkImport(token, [
      { name: "دقيق", productType: "raw", stockQuantity: "50" },
      { name: "كيك", sku: "SKU-CAKE", productType: "simple", sellPrice: "40", stockQuantity: "5" },
      {
        name: "تفاح",
        sku: "SKU-APPLE",
        productType: "weighted",
        sellPrice: "8",
        stockQuantity: "100",
      },
      { name: "استشارة", sku: "SKU-CONSULT", productType: "service", sellPrice: "200" },
      // A digital product also needs a description (create()'s own rule -- what's actually
      // delivered), unlike the other four flat types.
      {
        name: "كتاب إلكتروني",
        sku: "SKU-EBOOK",
        productType: "digital",
        sellPrice: "15",
        description: "نسخة PDF قابلة للتحميل فور الشراء",
      },
    ])

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ created: 5, skipped: [] })
  })

  it("skips a bundle or variable row with a clear reason instead of failing the file", async () => {
    const { token } = await signIn("bulk-bundle@example.com", "Bulk Bundle")

    const result = await bulkImport(token, [
      { name: "منتج بسيط", sku: "SKU-OK", sellPrice: "10", stockQuantity: "1" },
      { name: "وجبة مجمعة", productType: "bundle" },
      { name: "قميص بمقاسات", productType: "variable" },
    ])

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ created: 1 })
    const skipped = result.body.skipped as Array<{ row: number; reason: string }>
    expect(skipped).toHaveLength(2)
    expect(skipped[0].row).toBe(2)
    expect(skipped[0].reason).toContain("يدوياً")
    expect(skipped[1].row).toBe(3)
  })

  it("skips a row missing a required field for its type, reporting which field", async () => {
    const { token } = await signIn("bulk-missing-field@example.com", "Bulk Missing Field")

    // "simple" requires both a sku and a sellPrice -- neither is given.
    const result = await bulkImport(token, [{ name: "منتج بلا سعر" }])

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ created: 0 })
    const skipped = result.body.skipped as Array<{ row: number; reason: string }>
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toContain("SKU")
  })

  it("skips a row with no name, without needing to know anything else about it", async () => {
    const { token } = await signIn("bulk-no-name@example.com", "Bulk No Name")

    const result = await bulkImport(token, [{ name: "" }])
    expect(result.body).toMatchObject({
      created: 0,
      skipped: [{ row: 1, reason: "الاسم مطلوب" }],
    })
  })

  it("skips a row naming an unknown product type", async () => {
    const { token } = await signIn("bulk-unknown-type@example.com", "Bulk Unknown Type")

    const result = await bulkImport(token, [{ name: "شيء ما", productType: "unobtainium" }])
    const skipped = result.body.skipped as Array<{ row: number; reason: string }>
    expect(result.body).toMatchObject({ created: 0 })
    expect(skipped[0].reason).toContain("unobtainium")
  })

  it("skips a row whose SKU already exists in the catalogue, keeping the rest of the file", async () => {
    const { token } = await signIn("bulk-dup-sku@example.com", "Bulk Dup Sku")

    await bulkImport(token, [
      { name: "الأول", sku: "SKU-DUP", sellPrice: "10", stockQuantity: "1" },
    ])
    const second = await bulkImport(token, [
      { name: "الثاني", sku: "SKU-DUP", sellPrice: "20", stockQuantity: "2" },
      { name: "الثالث", sku: "SKU-UNIQUE", sellPrice: "30", stockQuantity: "3" },
    ])

    expect(second.body).toMatchObject({ created: 1 })
    const skipped = second.body.skipped as Array<{ row: number; reason: string }>
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toContain("مستخدم")

    // "الأول" from the first call, "الثالث" from the second -- "الثاني" was skipped.
    const list = await listProducts(token)
    expect(list.items).toHaveLength(2)
  })

  it("defaults an unspecified status to draft and an unspecified type to simple", async () => {
    const { token } = await signIn("bulk-defaults@example.com", "Bulk Defaults")

    await bulkImport(token, [
      { name: "منتج افتراضي", sku: "SKU-DEFAULT", sellPrice: "50", stockQuantity: "4" },
    ])

    const list = await listProducts(token)
    expect(list.items[0]).toMatchObject({ status: "Draft", productType: "simple" })
  })

  it("refuses an unauthenticated import", async () => {
    const response = await fetch(`${baseUrl}/v1/products/bulk-import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ products: [{ name: "x" }] }),
    })
    expect(response.status).toBe(401)
  })

  it("rejects an empty file", async () => {
    const { token } = await signIn("bulk-empty@example.com", "Bulk Empty")

    const response = await fetch(`${baseUrl}/v1/products/bulk-import`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ products: [] }),
    })
    expect(response.status).toBe(400)
  })
})
