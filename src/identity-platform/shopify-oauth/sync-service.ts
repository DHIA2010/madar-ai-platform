import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { ShopifyOAuthRepository } from "./repository"
import { buildShopUrls, type ShopifyOAuthService } from "./service"
import { ShopifySyncRepository, type ShopifySyncRecordInput } from "./sync-repository"

const DEFAULT_API_VERSION = "2024-10"
// Shopify stores can have thousands of products/orders -- this bounds a single sync run so a
// misbehaving API (e.g. a Link header that never stops pointing to "next") can't loop forever.
const MAX_PAGES_PER_ENTITY = 200
const PAGE_SIZE = 250

interface ShopifyProductApiRow {
  id: number | string
  title?: string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface ShopifyOrderApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface ShopifyCustomerApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "SHOPIFY_SYNC_FORBIDDEN", false, 403)
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

// Shopify's REST Admin API rejects any request that combines page_info with other query
// params, and rejects the old page= parameter outright -- pagination is purely a matter of
// following the Link response header's rel="next" URL verbatim until it's absent.
function extractNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null
  }
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="?next"?/)
    if (match) {
      return match[1]
    }
  }
  return null
}

async function fetchAllPagesByLinkHeader<T>(input: {
  initialUrl: string
  accessToken: string
  resourceKey: string
}): Promise<T[]> {
  const results: T[] = []
  let url: string | null = input.initialUrl
  let pages = 0

  while (url && pages < MAX_PAGES_PER_ENTITY) {
    const response: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": input.accessToken,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Shopify API request failed during sync.",
        "SHOPIFY_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as Record<string, unknown>
    const items = Array.isArray(body[input.resourceKey]) ? (body[input.resourceKey] as T[]) : []
    results.push(...items)

    url = extractNextLink(response.headers.get("link"))
    pages += 1
  }

  return results
}

export class ShopifySyncService {
  private readonly apiVersion: string

  constructor(
    private readonly oauthRepository: ShopifyOAuthRepository,
    private readonly syncRepository: ShopifySyncRepository,
    private readonly oauthService: ShopifyOAuthService,
    config?: { apiVersion?: string }
  ) {
    this.apiVersion = config?.apiVersion ?? process.env.SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Shopify connection not found.",
        "SHOPIFY_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Shopify connection not found.",
        "SHOPIFY_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Shopify connection is not connected.",
        "SHOPIFY_CONNECTION_NOT_READY",
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
        "Shopify store is not accessible for this connection.",
        "SHOPIFY_INVALID_ACCOUNT",
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
    // cached result without re-fetching from Shopify, matching Salla's sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const shopDomain = await this.oauthRepository.findConnectionShopDomain(connection.id)
      if (!shopDomain) {
        throw new IntegrationProviderError(
          "Shopify shop domain missing for connection.",
          "SHOPIFY_SYNC_FAILED",
          false,
          500
        )
      }
      const { apiBaseUrl } = buildShopUrls(shopDomain, this.apiVersion)
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)

      const [products, orders, customers] = await Promise.all([
        fetchAllPagesByLinkHeader<ShopifyProductApiRow>({
          initialUrl: `${apiBaseUrl}/products.json?limit=${PAGE_SIZE}`,
          accessToken,
          resourceKey: "products",
        }),
        fetchAllPagesByLinkHeader<ShopifyOrderApiRow>({
          initialUrl: `${apiBaseUrl}/orders.json?limit=${PAGE_SIZE}&status=any`,
          accessToken,
          resourceKey: "orders",
        }),
        fetchAllPagesByLinkHeader<ShopifyCustomerApiRow>({
          initialUrl: `${apiBaseUrl}/customers.json?limit=${PAGE_SIZE}`,
          accessToken,
          resourceKey: "customers",
        }),
      ])

      const records: ShopifySyncRecordInput[] = [
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
          "SHOPIFY_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode =
        error instanceof IntegrationProviderError ? error.code : "SHOPIFY_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Shopify sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleStore(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
