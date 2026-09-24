// @vitest-environment node
//
// Covers the native product catalogue (migration 047): POST /v1/products, GET /v1/products/:id,
// and the merge of authored products into the existing synced-product list.

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
let uploadedObjects: Array<{ key: string; contentType: string }>

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

  // Mirrors settings.http.test.ts's stub for the org-logo route -- a fake gateway that records
  // what it was asked to store and hands back a deterministic, real-shaped URL.
  uploadedObjects = []
  ;(
    container.infrastructure as {
      objectStorage?: { uploadPublicObject: (input: unknown) => Promise<string> }
    }
  ).objectStorage = {
    async uploadPublicObject(input: unknown) {
      const typed = input as { key: string; contentType: string }
      uploadedObjects.push({ key: typed.key, contentType: typed.contentType })
      return `https://cdn.test.local/product-images-bucket/${typed.key}`
    },
  }

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
      fullName: "Catalog Test",
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
     values ($1, $2, 'hash', 'Catalog Test', now()) on conflict (id) do nothing`,
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

async function createProduct(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/products`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

const SIMPLE_PRODUCT = {
  productType: "simple",
  name: "قميص قطن",
  sku: "SKU-100",
  category: "ملابس",
  description: "قميص قطن ناعم",
  status: "active",
  sellPrice: 120,
  costPrice: 70,
  stockQuantity: 25,
  minStock: 5,
  baseUnit: "حبة (PCS)",
}

describe("native product catalogue", () => {
  it("creates a simple product and returns it through the merged list", async () => {
    const { token } = await signIn("catalog-simple@example.com", "Catalog Simple")

    const created = await createProduct(token, SIMPLE_PRODUCT)
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      productType: "simple",
      name: "قميص قطن",
      sku: "SKU-100",
      status: "active",
      sellPrice: 120,
      costPrice: 70,
      stockQuantity: 25,
      currency: "SAR",
    })
    expect(typeof created.body.id).toBe("string")

    const listResponse = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
    const list = (await listResponse.json()) as { items: Array<Record<string, unknown>> }

    expect(listResponse.status).toBe(200)
    expect(list.items).toHaveLength(1)
    // Projected into the same shape the synced products already use.
    expect(list.items[0]).toMatchObject({
      id: created.body.id,
      name: "قميص قطن",
      sku: "SKU-100",
      status: "Active",
      availableStock: 25,
      sellingPrice: 120,
      platform: "Madar",
    })
  })

  it("fetches one product by id and 404s for an unknown or non-uuid id", async () => {
    const { token } = await signIn("catalog-byid@example.com", "Catalog ById")
    const created = await createProduct(token, SIMPLE_PRODUCT)

    const found = await fetch(`${baseUrl}/v1/products/${String(created.body.id)}`, {
      headers: authHeaders(token),
    })
    expect(found.status).toBe(200)
    expect((await found.json()) as Record<string, unknown>).toMatchObject({ sku: "SKU-100" })

    const missing = await fetch(`${baseUrl}/v1/products/6f6d1f9c-0000-4000-8000-000000000000`, {
      headers: authHeaders(token),
    })
    expect(missing.status).toBe(404)

    // The synced aggregation's ids look like this and legitimately reach the same route --
    // they must 404, not blow up on a uuid cast.
    const external = await fetch(`${baseUrl}/v1/products/salla:12345`, {
      headers: authHeaders(token),
    })
    expect(external.status).toBe(404)
  })

  it("rejects a duplicate stock code within the organization", async () => {
    const { token } = await signIn("catalog-dupe@example.com", "Catalog Dupe")

    expect((await createProduct(token, SIMPLE_PRODUCT)).status).toBe(201)

    const duplicate = await createProduct(token, { ...SIMPLE_PRODUCT, name: "آخر" })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body).toMatchObject({ code: "PRODUCT_SKU_TAKEN" })
  })

  it("keeps stock codes scoped to one organization", async () => {
    const first = await signIn("catalog-org-a@example.com", "Catalog Org A")
    const second = await signIn("catalog-org-b@example.com", "Catalog Org B")

    expect((await createProduct(first.token, SIMPLE_PRODUCT)).status).toBe(201)
    // The same code in a different organization is a different product, not a conflict.
    expect((await createProduct(second.token, SIMPLE_PRODUCT)).status).toBe(201)

    const listResponse = await fetch(`${baseUrl}/v1/products`, {
      headers: authHeaders(second.token),
    })
    const list = (await listResponse.json()) as { items: unknown[] }
    expect(list.items).toHaveLength(1)
  })

  it("stores a raw material without a stock code even when one is sent", async () => {
    const { token } = await signIn("catalog-raw@example.com", "Catalog Raw")

    const created = await createProduct(token, {
      productType: "raw",
      name: "أرز بسمتي",
      sku: "SHOULD-BE-DROPPED",
      category: "مواد خام",
      stockQuantity: 25,
      baseUnit: "كجم (KG)",
      costPrice: 12,
      attributes: { supplier: "مؤسسة التموين", batchNumber: "LOT-001" },
    })

    expect(created.status).toBe(201)
    // A raw material is identified by its own stock record, so it carries no stock code.
    expect(created.body.sku).toBeNull()
    expect(created.body.attributes).toMatchObject({
      supplier: "مؤسسة التموين",
      batchNumber: "LOT-001",
    })
  })

  it("requires a price and stock only for the types that have them", async () => {
    const { token } = await signIn("catalog-required@example.com", "Catalog Required")

    const noPrice = await createProduct(token, {
      productType: "simple",
      name: "بدون سعر",
      sku: "SKU-NOPRICE",
      category: "ملابس",
      stockQuantity: 5,
    })
    expect(noPrice.status).toBe(422)
    expect((noPrice.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
      "sellPrice"
    )

    const noStock = await createProduct(token, {
      productType: "simple",
      name: "بدون مخزون",
      sku: "SKU-NOSTOCK",
      category: "ملابس",
      sellPrice: 10,
    })
    expect(noStock.status).toBe(422)
    expect((noStock.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
      "stockQuantity"
    )

    // A service has no stock at all, so the same omission is fine here.
    const service = await createProduct(token, {
      productType: "service",
      name: "استشارة",
      sku: "SVC-1",
      category: "خدمات",
      sellPrice: 300,
      attributes: { pricingType: "سعر ثابت", serviceDuration: 1, serviceDurationUnit: "ساعة" },
    })
    expect(service.status).toBe(201)
    expect(service.body.stockQuantity).toBeNull()
  })

  it("requires a description for a digital product only", async () => {
    const { token } = await signIn("catalog-digital@example.com", "Catalog Digital")

    const missing = await createProduct(token, {
      productType: "digital",
      name: "كتاب رقمي",
      sku: "DIG-1",
      category: "رقمي",
      sellPrice: 45,
    })
    expect(missing.status).toBe(422)
    expect((missing.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
      "description"
    )

    const withDescription = await createProduct(token, {
      productType: "digital",
      name: "كتاب رقمي",
      sku: "DIG-1",
      category: "رقمي",
      description: "ملف PDF قابل للتحميل",
      sellPrice: 45,
    })
    expect(withDescription.status).toBe(201)
  })

  describe("bundles", () => {
    const BUNDLE_BASE = {
      productType: "bundle",
      name: "وجبة دجاج",
      category: "وجبات",
      status: "active",
      sellPrice: 45,
    }

    it("stores components and drops the stock code", async () => {
      const { token } = await signIn("catalog-bundle@example.com", "Catalog Bundle")

      const created = await createProduct(token, {
        ...BUNDLE_BASE,
        sku: "SHOULD-BE-DROPPED",
        components: [
          {
            componentRef: "salla:900",
            requiredQuantity: 300,
            requiredUnit: "جرام",
            stockUnit: "كجم",
            note: "أرز",
          },
          {
            customName: "دجاج",
            customStock: 40,
            requiredQuantity: 500,
            requiredUnit: "جرام",
            stockUnit: "كجم",
          },
        ],
      })

      expect(created.status).toBe(201)
      expect(created.body.sku).toBeNull()
      // A bundle is sold at its own combo price -- not derived from its components' cost.
      expect(created.body.sellPrice).toBe(45)

      const components = created.body.components as Array<Record<string, unknown>>
      expect(components).toHaveLength(2)
      expect(components[0]).toMatchObject({
        componentRef: "salla:900",
        customName: null,
        requiredQuantity: 300,
        requiredUnit: "جرام",
        stockUnit: "كجم",
        position: 0,
      })
      expect(components[1]).toMatchObject({
        componentRef: null,
        customName: "دجاج",
        customStock: 40,
        position: 1,
      })
    })

    it("rejects a bundle with no components", async () => {
      const { token } = await signIn("catalog-bundle-empty@example.com", "Catalog Bundle Empty")

      const created = await createProduct(token, { ...BUNDLE_BASE, components: [] })
      expect(created.status).toBe(422)
      expect((created.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "components"
      )
    })

    it("rejects a component that is both a catalogue reference and a hand-typed name", async () => {
      const { token } = await signIn("catalog-bundle-both@example.com", "Catalog Bundle Both")

      const created = await createProduct(token, {
        ...BUNDLE_BASE,
        components: [
          {
            componentRef: "salla:900",
            customName: "أرز",
            requiredQuantity: 1,
            requiredUnit: "حبة",
            stockUnit: "حبة",
          },
        ],
      })
      expect(created.status).toBe(422)
      expect((created.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "components.0"
      )
    })

    it("demands a conversion factor when the units cannot be bridged by formula", async () => {
      const { token } = await signIn("catalog-bundle-units@example.com", "Catalog Bundle Units")

      // حبة is a count and كجم is a mass: no formula relates them, so a factor is required
      // rather than guessed.
      const missing = await createProduct(token, {
        ...BUNDLE_BASE,
        components: [
          {
            customName: "دجاج كامل",
            customStock: 40,
            requiredQuantity: 1,
            requiredUnit: "حبة",
            stockUnit: "كجم",
          },
        ],
      })
      expect(missing.status).toBe(422)
      expect((missing.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "components.0.conversionFactor"
      )

      const supplied = await createProduct(token, {
        ...BUNDLE_BASE,
        components: [
          {
            customName: "دجاج كامل",
            customStock: 40,
            requiredQuantity: 1,
            requiredUnit: "حبة",
            stockUnit: "كجم",
            conversionFactor: 1.2,
          },
        ],
      })
      expect(supplied.status).toBe(201)

      // Same dimension (grams against kilos) converts by formula, so no factor is needed.
      const sameDimension = await createProduct(token, {
        ...BUNDLE_BASE,
        name: "وجبة أرز",
        components: [
          {
            customName: "أرز",
            customStock: 25,
            requiredQuantity: 300,
            requiredUnit: "جرام",
            stockUnit: "كجم",
          },
        ],
      })
      expect(sameDimension.status).toBe(201)
    })

    it("reports available quantity as how many times the recipe could be produced from a linked raw material's real stock", async () => {
      const { token } = await signIn("catalog-bundle-producible@example.com", "Catalog Producible")

      const chicken = await createProduct(token, {
        productType: "raw",
        name: "دجاج",
        category: "مواد خام",
        stockQuantity: 6,
        baseUnit: "حبة (PCS)",
        costPrice: 15,
      })
      expect(chicken.status).toBe(201)

      // Each serving uses half a chicken, so 6 in stock should produce 12 servings -- this is
      // exactly the "linked chicken with كبسة, should produce 12 piece" scenario that used to
      // always show 0 regardless of the linked raw material's real stock.
      const kabsa = await createProduct(token, {
        ...BUNDLE_BASE,
        name: "كبسة نص",
        components: [
          {
            componentRef: chicken.body.id,
            requiredQuantity: 0.5,
            requiredUnit: "حبة",
            stockUnit: "حبة",
          },
        ],
      })
      expect(kabsa.status).toBe(201)

      const listResponse = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
      const list = (await listResponse.json()) as { items: Array<Record<string, unknown>> }
      const kabsaItem = list.items.find((item) => item.id === kabsa.body.id)

      expect(kabsaItem).toMatchObject({ availableStock: 12 })

      // Selling down the chicken and re-reading recomputes the figure live -- it is derived at
      // read time from the component's current stock, never stored on the bundle's own row.
      await database.query(`UPDATE products SET stock_quantity = 2 WHERE id = $1`, [
        chicken.body.id,
      ])
      const afterSale = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
      const afterSaleList = (await afterSale.json()) as { items: Array<Record<string, unknown>> }
      expect(afterSaleList.items.find((item) => item.id === kabsa.body.id)).toMatchObject({
        availableStock: 4,
      })
    })

    it("reports 0 available quantity when no component resolves to a real stock figure", async () => {
      const { token } = await signIn(
        "catalog-bundle-unresolvable@example.com",
        "Catalog Unresolvable"
      )

      // An external catalogue reference (a synced Salla product) has no products row in this
      // organization to read stock from, so it cannot contribute to the producible figure.
      const created = await createProduct(token, {
        ...BUNDLE_BASE,
        components: [
          {
            componentRef: "salla:900",
            requiredQuantity: 1,
            requiredUnit: "حبة",
            stockUnit: "حبة",
          },
        ],
      })
      expect(created.status).toBe(201)

      const listResponse = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
      const list = (await listResponse.json()) as { items: Array<Record<string, unknown>> }
      expect(list.items.find((item) => item.id === created.body.id)).toMatchObject({
        availableStock: 0,
      })
    })
  })

  describe("variable products", () => {
    const VARIABLE_BASE = {
      productType: "variable",
      name: "تيشيرت",
      sku: "TSH-100",
      category: "ملابس",
      status: "active",
      variantOptions: [{ name: "المقاس", values: ["S", "M"] }],
    }

    it("stores options and variants and reports merged stock and the cheapest price", async () => {
      const { token } = await signIn("catalog-variable@example.com", "Catalog Variable")

      const created = await createProduct(token, {
        ...VARIABLE_BASE,
        variants: [
          { sku: "TSH-100-S", price: 120, stock: 4, optionValues: ["S"] },
          { sku: "TSH-100-M", price: 95, stock: 6, optionValues: ["M"] },
        ],
      })

      expect(created.status).toBe(201)
      expect(created.body.variantOptions).toHaveLength(1)
      expect(created.body.variants).toHaveLength(2)
      // A variable product carries no price of its own -- each variant is priced in its row.
      expect(created.body.sellPrice).toBeNull()

      const listResponse = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
      const list = (await listResponse.json()) as { items: Array<Record<string, unknown>> }

      expect(list.items[0]).toMatchObject({
        platform: "Madar",
        availableStock: 10, // 4 + 6 across the variants
        sellingPrice: 95, // the cheapest variant, which is what a listing shows
      })
    })

    it("requires every variant to be priced", async () => {
      const { token } = await signIn("catalog-variable-price@example.com", "Catalog Var Price")

      const created = await createProduct(token, {
        ...VARIABLE_BASE,
        variants: [
          { sku: "TSH-100-S", price: 120, stock: 4, optionValues: ["S"] },
          { sku: "TSH-100-M", price: null, stock: 6, optionValues: ["M"] },
        ],
      })

      expect(created.status).toBe(422)
      expect((created.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "variants.1.price"
      )
    })

    it("rejects duplicate combinations and duplicate variant stock codes", async () => {
      const { token } = await signIn("catalog-variable-dupe@example.com", "Catalog Var Dupe")

      const duplicateCombination = await createProduct(token, {
        ...VARIABLE_BASE,
        variants: [
          { sku: "A", price: 10, stock: 1, optionValues: ["S"] },
          { sku: "B", price: 10, stock: 1, optionValues: ["S"] },
        ],
      })
      expect(duplicateCombination.status).toBe(422)

      const duplicateSku = await createProduct(token, {
        ...VARIABLE_BASE,
        variants: [
          { sku: "SAME", price: 10, stock: 1, optionValues: ["S"] },
          { sku: "SAME", price: 10, stock: 1, optionValues: ["M"] },
        ],
      })
      expect(duplicateSku.status).toBe(422)
      expect(
        (duplicateSku.body.details as { fields: Record<string, string> }).fields
      ).toHaveProperty("variants.1.sku")
    })

    it("rejects a variable product with no variants", async () => {
      const { token } = await signIn("catalog-variable-none@example.com", "Catalog Var None")

      const created = await createProduct(token, { ...VARIABLE_BASE, variants: [] })
      expect(created.status).toBe(422)
      expect((created.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "variants"
      )
    })
  })

  describe("updating", () => {
    async function patch(token: string, id: string, body: Record<string, unknown>) {
      const response = await fetch(`${baseUrl}/v1/products/${id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      return { status: response.status, body: (await response.json()) as Record<string, unknown> }
    }

    it("changes fields and keeps the same id", async () => {
      const { token } = await signIn("catalog-update@example.com", "Catalog Update")
      const created = await createProduct(token, SIMPLE_PRODUCT)
      const id = String(created.body.id)

      const updated = await patch(token, id, {
        ...SIMPLE_PRODUCT,
        name: "قميص كتان",
        sellPrice: 155,
        stockQuantity: 40,
        status: "draft",
      })

      expect(updated.status).toBe(200)
      expect(updated.body).toMatchObject({
        id,
        name: "قميص كتان",
        sellPrice: 155,
        stockQuantity: 40,
        status: "draft",
      })
    })

    it("lets a product keep its own stock code", async () => {
      const { token } = await signIn("catalog-update-sku@example.com", "Catalog Update Sku")
      const created = await createProduct(token, SIMPLE_PRODUCT)

      // Re-sending the same code must not read as a conflict with itself.
      const updated = await patch(token, String(created.body.id), {
        ...SIMPLE_PRODUCT,
        name: "اسم جديد",
      })
      expect(updated.status).toBe(200)
    })

    it("still rejects a stock code held by another product", async () => {
      const { token } = await signIn("catalog-update-dupe@example.com", "Catalog Update Dupe")
      const first = await createProduct(token, SIMPLE_PRODUCT)
      await createProduct(token, { ...SIMPLE_PRODUCT, sku: "SKU-200", name: "آخر" })

      const updated = await patch(token, String(first.body.id), {
        ...SIMPLE_PRODUCT,
        sku: "SKU-200",
      })
      expect(updated.status).toBe(409)
    })

    it("replaces the component list wholesale", async () => {
      const { token } = await signIn("catalog-update-comp@example.com", "Catalog Update Comp")
      const created = await createProduct(token, {
        productType: "bundle",
        name: "وجبة",
        category: "وجبات",
        sellPrice: 45,
        components: [
          {
            customName: "أرز",
            customStock: 25,
            requiredQuantity: 300,
            requiredUnit: "جرام",
            stockUnit: "كجم",
          },
          {
            customName: "دجاج",
            customStock: 40,
            requiredQuantity: 500,
            requiredUnit: "جرام",
            stockUnit: "كجم",
          },
        ],
      })
      expect((created.body.components as unknown[]).length).toBe(2)

      const updated = await patch(token, String(created.body.id), {
        productType: "bundle",
        name: "وجبة",
        category: "وجبات",
        sellPrice: 45,
        components: [
          {
            customName: "أرز",
            customStock: 25,
            requiredQuantity: 250,
            requiredUnit: "جرام",
            stockUnit: "كجم",
          },
        ],
      })

      expect(updated.status).toBe(200)
      const components = updated.body.components as Array<Record<string, unknown>>
      expect(components).toHaveLength(1)
      expect(components[0]).toMatchObject({ customName: "أرز", requiredQuantity: 250 })
    })

    it("applies the same type rules as creation", async () => {
      const { token } = await signIn("catalog-update-rules@example.com", "Catalog Update Rules")
      const created = await createProduct(token, SIMPLE_PRODUCT)

      const updated = await patch(token, String(created.body.id), {
        ...SIMPLE_PRODUCT,
        sellPrice: null,
      })
      expect(updated.status).toBe(422)
      expect((updated.body.details as { fields: Record<string, string> }).fields).toHaveProperty(
        "sellPrice"
      )
    })

    it("404s for another organization, an unknown id, or a synced id", async () => {
      const first = await signIn("catalog-upd-a@example.com", "Catalog Upd A")
      const second = await signIn("catalog-upd-b@example.com", "Catalog Upd B")
      const created = await createProduct(first.token, SIMPLE_PRODUCT)

      expect((await patch(second.token, String(created.body.id), SIMPLE_PRODUCT)).status).toBe(404)
      expect(
        (await patch(first.token, "6f6d1f9c-0000-4000-8000-000000000000", SIMPLE_PRODUCT)).status
      ).toBe(404)
      expect((await patch(first.token, "salla:900", SIMPLE_PRODUCT)).status).toBe(404)
    })
  })

  describe("deleting", () => {
    it("removes a product from the list and 404s afterwards", async () => {
      const { token } = await signIn("catalog-delete@example.com", "Catalog Delete")
      const created = await createProduct(token, SIMPLE_PRODUCT)
      const id = String(created.body.id)

      const removed = await fetch(`${baseUrl}/v1/products/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      })
      expect(removed.status).toBe(204)

      const listResponse = await fetch(`${baseUrl}/v1/products`, { headers: authHeaders(token) })
      expect(((await listResponse.json()) as { items: unknown[] }).items).toHaveLength(0)

      const fetched = await fetch(`${baseUrl}/v1/products/${id}`, { headers: authHeaders(token) })
      expect(fetched.status).toBe(404)
    })

    it("frees the stock code so it can be used again", async () => {
      const { token } = await signIn("catalog-delete-sku@example.com", "Catalog Delete Sku")
      const created = await createProduct(token, SIMPLE_PRODUCT)

      await fetch(`${baseUrl}/v1/products/${String(created.body.id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      })

      // The unique index is partial on deleted_at IS NULL, so a deleted product does not hold
      // its code hostage.
      expect((await createProduct(token, SIMPLE_PRODUCT)).status).toBe(201)
    })

    it("is idempotent and refuses ids from another organization", async () => {
      const first = await signIn("catalog-del-a@example.com", "Catalog Del A")
      const second = await signIn("catalog-del-b@example.com", "Catalog Del B")
      const created = await createProduct(first.token, SIMPLE_PRODUCT)
      const id = String(created.body.id)

      // Another organization must not be able to delete it, even knowing the id.
      const cross = await fetch(`${baseUrl}/v1/products/${id}`, {
        method: "DELETE",
        headers: authHeaders(second.token),
      })
      expect(cross.status).toBe(404)

      expect(
        (
          await fetch(`${baseUrl}/v1/products/${id}`, {
            method: "DELETE",
            headers: authHeaders(first.token),
          })
        ).status
      ).toBe(204)
      // A second delete finds nothing left to delete.
      expect(
        (
          await fetch(`${baseUrl}/v1/products/${id}`, {
            method: "DELETE",
            headers: authHeaders(first.token),
          })
        ).status
      ).toBe(404)
    })

    it("404s for a synced product id rather than failing on a uuid cast", async () => {
      const { token } = await signIn("catalog-del-ext@example.com", "Catalog Del Ext")
      const response = await fetch(`${baseUrl}/v1/products/salla:900`, {
        method: "DELETE",
        headers: authHeaders(token),
      })
      expect(response.status).toBe(404)
    })
  })

  it("rejects an unknown product type at the request boundary", async () => {
    const { token } = await signIn("catalog-badtype@example.com", "Catalog Bad Type")

    const created = await createProduct(token, {
      productType: "teleportation",
      name: "غير معروف",
      category: "x",
    })
    expect(created.status).toBe(400)
  })

  it("refuses an unauthenticated create", async () => {
    const response = await fetch(`${baseUrl}/v1/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(SIMPLE_PRODUCT),
    })
    expect(response.status).toBe(401)
  })
})

describe("PATCH /v1/products/status", () => {
  it("changes only the requested products' status, leaving every other field untouched", async () => {
    const { token } = await signIn("catalog-bulk-status@example.com", "Catalog Bulk Status")

    const first = await createProduct(token, { ...SIMPLE_PRODUCT, sku: "BULK-1" })
    const second = await createProduct(token, { ...SIMPLE_PRODUCT, sku: "BULK-2" })
    const untouched = await createProduct(token, { ...SIMPLE_PRODUCT, sku: "BULK-3" })

    const response = await fetch(`${baseUrl}/v1/products/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ ids: [first.body.id, second.body.id], status: "archived" }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as { updated: number }).toEqual({ updated: 2 })

    const firstRead = await fetch(`${baseUrl}/v1/products/${first.body.id}`, {
      headers: authHeaders(token),
    })
    const secondRead = await fetch(`${baseUrl}/v1/products/${second.body.id}`, {
      headers: authHeaders(token),
    })
    const untouchedRead = await fetch(`${baseUrl}/v1/products/${untouched.body.id}`, {
      headers: authHeaders(token),
    })
    const firstBody = (await firstRead.json()) as Record<string, unknown>
    expect(firstBody.status).toBe("archived")
    // Nothing else about the product moved -- this is a status-only write, not a round-trip
    // through the full-replace update() contract.
    expect(firstBody).toMatchObject({ name: SIMPLE_PRODUCT.name, sku: "BULK-1" })
    expect(((await secondRead.json()) as { status: string }).status).toBe("archived")
    expect(((await untouchedRead.json()) as { status: string }).status).toBe("active")
  })

  it("never changes another organization's product, even if its id is named explicitly", async () => {
    const orgA = await signIn("catalog-bulk-status-a@example.com", "Bulk Status Org A")
    const orgB = await signIn("catalog-bulk-status-b@example.com", "Bulk Status Org B")
    const theirs = await createProduct(orgB.token, { ...SIMPLE_PRODUCT, sku: "BULK-OTHER-ORG" })

    const response = await fetch(`${baseUrl}/v1/products/status`, {
      method: "PATCH",
      headers: authHeaders(orgA.token),
      body: JSON.stringify({ ids: [theirs.body.id], status: "archived" }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as { updated: number }).toEqual({ updated: 0 })

    const stillTheirs = await fetch(`${baseUrl}/v1/products/${theirs.body.id}`, {
      headers: authHeaders(orgB.token),
    })
    expect(((await stillTheirs.json()) as { status: string }).status).toBe("active")
  })

  it("rejects an unknown status and an empty id list at the request boundary", async () => {
    const { token } = await signIn("catalog-bulk-status-invalid@example.com", "Bulk Status Invalid")
    const product = await createProduct(token, SIMPLE_PRODUCT)

    const badStatus = await fetch(`${baseUrl}/v1/products/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ ids: [product.body.id], status: "deleted" }),
    })
    expect(badStatus.status).toBe(400)

    const emptyIds = await fetch(`${baseUrl}/v1/products/status`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ ids: [], status: "archived" }),
    })
    expect(emptyIds.status).toBe(400)
  })

  it("refuses an unauthenticated request", async () => {
    const response = await fetch(`${baseUrl}/v1/products/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["11111111-1111-1111-1111-111111111111"], status: "archived" }),
    })
    expect(response.status).toBe(401)
  })
})

describe("POST /v1/products/images", () => {
  it("uploads a real image and returns a hosted url usable as imageUrls[0]", async () => {
    const { token, actor } = await signIn("catalog-image@example.com", "Catalog Image")

    const response = await fetch(`${baseUrl}/v1/products/images`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        contentType: "image/png",
        dataBase64: Buffer.from("fake-png-bytes").toString("base64"),
      }),
    })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { url: string }
    expect(body.url).toBe(`https://cdn.test.local/product-images-bucket/${uploadedObjects[0].key}`)
    expect(uploadedObjects[0].key).toMatch(
      new RegExp(`^products/${actor.organizationId}/.+\\.png$`)
    )

    // The url this route hands back is exactly what a real create call persists and later
    // reads back -- not a separate, only-tested-in-isolation shape.
    const created = await createProduct(token, { ...SIMPLE_PRODUCT, imageUrls: [body.url] })
    expect(created.status).toBe(201)
    const fetched = await fetch(`${baseUrl}/v1/products/${String(created.body.id)}`, {
      headers: authHeaders(token),
    })
    const detail = (await fetched.json()) as { imageUrls: string[] }
    expect(detail.imageUrls).toEqual([body.url])
  })

  it("rejects an oversized upload", async () => {
    const { token } = await signIn("catalog-image-big@example.com", "Catalog Image Big")

    const response = await fetch(`${baseUrl}/v1/products/images`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        contentType: "image/png",
        dataBase64: Buffer.alloc(11 * 1024 * 1024).toString("base64"),
      }),
    })
    expect(response.status).toBe(400)
    expect(uploadedObjects).toHaveLength(0)
  })

  it("refuses an unauthenticated upload", async () => {
    const response = await fetch(`${baseUrl}/v1/products/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/png",
        dataBase64: Buffer.from("fake-png-bytes").toString("base64"),
      }),
    })
    expect(response.status).toBe(401)
  })
})
