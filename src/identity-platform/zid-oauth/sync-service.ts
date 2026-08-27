import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { ZidOAuthRepository } from "./repository"
import type { ZidOAuthService } from "./service"
import { ZidSyncRepository, type ZidSyncRecordInput } from "./sync-repository"

const DEFAULT_ZID_API_BASE_URL = "https://api.zid.sa/v1"
// Zid stores can have thousands of products/orders/customers -- this bounds a single sync
// run so a misbehaving API (e.g. pagination metadata that never signals "done") can't loop
// forever, matching every other connector's MAX_PAGES_PER_ENTITY guard.
const MAX_PAGES_PER_ENTITY = 200
const ORDERS_PAGE_SIZE = 50
const CUSTOMERS_PAGE_SIZE = 50
const PRODUCTS_PAGE_SIZE = 50

interface ZidProductApiRow {
  id: string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface ZidOrderApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface ZidCustomerApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "ZID_SYNC_FORBIDDEN", false, 403)
  }
}

function toRecordDate(candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  }
  return new Date().toISOString().slice(0, 10)
}

// Confirmed against Zid's official docs (docs.zid.sa/retrieve-a-list-of-products): the
// Products resource sits on a different internal API surface than Orders/Customers and uses
// entirely different auth headers (Access-Token/Store-Id/Role rather than
// Authorization+X-Manager-Token) and DRF-style pagination (page/page_size, results/next/
// count) rather than the page/per_page + orders|customers envelope the Merchant API uses.
async function fetchAllProducts(input: {
  apiBaseUrl: string
  storeId: string
  accessToken: string
}): Promise<ZidProductApiRow[]> {
  const results: ZidProductApiRow[] = []
  let page = 1

  while (page <= MAX_PAGES_PER_ENTITY) {
    const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}/products/`)
    url.searchParams.set("page", String(page))
    url.searchParams.set("page_size", String(PRODUCTS_PAGE_SIZE))

    const response = await fetch(url.toString(), {
      headers: {
        "access-token": input.accessToken,
        "store-id": input.storeId,
        "accept-language": "en",
        role: "Manager",
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Zid API request failed during sync.",
        "ZID_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as { results?: ZidProductApiRow[]; next?: string | null }
    const items = Array.isArray(body.results) ? body.results : []
    results.push(...items)

    if (items.length === 0 || !body.next) {
      break
    }

    page += 1
  }

  return results
}

// Orders and Customers share the Merchant API's auth (Authorization + X-Manager-Token) and
// the same page/per_page pagination shape, differing only in the response's list key ("orders"
// vs "customers") and count field name. X-Manager-Token is always the raw access_token per
// docs.zid.sa/authorization; the Authorization header is resolved by
// ZidOAuthService.resolveAccessToken (Bearer-prefixed, preferring Zid's own distinct
// `authorization` token-response field over access_token when present -- confirmed on stage
// that using access_token alone here 401s even though it works fine for X-Manager-Token).
async function fetchAllMerchantListPages<T>(input: {
  apiBaseUrl: string
  path: string
  listKey: "orders" | "customers"
  pageSize: number
  accessToken: string
  authorizationHeader: string
}): Promise<T[]> {
  const results: T[] = []
  let page = 1

  while (page <= MAX_PAGES_PER_ENTITY) {
    const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}${input.path}`)
    url.searchParams.set("page", String(page))
    url.searchParams.set("per_page", String(input.pageSize))

    const response = await fetch(url.toString(), {
      headers: {
        authorization: input.authorizationHeader,
        "x-manager-token": input.accessToken,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "")
      console.error("zid_sync.merchant_list_request_failed", {
        path: input.path,
        status: response.status,
        statusText: response.statusText,
        body: bodyText.slice(0, 500),
      })
      throw new IntegrationProviderError(
        "Zid API request failed during sync.",
        "ZID_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Record<string, unknown>
    const items = Array.isArray(body[input.listKey]) ? (body[input.listKey] as T[]) : []
    results.push(...items)

    if (items.length < input.pageSize) {
      break
    }

    page += 1
  }

  return results
}

export class ZidSyncService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: ZidOAuthRepository,
    private readonly syncRepository: ZidSyncRepository,
    private readonly oauthService: ZidOAuthService,
    config?: { apiBaseUrl?: string }
  ) {
    this.apiBaseUrl = config?.apiBaseUrl ?? process.env.ZID_API_BASE_URL ?? DEFAULT_ZID_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Zid connection not found.",
        "ZID_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Zid connection not found.",
        "ZID_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Zid connection is not connected.",
        "ZID_CONNECTION_NOT_READY",
        false,
        409
      )
    }
    return connection
  }

  private async requireAccessibleStore(connectionId: string, customerId: string) {
    const store = await this.oauthRepository.findAccessibleCustomerAccount(connectionId, customerId)
    if (!store) {
      throw new IntegrationProviderError(
        "Zid store is not accessible for this connection.",
        "ZID_INVALID_ACCOUNT",
        false,
        400
      )
    }
    return store
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    assertActorCanManageIntegrations(actor)

    const connection = await this.findOwnedConnectedConnection(actor, input.connectionId)
    await this.requireAccessibleStore(connection.id, input.customerId)

    const syncRun = await this.syncRepository.createOrLoadSyncRun({
      connectionId: connection.id,
      organizationId: connection.organizationId,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      customerId: input.customerId,
      startDate: input.startDate,
      endDate: input.endDate,
      idempotencyKey: input.idempotencyKey,
      actorUserId: actor.userId,
    })

    // Idempotent replay: the same idempotencyKey for an already-completed run returns the
    // cached result without re-fetching from Zid, matching every other connector's sync()
    // semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const { accessToken, authorizationHeader } = await this.oauthService.resolveAccessToken(
        connection.id
      )

      const [products, orders, customers] = await Promise.all([
        fetchAllProducts({
          apiBaseUrl: this.apiBaseUrl,
          storeId: input.customerId,
          accessToken,
        }),
        fetchAllMerchantListPages<ZidOrderApiRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/managers/store/orders",
          listKey: "orders",
          pageSize: ORDERS_PAGE_SIZE,
          accessToken,
          authorizationHeader,
        }),
        fetchAllMerchantListPages<ZidCustomerApiRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/managers/store/customers",
          listKey: "customers",
          pageSize: CUSTOMERS_PAGE_SIZE,
          accessToken,
          authorizationHeader,
        }),
      ])

      const records: ZidSyncRecordInput[] = [
        ...products.map((product) => ({
          entityType: "products" as const,
          entityId: String(product.id),
          recordDate: toRecordDate([product.updated_at, product.created_at]),
          payload: product as Record<string, unknown>,
        })),
        ...orders.map((order) => ({
          entityType: "orders" as const,
          entityId: String(order.id),
          recordDate: toRecordDate([order.updated_at, order.created_at]),
          payload: order as Record<string, unknown>,
        })),
        ...customers.map((customer) => ({
          entityType: "customers" as const,
          entityId: String(customer.id),
          recordDate: toRecordDate([customer.updated_at, customer.created_at]),
          payload: customer as Record<string, unknown>,
        })),
      ]

      const totalWritten = await this.syncRepository.upsertRecords({
        connectionId: connection.id,
        customerId: input.customerId,
        records,
      })

      const metrics = {
        products: products.length,
        orders: orders.length,
        customers: customers.length,
        totalRecords: totalWritten,
      }

      await this.syncRepository.markSyncRunCompleted(syncRun.id, actor.userId, metrics)

      const completed = await this.syncRepository.findSyncRunById(syncRun.id)
      if (!completed) {
        throw new IntegrationProviderError(
          "Sync run not found after completion.",
          "ZID_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode = error instanceof IntegrationProviderError ? error.code : "ZID_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Zid sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords (ownership + status
    // checks only), see integrations/zid/provider.ts.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleStore(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
