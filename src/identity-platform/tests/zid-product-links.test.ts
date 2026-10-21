// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ZidOAuthRepository } from "../zid-oauth/repository"
import { ZidProductLinksService } from "../products/zid-product-links-service"

let database: PostgresDatabase
let service: ZidProductLinksService
let organizationId: string
let userId: string

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  organizationId = randomUUID()
  userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'zid-links-test@madar.test', 'hash', 'Zid Links Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Zid Links Test Org', $2, 'active')`,
    [organizationId, userId]
  )

  service = new ZidProductLinksService(database, new ZidOAuthRepository(database))
})

async function insertProduct(productType: string): Promise<string> {
  const id = randomUUID()
  await database.query(
    `insert into products (id, organization_id, product_type, name) values ($1, $2, $3, 'Test Product')`,
    [id, organizationId, productType]
  )
  return id
}

describe("ZidProductLinksService", () => {
  it("links a stock-tracked product and finds it by its own Zid id", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, zidProductId: "111", zidProductSku: "SKU-1", zidProductName: "Test" },
      userId
    )
    expect(await service.findLinkForLine(organizationId, { productId })).toEqual({
      zidProductId: "111",
      zidProductSku: "SKU-1",
    })
    expect(await service.findProductForAnyZidId(organizationId, ["111"])).toEqual({ productId })
  })

  it("rejects a product-level link for a bundle", async () => {
    const bundleId = await insertProduct("bundle")
    await expect(
      service.upsertLink(
        organizationId,
        { productId: bundleId, zidProductId: "111", zidProductSku: null, zidProductName: null },
        userId
      )
    ).rejects.toThrow()
  })

  it("removes a link cleanly", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, zidProductId: "111", zidProductSku: null, zidProductName: null },
      userId
    )
    await service.removeLink(organizationId, { productId })
    expect(await service.findLinkForLine(organizationId, { productId })).toBeNull()
  })

  it("lists linkable Zid products with their bilingual name correctly resolved to a plain string", async () => {
    const connectionId = randomUUID()
    await database.query(
      `insert into zid_oauth_connections (
         id, organization_id, workspace_id, project_id, provider_account_id, status,
         created_by_user_id, updated_by_user_id, created_at, updated_at
       ) values ($1, $2, null, $3, '3256254', 'connected', $4, $4, now(), now())`,
      [connectionId, organizationId, randomUUID(), userId]
    )
    await database.query(
      `insert into zid_stores (id, connection_id, account_id, status, is_selected)
       values ($1, $2, '3256254', 'active', true)`,
      [randomUUID(), connectionId]
    )
    await database.query(
      `insert into zid_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload, created_at, updated_at)
       values ($1, $2, 'cust-1', 'products', '555', now()::date, $3::jsonb, now(), now())`,
      [
        randomUUID(),
        connectionId,
        JSON.stringify({ name: { en: "Sony A7S III", ar: "سونى" }, sku: "SKU-1" }),
      ]
    )

    const products = await service.listLinkableZidProducts(organizationId, null, null)
    expect(products).toEqual([{ zidProductId: "555", name: "Sony A7S III", sku: "SKU-1" }])
  })
})
