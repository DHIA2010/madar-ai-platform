import type { AuthenticatedActor } from "../application/dto/identity-dtos"
import type {
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../integrations/provider-contracts"
import { IntegrationProviderError } from "../integrations/provider-error"

import type { SallaOAuthRepository } from "./repository"
import type { SallaOAuthService } from "./service"
import { SallaSyncRepository, type SallaSyncRecordInput } from "./sync-repository"

const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"
// Salla stores can have thousands of products/orders -- this bounds a single sync run so a
// misbehaving API (e.g. pagination metadata that never signals "done") can't loop forever.
const MAX_PAGES_PER_ENTITY = 200
const REQUEST_PAGE_SIZE_HEURISTIC = 15

interface SallaListEnvelope {
  data?: unknown[]
  pagination?: { currentPage?: number; totalPages?: number }
}

interface SallaProductApiRow {
  id: number | string
  name?: string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface SallaOrderApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  date?: { date?: string }
  [key: string]: unknown
}

interface SallaCustomerApiRow {
  id: number | string
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IntegrationProviderError("Forbidden.", "SALLA_SYNC_FORBIDDEN", false, 403)
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

// Paginates by incrementing ?page= until the API signals it's done -- via pagination.totalPages
// when present, or (defensively, since the exact envelope shape is a documented assumption
// rather than something verified against a live store) by falling back to "the page came back
// shorter than a typical full page" once no pagination metadata is present at all.
async function fetchAllPages<T>(input: {
  apiBaseUrl: string
  path: string
  accessToken: string
}): Promise<T[]> {
  const results: T[] = []
  let page = 1

  while (page <= MAX_PAGES_PER_ENTITY) {
    const url = new URL(`${input.apiBaseUrl.replace(/\/$/, "")}${input.path}`)
    url.searchParams.set("page", String(page))

    const response = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
    })

    if (!response.ok) {
      throw new IntegrationProviderError(
        "Salla API request failed during sync.",
        "SALLA_SYNC_API_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as SallaListEnvelope
    const items = Array.isArray(body.data) ? (body.data as T[]) : []
    results.push(...items)

    if (items.length === 0) {
      break
    }

    const totalPages = body.pagination?.totalPages
    if (typeof totalPages === "number") {
      if (page >= totalPages) {
        break
      }
    } else if (items.length < REQUEST_PAGE_SIZE_HEURISTIC) {
      break
    }

    page += 1
  }

  return results
}

export class SallaSyncService {
  private readonly apiBaseUrl: string

  constructor(
    private readonly oauthRepository: SallaOAuthRepository,
    private readonly syncRepository: SallaSyncRepository,
    private readonly oauthService: SallaOAuthService,
    config?: { apiBaseUrl?: string }
  ) {
    this.apiBaseUrl =
      config?.apiBaseUrl ?? process.env.SALLA_API_BASE_URL ?? DEFAULT_SALLA_API_BASE_URL
  }

  private async findOwnedConnectedConnection(actor: AuthenticatedActor, connectionId: string) {
    const connection = await this.oauthRepository.findConnectionById(connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Salla connection not found.",
        "SALLA_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Salla connection not found.",
        "SALLA_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }
    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Salla connection is not connected.",
        "SALLA_CONNECTION_NOT_READY",
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
        "Salla store is not accessible for this connection.",
        "SALLA_INVALID_ACCOUNT",
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
    // cached result without re-fetching from Salla, matching Google Ads' sync() semantics.
    if (syncRun.status === "completed") {
      return syncRun
    }

    await this.syncRepository.markSyncRunRunning(syncRun.id, actor.userId)

    try {
      const accessToken = await this.oauthService.resolveAccessToken(connection.id)

      const [products, orders, customers] = await Promise.all([
        fetchAllPages<SallaProductApiRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/products",
          accessToken,
        }),
        fetchAllPages<SallaOrderApiRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/orders",
          accessToken,
        }),
        fetchAllPages<SallaCustomerApiRow>({
          apiBaseUrl: this.apiBaseUrl,
          path: "/customers",
          accessToken,
        }),
      ])

      const records: SallaSyncRecordInput[] = [
        ...products.map((product) => ({
          entityType: "products" as const,
          entityId: String(product.id),
          recordDate: toRecordDate([product.updated_at, product.created_at]),
          payload: product as Record<string, unknown>,
        })),
        ...orders.map((order) => ({
          entityType: "orders" as const,
          entityId: String(order.id),
          recordDate: toRecordDate([order.date?.date, order.updated_at, order.created_at]),
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
          "SALLA_SYNC_FAILED",
          false,
          500
        )
      }
      return completed
    } catch (error) {
      const errorCode = error instanceof IntegrationProviderError ? error.code : "SALLA_SYNC_FAILED"
      const errorMessage = error instanceof Error ? error.message : "Salla sync failed."
      await this.syncRepository.markSyncRunFailed(syncRun.id, actor.userId, errorCode, errorMessage)
      throw error
    }
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    // Viewing synced records doesn't require the owner/admin role that mutating the
    // connection does -- matches every other connector's listRecords (ownership + status
    // checks only), see integrations/salla/provider.ts.
    const connection = await this.findOwnedConnectedConnection(actor, query.connectionId)
    await this.requireAccessibleStore(connection.id, query.customerId)

    return this.syncRepository.listRecords(query)
  }
}
