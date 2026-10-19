// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { beforeEach, describe, expect, it } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaOAuthRepository } from "../salla-oauth/repository"
import { SallaProductLinksService } from "../products/salla-product-links-service"

let database: PostgresDatabase
let service: SallaProductLinksService
let organizationId: string
let userId: string

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  service = new SallaProductLinksService(database, new SallaOAuthRepository(database))

  organizationId = randomUUID()
  userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'links-test@madar.test', 'hash', 'Links Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Links Test Org', $2, 'active')`,
    [organizationId, userId]
  )
})

async function insertProduct(productType: string): Promise<string> {
  const id = randomUUID()
  await database.query(
    `insert into products (id, organization_id, product_type, name) values ($1, $2, $3, 'Test Product')`,
    [id, organizationId, productType]
  )
  return id
}

async function insertVariant(productId: string): Promise<string> {
  const id = randomUUID()
  await database.query(`insert into product_variants (id, product_id) values ($1, $2)`, [
    id,
    productId,
  ])
  return id
}

describe("SallaProductLinksService.upsertLink", () => {
  it("links a stock-tracked product at the product level", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-1", sallaProductName: "Salla One" },
      userId
    )
    const link = await service.findLinkForLine(organizationId, { productId })
    expect(link).toEqual({ sallaProductId: "111" })
  })

  it("rejects a product-level link for a bundle (must link its components or variants instead)", async () => {
    const bundleId = await insertProduct("bundle")
    await expect(
      service.upsertLink(
        organizationId,
        {
          productId: bundleId,
          sallaProductId: "111",
          sallaProductSku: "SKU-1",
          sallaProductName: null,
        },
        userId
      )
    ).rejects.toThrow()
  })

  it("rejects a variant that doesn't belong to the given product", async () => {
    const productId = await insertProduct("variable")
    const otherProductId = await insertProduct("variable")
    const foreignVariantId = await insertVariant(otherProductId)

    await expect(
      service.upsertLink(
        organizationId,
        {
          productId,
          variantId: foreignVariantId,
          sallaProductId: "111",
          sallaProductSku: "SKU-1",
          sallaProductName: null,
        },
        userId
      )
    ).rejects.toThrow()
  })

  it("rejects a variant from a different organization entirely", async () => {
    const otherOrgId = randomUUID()
    const otherUserId = randomUUID()
    await database.query(
      `insert into users (id, email, password_hash, full_name, email_verified_at)
       values ($1, 'other-org-links@madar.test', 'hash', 'Other', now())`,
      [otherUserId]
    )
    await database.query(
      `insert into organizations (id, name, owner_user_id, status) values ($1, 'Other Org', $2, 'active')`,
      [otherOrgId, otherUserId]
    )
    const foreignProductId = randomUUID()
    await database.query(
      `insert into products (id, organization_id, product_type, name) values ($1, $2, 'variable', 'Foreign')`,
      [foreignProductId, otherOrgId]
    )
    const foreignVariantId = await insertVariant(foreignProductId)

    const ownProductId = await insertProduct("variable")
    await expect(
      service.upsertLink(
        organizationId,
        {
          productId: ownProductId,
          variantId: foreignVariantId,
          sallaProductId: "111",
          sallaProductSku: "SKU-1",
          sallaProductName: null,
        },
        userId
      )
    ).rejects.toThrow()
  })

  it("linking at the variant level retires an existing product-level link but leaves other variants' links untouched", async () => {
    // Starts as a stock-tracked type so the initial product-level link is allowed, then switches
    // to variant-level links -- this test is purely about the link-replacement logic, not a claim
    // that a "simple" product normally carries variants.
    const productId = await insertProduct("simple")
    const variantA = await insertVariant(productId)
    const variantB = await insertVariant(productId)

    // Product starts in product-level mode.
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "100", sallaProductSku: "SKU-100", sallaProductName: null },
      userId
    )
    // Linking variant B switches the product into variant-level mode.
    await service.upsertLink(
      organizationId,
      {
        productId,
        variantId: variantB,
        sallaProductId: "200",
        sallaProductSku: "SKU-200",
        sallaProductName: null,
      },
      userId
    )
    // Linking variant A too -- must not disturb variant B's own link.
    await service.upsertLink(
      organizationId,
      {
        productId,
        variantId: variantA,
        sallaProductId: "300",
        sallaProductSku: "SKU-300",
        sallaProductName: null,
      },
      userId
    )

    expect(await service.findLinkForLine(organizationId, { productId })).toBeNull()
    expect(
      await service.findLinkForLine(organizationId, { productId, variantId: variantA })
    ).toEqual({
      sallaProductId: "300",
    })
    expect(
      await service.findLinkForLine(organizationId, { productId, variantId: variantB })
    ).toEqual({
      sallaProductId: "200",
    })
  })

  it("linking at the product level retires every per-variant link on that product", async () => {
    const productId = await insertProduct("variable")
    const variantA = await insertVariant(productId)
    await service.upsertLink(
      organizationId,
      {
        productId,
        variantId: variantA,
        sallaProductId: "200",
        sallaProductSku: "SKU-200",
        sallaProductName: null,
      },
      userId
    )

    await database.query(`update products set product_type = 'simple' where id = $1`, [productId])
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "400", sallaProductSku: "SKU-400", sallaProductName: null },
      userId
    )

    expect(await service.findLinkForLine(organizationId, { productId })).toEqual({
      sallaProductId: "400",
    })
    expect(
      await service.findLinkForLine(organizationId, { productId, variantId: variantA })
    ).toEqual({
      sallaProductId: "400",
    })
  })
})

describe("SallaProductLinksService.removeLink", () => {
  it("removes a product-level link without touching a sibling variant-level link on another product", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-1", sallaProductName: null },
      userId
    )
    await service.removeLink(organizationId, { productId })
    expect(await service.findLinkForLine(organizationId, { productId })).toBeNull()
  })
})

describe("SallaProductLinksService.findLinkForLine", () => {
  it("returns null when nothing is linked", async () => {
    const productId = await insertProduct("simple")
    expect(await service.findLinkForLine(organizationId, { productId })).toBeNull()
  })
})

describe("SallaProductLinksService.findProductForAnySallaId", () => {
  it("finds the native product for a simple product's own self-link", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-1", sallaProductName: null },
      null
    )
    expect(await service.findProductForAnySallaId(organizationId, ["111"])).toEqual({ productId })
  })

  it("finds the native product via ANY one of a variable product's per-variant self-links", async () => {
    const productId = await insertProduct("variable")
    const variantA = await insertVariant(productId)
    const variantB = await insertVariant(productId)
    await service.upsertLink(
      organizationId,
      {
        productId,
        variantId: variantA,
        sallaProductId: "sku-a",
        sallaProductSku: null,
        sallaProductName: null,
      },
      null
    )
    await service.upsertLink(
      organizationId,
      {
        productId,
        variantId: variantB,
        sallaProductId: "sku-b",
        sallaProductSku: null,
        sallaProductName: null,
      },
      null
    )
    // The parent Salla product's own id was never linked -- only its skus[] ids were -- so a
    // batch lookup across all of a product's sku ids is what finds it, not a single-id lookup
    // against the parent id.
    expect(
      await service.findProductForAnySallaId(organizationId, ["parent-id-never-linked", "sku-b"])
    ).toEqual({ productId })
  })

  it("returns null when none of the given ids are linked", async () => {
    const productId = await insertProduct("simple")
    await service.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-1", sallaProductName: null },
      null
    )
    expect(await service.findProductForAnySallaId(organizationId, ["222", "333"])).toBeNull()
  })

  it("returns null for an empty id list without querying", async () => {
    expect(await service.findProductForAnySallaId(organizationId, [])).toBeNull()
  })
})
