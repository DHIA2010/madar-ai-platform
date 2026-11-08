// @vitest-environment node

// The products list (ProductsAggregationService) shows a synced Zid record only while it hasn't
// become a native product -- including a product with variants, which is linked per variant, and
// never a variant child on its own.
import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ProductCatalogRepository } from "../products/catalog-repository"
import { ProductCatalogService } from "../products/catalog-service"
import { ProductsAggregationService } from "../products/service"
import { ZidProductLinksService } from "../products/zid-product-links-service"
import type { ZidProductApiPayload } from "../products/zid-product-mapper"
import { ZidProductPromotionService } from "../products/zid-product-promotion-service"
import { TaxRatesService } from "../tax/tax-rates-service"
import { ZidOAuthRepository } from "../zid-oauth/repository"

let database: PostgresDatabase
let organizationId: string
let connectionId: string
let promotion: ZidProductPromotionService

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  database = new PostgresDatabase(new (mem.adapters.createPg().Pool)())
  await runIdentityMigrations(database, process.cwd())
  organizationId = randomUUID()
  const userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'zid-list@madar.test', 'hash', 'Zid List', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status) values ($1, 'Org', $2, 'active')`,
    [organizationId, userId]
  )
  connectionId = randomUUID()
  await database.query(
    `insert into zid_oauth_connections (id, organization_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id)
     values ($1, $2, $3, '3257669', 'connected', $4, $4)`,
    [connectionId, organizationId, randomUUID(), userId]
  )
  promotion = new ZidProductPromotionService(
    new ProductCatalogService(
      new ProductCatalogRepository(database),
      new TaxRatesService(database)
    ),
    new ZidProductLinksService(database, new ZidOAuthRepository(database))
  )
})

afterEach(async () => {
  await database.end()
})

const storeRecord = (payload: ZidProductApiPayload) =>
  database.query(
    `insert into zid_records (id, connection_id, customer_id, entity_type, entity_id, record_date, payload)
     values ($1, $2, '3257669', 'products', $3, '2026-11-08', $4)`,
    [randomUUID(), connectionId, String(payload.id), JSON.stringify(payload)]
  )

describe("ProductsAggregationService.listProducts -- Zid", () => {
  it("shows a Zid product once it is native, variants included, and never a child alone", async () => {
    const child = (id: string, sku: string, size: string) => ({
      id,
      sku,
      parent_id: "parent-1",
      structure: "child",
      price: 100,
      stocks: [{ is_infinite: false, available_quantity: 3 }],
      attributes: [{ slug: "size", name: "المقاس", value: { ar: size } }],
    })
    const parent: ZidProductApiPayload = {
      id: "parent-1",
      name: { en: "diaa options test" },
      sku: "Z.1",
      price: 100,
      is_published: true,
      structure: "parent",
      has_options: true,
      variants: [child("child-s", "Z.1-S", "S"), child("child-m", "Z.1-M", "M")],
    }
    const notYetImported: ZidProductApiPayload = {
      id: "standalone-1",
      name: { en: "Not promoted" },
      price: 5,
    }
    await promotion.promoteOrSync(organizationId, null, parent)
    await storeRecord(parent)
    await storeRecord(child("child-s", "Z.1-S", "S") as ZidProductApiPayload)
    await storeRecord(child("child-m", "Z.1-M", "M") as ZidProductApiPayload)
    await storeRecord(notYetImported)

    const listed = await new ProductsAggregationService(database).listProducts({
      organizationId,
      workspaceId: null,
    } as AuthenticatedActor)

    expect(listed.map((product) => product.id)).toEqual(["zid:standalone-1"])
  })
})
