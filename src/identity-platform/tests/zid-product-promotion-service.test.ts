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
    `insert into organizations (id, name, owner_user_id, status, settings)
     values ($1, 'Zid Promotion Test Org', $2, 'active', '{"posEnabled": true, "ecommerceEnabled": true, "advertisingEnabled": true}'::jsonb)`,
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

  it("keeps the description and the product's own currency", async () => {
    await service.promoteOrSync(organizationId, null, {
      ...SIMPLE_PAYLOAD,
      short_description: { ar: "كاميرا فيديو احترافية", en: "A professional video camera" },
      currency: "usd",
    })
    const rows = await database.query<{ description: string; currency: string }>(
      `select description, currency from products where organization_id = $1`,
      [organizationId]
    )
    expect(rows.rows[0]).toEqual({ description: "A professional video camera", currency: "USD" })
  })

  // The shape docs.zid.sa/get-a-product-by-id documents: a parent whose variants[] are full child
  // products, each with its own id, sku, price, stock and attributes.
  const child = (id: string, sku: string, shade: string, size: string | null, stock: number) => ({
    id,
    sku,
    parent_id: "parent-1",
    structure: "child",
    price: 30,
    stocks: [{ is_infinite: false, available_quantity: stock }],
    attributes: [
      { slug: "shade", name: "درجة اللون", value: { en: shade } },
      ...(size ? [{ slug: "size", name: { ar: "المقاس", en: "Size" }, value: { ar: size } }] : []),
    ],
  })
  const PARENT_PAYLOAD: ZidProductApiPayload = {
    id: "parent-1",
    name: { ar: "بخاخ منظف" },
    sku: "SPRAY-1",
    price: 30,
    is_published: true,
    structure: "parent",
    has_options: true,
    variants: [
      child("child-a", "SPRAY-12-S", "12", "صغير", 4),
      child("child-b", "SPRAY-55-S", "55", "صغير", 7),
      // No size attribute at all -- still imported, under its own label.
      child("child-c", "SPRAY-55-X", "55", null, 1),
    ],
  }

  it("imports a product with variants as a variable product, each variant linked to its Zid child", async () => {
    await service.promoteOrSync(organizationId, null, PARENT_PAYLOAD)

    const product = await database.query<{ id: string; product_type: string }>(
      `select id, product_type from products where organization_id = $1`,
      [organizationId]
    )
    expect(product.rows).toHaveLength(1)
    expect(product.rows[0].product_type).toBe("variable")
    const options = await database.query<{ name: string }>(
      `select name from product_variant_options where product_id = $1 order by position`,
      [product.rows[0].id]
    )
    expect(options.rows.map((row) => row.name)).toEqual(["درجة اللون", "Size"])
    const variants = await database.query<{ id: string; sku: string; stock: string }>(
      `select id, sku, stock from product_variants where product_id = $1 order by position`,
      [product.rows[0].id]
    )
    expect(variants.rows.map((row) => [row.sku, Number(row.stock)])).toEqual([
      ["SPRAY-12-S", 4],
      ["SPRAY-55-S", 7],
      ["SPRAY-55-X", 1],
    ])
    for (const [index, zidId] of ["child-a", "child-b", "child-c"].entries()) {
      const link = await linksService.findLinkForLine(organizationId, {
        productId: product.rows[0].id,
        variantId: variants.rows[index].id,
      })
      expect(link?.zidProductId).toBe(zidId)
    }
  })

  it("turns a product that gained variants into a variable product in place", async () => {
    await service.promoteOrSync(organizationId, null, { ...PARENT_PAYLOAD, variants: [] })
    const before = await database.query<{ id: string; product_type: string }>(
      `select id, product_type from products where organization_id = $1`,
      [organizationId]
    )
    expect(before.rows[0].product_type).toBe("simple")

    await service.promoteOrSync(organizationId, null, PARENT_PAYLOAD)
    const after = await database.query<{ id: string; product_type: string }>(
      `select id, product_type from products where organization_id = $1 and deleted_at is null`,
      [organizationId]
    )
    expect(after.rows).toEqual([{ id: before.rows[0].id, product_type: "variable" }])
    // The product-level link to the parent gave way to the variant links.
    const links = await database.query<{ zid_product_id: string }>(
      `select zid_product_id from zid_product_links where product_id = $1 order by zid_product_id`,
      [before.rows[0].id]
    )
    expect(links.rows.map((row) => row.zid_product_id)).toEqual(["child-a", "child-b", "child-c"])
  })

  it("never imports a variant child as a product of its own", async () => {
    await service.promoteOrSync(
      organizationId,
      null,
      child("child-a", "SPRAY-12-S", "12", "صغير", 4) as ZidProductApiPayload
    )
    const rows = await database.query(`select id from products where organization_id = $1`, [
      organizationId,
    ])
    expect(rows.rows).toHaveLength(0)
  })
})
