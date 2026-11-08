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
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, $2, $3, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb) on conflict (id) do nothing`,
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

interface CatalogueProduct {
  id: string
  name: string
  sku: string | null
  productType: string
  stockQuantity: number | null
  variantOptions: Array<{ name: string; values: string[] }>
  variants: Array<{
    id: string
    sku: string | null
    price: number | null
    stock: number | null
    optionValues: string[]
  }>
  components: Array<Record<string, unknown>>
}

async function catalogueProducts(token: string): Promise<CatalogueProduct[]> {
  const response = await fetch(`${baseUrl}/v1/products/catalog-export`, {
    headers: authHeaders(token),
  })
  return ((await response.json()) as { products: CatalogueProduct[] }).products
}

async function catalogueProduct(token: string, sku: string): Promise<CatalogueProduct> {
  const product = (await catalogueProducts(token)).find((candidate) => candidate.sku === sku)
  if (!product) throw new Error(`No product with sku ${sku}`)
  return product
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

  it("imports a variable product from its variants rows", async () => {
    const { token } = await signIn("bulk-variable@example.com", "Bulk Variable")

    const result = await bulkImport(token, [
      {
        name: "تيشيرت قطن",
        sku: "TSHIRT",
        productType: "variable",
        status: "active",
        variants: [
          {
            options: [
              { name: "اللون", value: "أحمر" },
              { name: "المقاس", value: "M" },
            ],
            sku: "TSHIRT-RED-M",
            price: "79",
            stock: "10",
          },
          {
            options: [
              { name: "اللون", value: "أزرق" },
              { name: "المقاس", value: "L" },
            ],
            sku: "TSHIRT-BLUE-L",
            price: "85",
            stock: "4",
          },
        ],
      },
    ])
    expect(result.body).toMatchObject({ created: 1, updated: 0, skipped: [] })

    const product = await catalogueProduct(token, "TSHIRT")
    expect(product.productType).toBe("variable")
    expect(product.variantOptions.map(({ name, values }) => ({ name, values }))).toEqual([
      { name: "اللون", values: ["أحمر", "أزرق"] },
      { name: "المقاس", values: ["M", "L"] },
    ])
    expect(
      product.variants.map((variant) => [variant.optionValues, variant.price, variant.stock])
    ).toEqual([
      [["أحمر", "M"], 79, 10],
      [["أزرق", "L"], 85, 4],
    ])
  })

  it("expands the quick-variants cell into every combination at the row's price and stock", async () => {
    const { token } = await signIn("bulk-quick@example.com", "Bulk Quick")

    const result = await bulkImport(token, [
      {
        name: "كوب حراري",
        sku: "MUG",
        productType: "variable",
        sellPrice: "45",
        stockQuantity: "3",
        options: "اللون: أسود|أبيض ; المقاس: صغير،كبير",
      },
      // Malformed: no ":" between the option name and its values.
      {
        name: "منتج خاطئ",
        sku: "BAD",
        productType: "variable",
        sellPrice: "1",
        options: "أحمر|أزرق",
      },
    ])
    expect(result.body).toMatchObject({ created: 1 })
    const skipped = result.body.skipped as Array<{ row: number; reason: string }>
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ row: 2 })
    expect(skipped[0].reason).toContain("الخيارات")

    const product = await catalogueProduct(token, "MUG")
    expect(product.variants.map((variant) => [variant.sku, variant.optionValues])).toEqual([
      ["MUG-1", ["أسود", "صغير"]],
      ["MUG-2", ["أسود", "كبير"]],
      ["MUG-3", ["أبيض", "صغير"]],
      ["MUG-4", ["أبيض", "كبير"]],
    ])
    expect(product.variants.every((variant) => variant.price === 45 && variant.stock === 3)).toBe(
      true
    )
  })

  it("imports a bundle after its components, linking a code from the same file", async () => {
    const { token } = await signIn("bulk-bundle@example.com", "Bulk Bundle")

    // The bundle comes first in the file; it is still saved after the coffee it points at.
    const result = await bulkImport(token, [
      {
        name: "وجبة إفطار",
        productType: "bundle",
        sellPrice: "25",
        ref: "COMBO1",
        sourceRow: 2,
        components: [
          { component: "coffee", quantity: "1", unit: "حبة" },
          { component: "كرواسون", quantity: "2", unit: null },
        ],
      },
      {
        name: "قهوة",
        sku: "COFFEE-01",
        ref: "COFFEE",
        sellPrice: "18",
        stockQuantity: "50",
        baseUnit: "حبة (PCS)",
        sourceRow: 3,
      },
    ])
    expect(result.body).toMatchObject({ created: 2, skipped: [] })

    const catalogue = await catalogueProducts(token)
    const coffee = catalogue.find((product) => product.sku === "COFFEE-01")!
    const bundle = catalogue.find((product) => product.productType === "bundle")!
    expect(bundle.components[0]).toMatchObject({
      componentRef: coffee.id,
      requiredQuantity: 1,
      requiredUnit: "حبة",
    })
    // A component matching nothing becomes a new raw material, as on the Add Product page.
    const croissant = catalogue.find((product) => product.name === "كرواسون")!
    expect(croissant.productType).toBe("raw")
    expect(bundle.components[1]).toMatchObject({ componentRef: croissant.id, requiredQuantity: 2 })
  })

  it("reports a row number from the merchant's sheet when one is given", async () => {
    const { token } = await signIn("bulk-source-row@example.com", "Bulk Source Row")

    const result = await bulkImport(token, [{ name: "", sourceRow: 7 }])
    expect(result.body.skipped).toEqual([{ row: 7, reason: "الاسم مطلوب" }])
  })

  it("skips a row missing a required field for its type, reporting which field", async () => {
    const { token } = await signIn("bulk-missing-field@example.com", "Bulk Missing Field")

    // "simple" requires a sellPrice -- the SKU and stock it also needs are filled in for it.
    const result = await bulkImport(token, [{ name: "منتج بلا سعر" }])

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ created: 0 })
    const skipped = result.body.skipped as Array<{ row: number; reason: string }>
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toContain("سعر البيع")
  })

  it("fills in a SKU and zero stock for a merchant's own list, and matches it by name next time", async () => {
    const { token } = await signIn("bulk-plain-list@example.com", "Bulk Plain List")

    const rows = [
      { name: "قهوة", sellPrice: "18" },
      {
        name: "تيشيرت",
        productType: "variable",
        sellPrice: "79",
        variants: [
          { options: [{ name: "المقاس", value: "M" }], sku: null, price: null, stock: "3" },
          { options: [{ name: "المقاس", value: "L" }], sku: null, price: "85", stock: null },
        ],
      },
    ]
    const first = await bulkImport(token, rows)
    expect(first.body).toMatchObject({ created: 2, skipped: [] })

    const catalogue = await catalogueProducts(token)
    const coffee = catalogue.find((product) => product.name === "قهوة")!
    expect(coffee.sku).toMatch(/^SKU-\d{6}-[A-Z2-9]{4}$/)
    expect(coffee.stockQuantity).toBe(0)
    const shirt = catalogue.find((product) => product.name === "تيشيرت")!
    expect(shirt.variants.map((variant) => [variant.sku, variant.price, variant.stock])).toEqual([
      [`${shirt.sku}-1`, 79, 3],
      [`${shirt.sku}-2`, 85, null],
    ])

    // The same file again: matched by name, nothing duplicated, the generated codes kept.
    const second = await bulkImport(token, rows)
    expect(second.body).toMatchObject({ created: 0, unchanged: 2, skipped: [] })
    expect((await catalogueProducts(token)).find((p) => p.name === "قهوة")!.sku).toBe(coffee.sku)
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

  it("updates the product whose SKU already exists, keeping what a blank cell leaves out", async () => {
    const { token } = await signIn("bulk-update-sku@example.com", "Bulk Update Sku")

    await bulkImport(token, [
      {
        name: "الأول",
        sku: "SKU-DUP",
        category: "مشروبات",
        status: "active",
        sellPrice: "10",
        stockQuantity: "1",
      },
    ])
    const second = await bulkImport(token, [
      { name: "الأول بعد التعديل", sku: "SKU-DUP", sellPrice: "20" },
      { name: "الثالث", sku: "SKU-UNIQUE", sellPrice: "30", stockQuantity: "3" },
    ])
    expect(second.body).toMatchObject({ created: 1, updated: 1, unchanged: 0, skipped: [] })

    const list = await listProducts(token)
    expect(list.items).toHaveLength(2)
    expect(list.items.find((item) => item.sku === "SKU-DUP")).toMatchObject({
      name: "الأول بعد التعديل",
      sellingPrice: 20,
      // Blank in the second file -- kept, not reset to draft / zero / uncategorized.
      status: "Active",
      availableStock: 1,
      category: "مشروبات",
    })
  })

  it("leaves a matched product untouched when the row carries nothing new", async () => {
    const { token } = await signIn("bulk-unchanged@example.com", "Bulk Unchanged")
    const rows = [
      { name: "دقيق", productType: "raw", stockQuantity: "50" },
      {
        name: "تيشيرت",
        sku: "TS",
        productType: "variable",
        variants: [
          { options: [{ name: "المقاس", value: "M" }], sku: "TS-M", price: "50", stock: "2" },
        ],
      },
    ]

    expect((await bulkImport(token, rows)).body).toMatchObject({ created: 2 })
    const before = await catalogueProduct(token, "TS")

    // A raw material has no SKU -- it matches by its exact name instead of being duplicated.
    expect((await bulkImport(token, rows)).body).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
      skipped: [],
    })
    expect((await catalogueProduct(token, "TS")).variants[0].id).toBe(before.variants[0].id)
    expect(await catalogueProducts(token)).toHaveLength(2)
  })

  it("keeps a variable product's and a bundle's type when a flat sheet re-imports them", async () => {
    const { token } = await signIn("bulk-flat-structured@example.com", "Bulk Flat Structured")

    await bulkImport(token, [
      {
        name: "قميص",
        sku: "SHIRT",
        productType: "variable",
        variants: [
          { options: [{ name: "المقاس", value: "M" }], sku: "SHIRT-M", price: "50", stock: "2" },
          { options: [{ name: "المقاس", value: "L" }], sku: "SHIRT-L", price: "55", stock: "1" },
        ],
      },
      {
        name: "وجبة",
        productType: "bundle",
        sellPrice: "25",
        components: [{ component: "كرواسون", quantity: "1", unit: null, conversionFactor: null }],
      },
    ])

    // What the CSV report reads back as: no type, no sizes, no recipe -- every row "simple".
    const result = await bulkImport(token, [
      { name: "قميص", sku: "SHIRT", productType: "simple", sellPrice: "50", stockQuantity: "3" },
      { name: "وجبة", productType: "simple", sellPrice: "25", stockQuantity: "0" },
    ])
    expect(result.body).toMatchObject({ created: 0, unchanged: 2, skipped: [] })

    const catalogue = await catalogueProducts(token)
    const shirt = catalogue.find((product) => product.name === "قميص")!
    expect(shirt.productType).toBe("variable")
    expect(shirt.variants.map((variant) => variant.sku)).toEqual(["SHIRT-M", "SHIRT-L"])
    expect(catalogue.filter((product) => product.name === "وجبة")).toHaveLength(1)
    expect(catalogue.find((product) => product.name === "وجبة")!.productType).toBe("bundle")
  })

  it("exports every native product in full for the Excel export", async () => {
    const { token } = await signIn("bulk-export@example.com", "Bulk Export")
    await bulkImport(token, [
      {
        name: "كوب",
        sku: "MUG",
        productType: "variable",
        sellPrice: "45",
        options: "اللون: أسود|أبيض",
      },
    ])

    const response = await fetch(`${baseUrl}/v1/products/catalog-export`, {
      headers: authHeaders(token),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { products: CatalogueProduct[] }
    expect(body.products).toHaveLength(1)
    expect(body.products[0].variants).toHaveLength(2)
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
