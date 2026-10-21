// @vitest-environment node

import { randomUUID } from "node:crypto"

import { newDb } from "pg-mem"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runIdentityMigrations } from "../infrastructure/postgres/migration-runner"
import { PostgresDatabase } from "../infrastructure/postgres/database"
import { ZidOAuthRepository } from "../zid-oauth/repository"
import { ZidOAuthService } from "../zid-oauth/service"
import { ZidProductLinksService } from "../products/zid-product-links-service"
import { ZidProductStockPushService } from "../products/zid-product-stock-push-service"

let database: PostgresDatabase
let linksService: ZidProductLinksService
let pushService: ZidProductStockPushService
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
     values ($1, 'zid-stock-push-test@madar.test', 'hash', 'Zid Stock Push Test', now())`,
    [userId]
  )
  await database.query(
    `insert into organizations (id, name, owner_user_id, status)
     values ($1, 'Zid Stock Push Test Org', $2, 'active')`,
    [organizationId, userId]
  )

  const connectionId = randomUUID()
  await database.query(
    `insert into zid_oauth_connections (
       id, organization_id, workspace_id, project_id, provider_account_id, status,
       created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values ($1, $2, null, $3, '998877', 'connected', $4, $4, now(), now())`,
    [connectionId, organizationId, randomUUID(), userId]
  )
  await database.query(
    `insert into zid_stores (id, connection_id, account_id, status, is_selected)
     values ($1, $2, '998877', 'active', true)`,
    [randomUUID(), connectionId]
  )

  const zidOAuthRepository = new ZidOAuthRepository(database)
  linksService = new ZidProductLinksService(database, zidOAuthRepository)
  pushService = new ZidProductStockPushService(
    new ZidOAuthService(zidOAuthRepository),
    zidOAuthRepository,
    linksService,
    database
  )

  vi.spyOn(ZidOAuthService.prototype, "resolveAccessToken").mockResolvedValue({
    accessToken: "test-access-token",
    authorizationHeader: "Bearer test-access-token",
  })
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

function mockFetchSequence(productGetBody: unknown, patchStatus = 200) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_rawInput, init) => {
    if (init?.method === "PATCH") {
      return new Response("{}", { status: patchStatus })
    }
    return new Response(JSON.stringify(productGetBody), { status: 200 })
  })
}

describe("ZidProductStockPushService.pushStockForLines", () => {
  it("re-fetches the product's stock-location id, then PATCHes that entry with the current figure", async () => {
    const productId = await insertProduct(42)
    await linksService.upsertLink(
      organizationId,
      { productId, zidProductId: "555", zidProductSku: "SKU-555", zidProductName: null },
      userId
    )

    const fetchSpy = mockFetchSequence({
      id: "555",
      stocks: [{ id: "stock-location-1", is_infinite: false, available_quantity: 10 }],
    })

    await pushService.pushStockForLines(organizationId, null, [{ productId }], -1)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [getUrl] = fetchSpy.mock.calls[0]
    expect(String(getUrl)).toContain("/products/555/")
    const [patchUrl, patchInit] = fetchSpy.mock.calls[1]
    expect(String(patchUrl)).toContain("/products/555/stocks/stock-location-1/")
    expect(patchInit?.method).toBe("PATCH")
    expect(JSON.parse(String(patchInit?.body))).toEqual({
      available_quantity: 42,
      is_infinite: false,
    })
  })

  it("pushes is_infinite: true instead of the sentinel figure for a product Zid tracks as unlimited", async () => {
    // Madar's own stand-in for "this came from a Zid location Zid itself tracks as unlimited"
    // (see zid-product-mapper.ts's INFINITE_STOCK_SENTINEL) -- pushed back as is_infinite: true
    // rather than literally sending 999999 as a real quantity.
    const productId = await insertProduct(999_999)
    await linksService.upsertLink(
      organizationId,
      { productId, zidProductId: "555", zidProductSku: "SKU-555", zidProductName: null },
      userId
    )

    const fetchSpy = mockFetchSequence({
      id: "555",
      stocks: [{ id: "stock-location-1", is_infinite: true, available_quantity: null }],
    })

    await pushService.pushStockForLines(organizationId, null, [{ productId }], -1)

    const [, patchInit] = fetchSpy.mock.calls[1]
    expect(JSON.parse(String(patchInit?.body))).toEqual({
      available_quantity: null,
      is_infinite: true,
    })
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

  it("is a silent no-op when there is no active Zid connection", async () => {
    await database.query(`update zid_oauth_connections set status = 'disconnected'`)
    const productId = await insertProduct(10)
    await linksService.upsertLink(
      organizationId,
      { productId, zidProductId: "555", zidProductSku: "SKU-555", zidProductName: null },
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
        zidProductId: "111",
        zidProductSku: null,
        zidProductName: null,
      },
      userId
    )
    await linksService.upsertLink(
      organizationId,
      { productId: okProductId, zidProductId: "222", zidProductSku: null, zidProductName: null },
      userId
    )

    vi.spyOn(globalThis, "fetch").mockImplementation(async (rawInput) => {
      const url = String(rawInput)
      if (url.includes("/products/111/")) throw new Error("network error")
      return new Response(
        JSON.stringify({
          id: "222",
          stocks: [{ id: "loc-1", is_infinite: false, available_quantity: 1 }],
        }),
        { status: 200 }
      )
    })

    await expect(
      pushService.pushStockForLines(
        organizationId,
        null,
        [{ productId: failingProductId }, { productId: okProductId }],
        -1
      )
    ).resolves.toBeUndefined()
  })

  it("never throws, even when nothing resolves", async () => {
    await expect(
      pushService.pushStockForLines(organizationId, null, [{ productId: null }], -1)
    ).resolves.toBeUndefined()
  })
})
