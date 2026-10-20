// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ProductCatalogRepository } from "../products/catalog-repository"
import { ProductCatalogService } from "../products/catalog-service"
import { SallaOAuthRepository } from "../salla-oauth/repository"
import { SallaProductLinksService } from "../products/salla-product-links-service"
import { SallaProductPromotionService } from "../products/salla-product-promotion-service"
import type { SallaProductApiPayload } from "../products/salla-product-mapper"
import { TaxRatesService } from "../tax/tax-rates-service"

let database: PostgresDatabase
let service: SallaProductPromotionService
let linksService: SallaProductLinksService
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
     values ($1, 'promotion-test@madar.test', 'hash', 'Promotion Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Promotion Test Org', $2, 'active')`,
    [organizationId, userId]
  )

  const catalogService = new ProductCatalogService(
    new ProductCatalogRepository(database),
    new TaxRatesService(database)
  )
  linksService = new SallaProductLinksService(database, new SallaOAuthRepository(database))
  service = new SallaProductPromotionService(catalogService, linksService)
})

const SIMPLE_PAYLOAD: SallaProductApiPayload = {
  id: 496668399,
  name: "diaa",
  sku: "101010",
  price: { amount: 109, currency: "SAR" },
  quantity: 9,
  is_available: true,
  categories: [{ name: "الفساتين" }],
}

describe("SallaProductPromotionService.promoteOrSync -- simple product", () => {
  it("creates a native product and self-links it on first sync", async () => {
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)

    const rows = await database.query<{ name: string; stock_quantity: string; sku: string }>(
      `select name, stock_quantity, sku from products where organization_id = $1`,
      [organizationId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({ name: "diaa", sku: "101010" })
    expect(Number(rows.rows[0].stock_quantity)).toBe(9)

    const link = await linksService.findProductForAnySallaId(organizationId, ["496668399"])
    expect(link).not.toBeNull()
  })

  it("updates the already-promoted product on a second sync instead of creating a duplicate", async () => {
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)
    await service.promoteOrSync(organizationId, null, {
      ...SIMPLE_PAYLOAD,
      quantity: 7,
      name: "diaa updated",
    })

    const rows = await database.query<{ name: string; stock_quantity: string }>(
      `select name, stock_quantity from products where organization_id = $1`,
      [organizationId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].name).toBe("diaa updated")
    expect(Number(rows.rows[0].stock_quantity)).toBe(7)
  })

  it("re-creates a fresh product on the next sync after the promoted product was deleted", async () => {
    // Confirmed live on stage: deleting a promoted product leaves its link orphaned --
    // findProductForAnySallaId has no way to know the product it points to is gone, since it
    // never joins against products. Before this fix, every future sync for this Salla product
    // failed with PRODUCT_NOT_FOUND forever, never re-creating it.
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)
    const firstRow = await database.query<{ id: string }>(
      `select id from products where organization_id = $1`,
      [organizationId]
    )
    const firstProductId = firstRow.rows[0].id
    await database.query(`update products set deleted_at = now() where id = $1`, [firstProductId])

    await service.promoteOrSync(organizationId, null, { ...SIMPLE_PAYLOAD, quantity: 3 })

    const liveRows = await database.query<{ id: string; stock_quantity: string }>(
      `select id, stock_quantity from products where organization_id = $1 and deleted_at is null`,
      [organizationId]
    )
    expect(liveRows.rows).toHaveLength(1)
    expect(liveRows.rows[0].id).not.toBe(firstProductId)
    expect(Number(liveRows.rows[0].stock_quantity)).toBe(3)

    const link = await linksService.findProductForAnySallaId(organizationId, ["496668399"])
    expect(link).toEqual({ productId: liveRows.rows[0].id })
  })
})

describe("SallaProductPromotionService.promoteOrSync -- variable product", () => {
  const VARIABLE_PAYLOAD: SallaProductApiPayload = {
    id: 1667037701,
    name: "تنورة",
    sku: null,
    is_available: true,
    options: [
      {
        id: 266591475,
        name: "المقاس",
        purpose: "variants",
        values: [
          { id: 1465459335, name: "44 - XL" },
          { id: 556155264, name: "42 - L" },
        ],
      },
    ],
    skus: [
      {
        id: 932233789,
        sku: null,
        price: { amount: 83 },
        stock_quantity: 1,
        related_option_values: [1465459335],
      },
      {
        id: 25026878,
        sku: null,
        price: { amount: 86 },
        stock_quantity: 2,
        related_option_values: [556155264],
      },
    ],
  }

  it("creates a variable product with its variants, self-linking each variant to its own Salla sku id", async () => {
    await service.promoteOrSync(organizationId, null, VARIABLE_PAYLOAD)

    const productRow = await database.query<{ id: string; product_type: string }>(
      `select id, product_type from products where organization_id = $1`,
      [organizationId]
    )
    expect(productRow.rows).toHaveLength(1)
    expect(productRow.rows[0].product_type).toBe("variable")

    const variantRows = await database.query<{ id: string; stock: string }>(
      `select id, stock from product_variants where product_id = $1 order by position`,
      [productRow.rows[0].id]
    )
    expect(variantRows.rows).toHaveLength(2)

    const linkForSkuA = await linksService.findProductForAnySallaId(organizationId, ["932233789"])
    const linkForSkuB = await linksService.findProductForAnySallaId(organizationId, ["25026878"])
    expect(linkForSkuA).toEqual({ productId: productRow.rows[0].id })
    expect(linkForSkuB).toEqual({ productId: productRow.rows[0].id })
  })

  it("re-links variants after an update rebuilds them with new ids", async () => {
    await service.promoteOrSync(organizationId, null, VARIABLE_PAYLOAD)
    // A later sync with a changed stock figure -- update() does a full replace of variants, so
    // their ids change; re-promoting must re-resolve the links, not leave them pointing at
    // deleted rows.
    await service.promoteOrSync(organizationId, null, {
      ...VARIABLE_PAYLOAD,
      skus: VARIABLE_PAYLOAD.skus!.map((sku) => ({
        ...sku,
        stock_quantity: (sku.stock_quantity ?? 0) + 5,
      })),
    })

    const productRow = await database.query<{ id: string }>(
      `select id from products where organization_id = $1`,
      [organizationId]
    )
    expect(productRow.rows).toHaveLength(1)

    const linkForSkuA = await linksService.findProductForAnySallaId(organizationId, ["932233789"])
    expect(linkForSkuA).toEqual({ productId: productRow.rows[0].id })

    const variantRows = await database.query<{ stock: string }>(
      `select stock from product_variants where product_id = $1 order by position`,
      [productRow.rows[0].id]
    )
    expect(variantRows.rows.map((r) => Number(r.stock))).toEqual([6, 7])
  })

  it("re-creates a fresh variable product on the next sync after the promoted product was deleted", async () => {
    await service.promoteOrSync(organizationId, null, VARIABLE_PAYLOAD)
    const firstRow = await database.query<{ id: string }>(
      `select id from products where organization_id = $1`,
      [organizationId]
    )
    const firstProductId = firstRow.rows[0].id
    await database.query(`update products set deleted_at = now() where id = $1`, [firstProductId])

    await service.promoteOrSync(organizationId, null, VARIABLE_PAYLOAD)

    const liveRows = await database.query<{ id: string }>(
      `select id from products where organization_id = $1 and deleted_at is null`,
      [organizationId]
    )
    expect(liveRows.rows).toHaveLength(1)
    expect(liveRows.rows[0].id).not.toBe(firstProductId)

    const linkForSkuA = await linksService.findProductForAnySallaId(organizationId, ["932233789"])
    expect(linkForSkuA).toEqual({ productId: liveRows.rows[0].id })

    const variantRows = await database.query<{ id: string }>(
      `select id from product_variants where product_id = $1`,
      [liveRows.rows[0].id]
    )
    expect(variantRows.rows).toHaveLength(2)
  })
})
