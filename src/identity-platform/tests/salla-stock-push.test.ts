// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { SallaOAuthRepository } from "../salla-oauth/repository"
import { SallaOAuthService } from "../salla-oauth/service"
import { SallaProductLinksService } from "../products/salla-product-links-service"
import { SallaStockPushService } from "../products/salla-stock-push-service"

let database: PostgresDatabase
let linksService: SallaProductLinksService
let pushService: SallaStockPushService
let organizationId: string
let userId: string
let connectionId: string

beforeEach(async () => {
  const mem = newDb({ autoCreateForeignKeyIndices: true })
  const adapter = mem.adapters.createPg()
  database = new PostgresDatabase(new adapter.Pool())
  await runIdentityMigrations(database, process.cwd())

  organizationId = randomUUID()
  userId = randomUUID()
  await database.query(
    `insert into users (id, email, password_hash, full_name, email_verified_at)
     values ($1, 'stock-push-test@madar.test', 'hash', 'Stock Push Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Stock Push Test Org', $2, 'active')`,
    [organizationId, userId]
  )

  connectionId = randomUUID()
  await database.query(
    `insert into salla_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, null, $3, '998877', 'connected', $4, $4, now(), now())`,
    [connectionId, organizationId, randomUUID(), userId]
  )

  const sallaOAuthRepository = new SallaOAuthRepository(database)
  linksService = new SallaProductLinksService(database, sallaOAuthRepository)
  pushService = new SallaStockPushService(
    new SallaOAuthService(sallaOAuthRepository),
    sallaOAuthRepository,
    linksService,
    database
  )

  vi.spyOn(SallaOAuthService.prototype, "resolveAccessToken").mockResolvedValue("test-access-token")
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function insertProduct(stockQuantity: number): Promise<string> {
  const id = randomUUID()
  await database.query(
    `insert into products (id, organization_id, product_type, name, stock_quantity)
     values ($1, $2, 'simple', 'Test Product', $3)`,
    [id, organizationId, stockQuantity]
  )
  return id
}

describe("SallaStockPushService.pushStockForLines", () => {
  it("pushes the current, already-committed stock figure for a linked product", async () => {
    const productId = await insertProduct(42)
    await linksService.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-111", sallaProductName: null },
      userId
    )

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))

    await pushService.pushStockForLines(organizationId, null, [{ productId }], -1)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain("111")
    expect(JSON.parse(String(init?.body))).toEqual({ quantity: 42 })
  })

  it("is a silent no-op for a line with no link at all", async () => {
    const productId = await insertProduct(10)
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))

    await expect(
      pushService.pushStockForLines(organizationId, null, [{ productId }], -1)
    ).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("is a silent no-op when there is no active Salla connection", async () => {
    await database.query(
      `update salla_oauth_connections set status = 'disconnected' where id = $1`,
      [connectionId]
    )
    const productId = await insertProduct(10)
    await linksService.upsertLink(
      organizationId,
      { productId, sallaProductId: "111", sallaProductSku: "SKU-111", sallaProductName: null },
      userId
    )
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))

    await pushService.pushStockForLines(organizationId, null, [{ productId }], -1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not let one failing push block another linked product's push", async () => {
    const failingProductId = await insertProduct(5)
    const okProductId = await insertProduct(9)
    await linksService.upsertLink(
      organizationId,
      {
        productId: failingProductId,
        sallaProductId: "111",
        sallaProductSku: "SKU-111",
        sallaProductName: null,
      },
      userId
    )
    await linksService.upsertLink(
      organizationId,
      {
        productId: okProductId,
        sallaProductId: "222",
        sallaProductSku: "SKU-222",
        sallaProductName: null,
      },
      userId
    )

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput) => {
      const url = String(rawInput)
      if (url.includes("111")) throw new Error("network error")
      return new Response("{}", { status: 200 })
    })

    await expect(
      pushService.pushStockForLines(
        organizationId,
        null,
        [{ productId: failingProductId }, { productId: okProductId }],
        -1
      )
    ).resolves.toBeUndefined()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("never throws, even when nothing resolves", async () => {
    await expect(
      pushService.pushStockForLines(organizationId, null, [{ productId: null }], -1)
    ).resolves.toBeUndefined()
  })
})
