// @vitest-environment node
//
// Unit tests for the shared stock-consumption module (extracted from PosInvoicesService so
// MadarOrdersService can reuse the exact same logic) -- bundle fan-out, variant-only lines, and
// the out-of-stock-blocking/allowed split, independent of either caller's HTTP surface.

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import {
  applyStockConsumption,
  assertStockAvailability,
  computeStockConsumption,
} from "../products/stock-consumption"

let database: PostgresDatabase
let organizationId: string

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  organizationId = randomUUID()
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'stock-test@madar.test', 'hash', 'Stock Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Stock Test Org', $2, 'active')`,
    [organizationId, userId]
  )
})

async function insertProduct(input: {
  productType: string
  stockQuantity: number | null
}): Promise<string> {
  const id = randomUUID()
  await database.query(
    `insert into products (id, organization_id, product_type, name, stock_quantity)
     values ($1, $2, $3, 'Test Product', $4)`,
    [id, organizationId, input.productType, input.stockQuantity]
  )
  return id
}

async function insertVariant(productId: string, stock: number | null): Promise<string> {
  const id = randomUUID()
  await database.query(`insert into product_variants (id, product_id, stock) values ($1, $2, $3)`, [
    id,
    productId,
    stock,
  ])
  return id
}

describe("computeStockConsumption", () => {
  it("consumes a raw/simple/weighted product directly, one unit per unit sold", async () => {
    const productId = await insertProduct({ productType: "simple", stockQuantity: 10 })
    const result = await computeStockConsumption(database, organizationId, [
      { productId, quantity: 3 },
    ])
    expect(result.products.get(productId)).toBe(3)
    expect(result.variants.size).toBe(0)
  })

  it("consumes a variant's own stock directly via variantId, not the parent product's", async () => {
    const productId = await insertProduct({ productType: "variable", stockQuantity: null })
    const variantId = await insertVariant(productId, 5)
    const result = await computeStockConsumption(database, organizationId, [
      { productId, variantId, quantity: 2 },
    ])
    expect(result.products.size).toBe(0)
    expect(result.variants.get(variantId)).toBe(2)
  })

  it("fans a bundle sale out into its native components, converted to each component's stock unit", async () => {
    const componentId = await insertProduct({ productType: "simple", stockQuantity: 100 })
    const bundleId = await insertProduct({ productType: "bundle", stockQuantity: null })
    await database.query(
      `insert into product_components
         (id, product_id, component_ref, required_quantity, required_unit, stock_unit, position)
       values ($1, $2, $3, $4, 'كجم', 'كجم', 0)`,
      [randomUUID(), bundleId, componentId, 2]
    )
    const result = await computeStockConsumption(database, organizationId, [
      { productId: bundleId, quantity: 3 },
    ])
    // 2kg per bundle unit * 3 bundle units sold = 6kg of the component consumed.
    expect(result.products.get(componentId)).toBe(6)
  })

  it("ignores a variantId that doesn't belong to this organization's own catalogue", async () => {
    const otherOrgId = randomUUID()
    const otherUserId = randomUUID()
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'other-org@madar.test', 'hash', 'Other Org', now())`,
      [otherUserId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status) values ($1, 'Other Org', $2, 'active')`,
      [otherOrgId, otherUserId]
    )
    const foreignProductId = randomUUID()
    await database.query(
      `insert into products (id, organization_id, product_type, name, stock_quantity)
       values ($1, $2, 'variable', 'Foreign Product', null)`,
      [foreignProductId, otherOrgId]
    )
    const foreignVariantId = await insertVariant(foreignProductId, 50)

    const result = await computeStockConsumption(database, organizationId, [
      { productId: foreignProductId, variantId: foreignVariantId, quantity: 10 },
    ])
    expect(result.variants.size).toBe(0)
    expect(result.products.size).toBe(0)
  })
})

describe("assertStockAvailability", () => {
  it("throws via the caller-supplied error factory when a product's stock would go negative", async () => {
    const productId = await insertProduct({ productType: "simple", stockQuantity: 2 })
    const consumption = await computeStockConsumption(database, organizationId, [
      { productId, quantity: 5 },
    ])
    await expect(
      assertStockAvailability(
        database,
        consumption,
        new Map(),
        (name) => new Error(`OUT_OF_STOCK:${name}`)
      )
    ).rejects.toThrow("OUT_OF_STOCK:")
  })

  it("does not throw when stock is null (untracked) or sufficient", async () => {
    const untrackedProductId = await insertProduct({ productType: "service", stockQuantity: null })
    const sufficientProductId = await insertProduct({ productType: "simple", stockQuantity: 10 })
    const consumption = await computeStockConsumption(database, organizationId, [
      { productId: untrackedProductId, quantity: 999 },
      { productId: sufficientProductId, quantity: 1 },
    ])
    await expect(
      assertStockAvailability(
        database,
        consumption,
        new Map(),
        (name) => new Error(`OUT_OF_STOCK:${name}`)
      )
    ).resolves.toBeUndefined()
  })
})

describe("applyStockConsumption", () => {
  it("subtracts on sign -1 and adds back on sign +1, leaving stock exactly as it started", async () => {
    const productId = await insertProduct({ productType: "simple", stockQuantity: 10 })
    const consumption = await computeStockConsumption(database, organizationId, [
      { productId, quantity: 4 },
    ])

    await applyStockConsumption(database, consumption, -1)
    const afterSale = await database.query<{ stock_quantity: string }>(
      `select stock_quantity from products where id = $1`,
      [productId]
    )
    expect(Number(afterSale.rows[0].stock_quantity)).toBe(6)

    await applyStockConsumption(database, consumption, 1)
    const afterReturn = await database.query<{ stock_quantity: string }>(
      `select stock_quantity from products where id = $1`,
      [productId]
    )
    expect(Number(afterReturn.rows[0].stock_quantity)).toBe(10)
  })

  it("allows stock to go negative rather than blocking -- checkout is never blocked by applyStockConsumption itself", async () => {
    const productId = await insertProduct({ productType: "simple", stockQuantity: 2 })
    const consumption = await computeStockConsumption(database, organizationId, [
      { productId, quantity: 5 },
    ])
    await applyStockConsumption(database, consumption, -1)
    const row = await database.query<{ stock_quantity: string }>(
      `select stock_quantity from products where id = $1`,
      [productId]
    )
    expect(Number(row.rows[0].stock_quantity)).toBe(-3)
  })
})
