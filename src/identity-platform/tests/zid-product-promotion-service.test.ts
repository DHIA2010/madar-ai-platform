// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ProductCatalogRepository } from "../products/catalog-repository"
import { ProductCatalogService } from "../products/catalog-service"
import { ZidOAuthRepository } from "../zid-oauth/repository"
import { ZidProductLinksService } from "../products/zid-product-links-service"
import { ZidProductPromotionService } from "../products/zid-product-promotion-service"
import type { ZidProductApiPayload } from "../products/zid-product-mapper"
import { TaxRatesService } from "../tax/tax-rates-service"

let database: PostgresDatabase
let service: ZidProductPromotionService
let linksService: ZidProductLinksService
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
     values ($1, 'zid-promotion-test@madar.test', 'hash', 'Zid Promotion Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Zid Promotion Test Org', $2, 'active')`,
    [organizationId, userId]
  )

  const catalogService = new ProductCatalogService(
    new ProductCatalogRepository(database),
    new TaxRatesService(database)
  )
  linksService = new ZidProductLinksService(database, new ZidOAuthRepository(database))
  service = new ZidProductPromotionService(catalogService, linksService)
})

const SIMPLE_PAYLOAD: ZidProductApiPayload = {
  id: "a94357e3-d849-4a14-8313-ff10baadd12f",
  name: { ar: "منتج اختبار مدار", en: "Madar Test Product" },
  sku: "MADAR-TEST-1",
  price: 25,
  is_published: true,
  stocks: [{ is_infinite: false, available_quantity: 5 }],
}

describe("ZidProductPromotionService.promoteOrSync", () => {
  it("creates a native product and self-links it on first sync", async () => {
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)

    const rows = await database.query<{ name: string; stock_quantity: string }>(
      `select name, stock_quantity from products where organization_id = $1`,
      [organizationId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].name).toBe("Madar Test Product")
    expect(Number(rows.rows[0].stock_quantity)).toBe(5)

    const link = await linksService.findProductForAnyZidId(organizationId, [
      String(SIMPLE_PAYLOAD.id),
    ])
    expect(link).not.toBeNull()
  })

  it("updates the already-promoted product on a second sync instead of creating a duplicate", async () => {
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)
    await service.promoteOrSync(organizationId, null, {
      ...SIMPLE_PAYLOAD,
      stocks: [{ is_infinite: false, available_quantity: 2 }],
    })

    const rows = await database.query<{ stock_quantity: string }>(
      `select stock_quantity from products where organization_id = $1`,
      [organizationId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(Number(rows.rows[0].stock_quantity)).toBe(2)
  })

  it("re-creates a fresh product on the next sync after the promoted product was deleted", async () => {
    // Mirrors SallaProductPromotionService's identical test -- the same orphaned-link bug,
    // confirmed live on stage, applies to Zid's own promotion exactly the same way.
    await service.promoteOrSync(organizationId, null, SIMPLE_PAYLOAD)
    const firstRow = await database.query<{ id: string }>(
      `select id from products where organization_id = $1`,
      [organizationId]
    )
    const firstProductId = firstRow.rows[0].id
    await database.query(`update products set deleted_at = now() where id = $1`, [firstProductId])

    await service.promoteOrSync(organizationId, null, {
      ...SIMPLE_PAYLOAD,
      stocks: [{ is_infinite: false, available_quantity: 3 }],
    })

    const liveRows = await database.query<{ id: string; stock_quantity: string }>(
      `select id, stock_quantity from products where organization_id = $1 and deleted_at is null`,
      [organizationId]
    )
    expect(liveRows.rows).toHaveLength(1)
    expect(liveRows.rows[0].id).not.toBe(firstProductId)
    expect(Number(liveRows.rows[0].stock_quantity)).toBe(3)

    const link = await linksService.findProductForAnyZidId(organizationId, [
      String(SIMPLE_PAYLOAD.id),
    ])
    expect(link).toEqual({ productId: liveRows.rows[0].id })
  })
})
