import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { SallaOAuthController } from "../../salla-oauth/controller"
import { SallaOAuthRepository } from "../../salla-oauth/repository"
import { SallaOAuthService } from "../../salla-oauth/service"
import { SallaSyncRepository } from "../../salla-oauth/sync-repository"
import { SallaSyncService } from "../../salla-oauth/sync-service"
import type { SallaOAuthConnectionView } from "../../salla-oauth/types"
import type { AuthenticatedActor } from "../../application/dto/identity-dtos"

import { IntegrationProviderError } from "../provider-error"
import type {
  IntegrationProviderAccountSelectionInput,
  IntegrationProviderAccountsQuery,
  IntegrationProviderOAuthControllerResult,
  IntegrationProviderOAuthStartInput,
  IntegrationProviderOrderDetail,
  IntegrationProviderOrderDetailQuery,
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../provider-contracts"

const DEFAULT_SALLA_API_BASE_URL = "https://api.salla.dev/admin/v2"

// Confirmed against Salla's real "Order Details" OpenAPI schema (docs.salla.dev) -- distinct
// from the lighter /orders list shape our sync already stores, which has no per-item price,
// SKU, or tax/discount breakdown. This is fetched live and on-demand (only when a user opens
// "View Products"), not synced in bulk, since it's a separate API call per order.
interface SallaOrderDetailApiPrice {
  amount?: number
  currency?: string
}

interface SallaOrderDetailApiItem {
  id?: number | string
  name?: string
  sku?: string | null
  quantity?: number
  product_thumbnail?: string | null
  amounts?: {
    price_without_tax?: SallaOrderDetailApiPrice
    total_discount?: SallaOrderDetailApiPrice
    tax?: { percent?: string; amount?: SallaOrderDetailApiPrice }
    total?: SallaOrderDetailApiPrice
  }
  product?: {
    sku?: string | null
    thumbnail?: string | null
  }
}

interface SallaOrderDetailApiResponse {
  amounts?: {
    sub_total?: SallaOrderDetailApiPrice
    shipping_cost?: SallaOrderDetailApiPrice
    tax?: { amount?: SallaOrderDetailApiPrice }
    total?: SallaOrderDetailApiPrice
  }
  items?: SallaOrderDetailApiItem[]
}

function mapSallaOrderDetail(data: SallaOrderDetailApiResponse): IntegrationProviderOrderDetail {
  const currency = data.amounts?.total?.currency ?? "SAR"
  const items = (data.items ?? []).map((item) => ({
    id: String(item.id ?? ""),
    name: item.name ?? "",
    sku: item.sku ?? item.product?.sku ?? null,
    quantity: Number(item.quantity) || 0,
    unitPrice: item.amounts?.price_without_tax?.amount ?? null,
    discount: item.amounts?.total_discount?.amount ?? 0,
    tax: item.amounts?.tax?.amount?.amount ?? 0,
    total: item.amounts?.total?.amount ?? 0,
    thumbnail: item.product?.thumbnail ?? item.product_thumbnail ?? null,
  }))

  return {
    currency,
    subTotal: data.amounts?.sub_total?.amount ?? 0,
    shippingCost: data.amounts?.shipping_cost?.amount ?? 0,
    taxTotal: data.amounts?.tax?.amount?.amount ?? 0,
    // Summed from each item's own total_discount (a well-typed {amount,currency} value) rather
    // than the order-level "discounts" array, whose "discount" field is a loosely-specified
    // string (promo code metadata, not a clean numeric total) per Salla's own schema.
    discountTotal: items.reduce((sum, item) => sum + item.discount, 0),
    total: data.amounts?.total?.amount ?? 0,
    items,
  }
}

export class SallaIntegrationProvider {
  readonly providerId = "salla"
  readonly displayName = "Salla"

  private readonly repository?: SallaOAuthRepository
  private readonly service?: SallaOAuthService
  private readonly controller?: SallaOAuthController
  private readonly syncService?: SallaSyncService
  private readonly apiBaseUrl: string

  constructor(database?: PostgresDatabase) {
    this.apiBaseUrl = process.env.SALLA_API_BASE_URL ?? DEFAULT_SALLA_API_BASE_URL
    if (database) {
      this.repository = new SallaOAuthRepository(database)
      this.service = new SallaOAuthService(this.repository)
      this.controller = new SallaOAuthController(this.service)
      this.syncService = new SallaSyncService(
        this.repository,
        new SallaSyncRepository(database),
        this.service
      )
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "Salla OAuth requires database-backed identity runtime.",
        "SALLA_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "Salla OAuth repository unavailable.",
        "SALLA_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "Salla OAuth service unavailable.",
        "SALLA_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private requireSyncService() {
    if (!this.syncService) {
      throw new IntegrationProviderError(
        "Salla sync service unavailable.",
        "SALLA_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.syncService
  }

  private assertConnectionOwnership(
    connection: SallaOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is SallaOAuthConnectionView {
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
  }

  async oauthStart(actor: AuthenticatedActor, input: IntegrationProviderOAuthStartInput) {
    return this.requireController().start(actor, input)
  }

  async oauthCallback(
    request: IncomingMessage,
    query: URLSearchParams
  ): Promise<IntegrationProviderOAuthControllerResult> {
    return this.requireController().callback(request, query)
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    return this.requireController().getActiveConnection(actor)
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput) {
    return this.requireSyncService().sync(actor, input)
  }

  async listAccounts(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery) {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Salla connection is not connected.",
        "SALLA_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const accounts = await repository.listAccessibleCustomerAccounts(connection.id)
    return accounts.map((account) => ({
      customerId: account.customerId,
      displayName: account.displayName ?? account.customerId,
      isSelected: account.isSelected,
    }))
  }

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery) {
    return this.requireSyncService().listRecords(actor, query)
  }

  async getSelectedAccount(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery) {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Salla connection is not connected.",
        "SALLA_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const accounts = await repository.listAccessibleCustomerAccounts(connection.id)
    const selected = accounts.find((account) => account.isSelected) ?? null

    return selected
      ? {
          customerId: selected.customerId,
          displayName: selected.displayName ?? selected.customerId,
          isSelected: true,
        }
      : null
  }

  async selectAccount(actor: AuthenticatedActor, input: IntegrationProviderAccountSelectionInput) {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(input.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Salla connection is not connected.",
        "SALLA_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const account = await repository.findAccessibleCustomerAccount(
      input.connectionId,
      input.customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "Salla store is not accessible for this connection.",
        "SALLA_INVALID_ACCOUNT",
        false,
        400
      )
    }

    await repository.selectCustomerAccount(input.connectionId, input.customerId)

    return {
      connectionId: connection.id,
      status: "connected" as const,
      selectedCustomer: {
        customerId: account.customerId,
        displayName: account.displayName ?? account.customerId,
      },
    }
  }

  async pause(actor: AuthenticatedActor, input: { connectionId: string }) {
    return this.requireController().pause(actor, input.connectionId)
  }

  async pauseAllForWorkspace(actor: AuthenticatedActor, workspaceId: string) {
    return this.requireService().pauseConnectionsForWorkspace(actor, workspaceId)
  }

  async resumeAllForWorkspace(actor: AuthenticatedActor, workspaceId: string) {
    return this.requireService().resumeConnectionsForWorkspace(actor, workspaceId)
  }

  async resume(actor: AuthenticatedActor, input: { connectionId: string }) {
    return this.requireController().resume(actor, input.connectionId)
  }

  async disconnect(actor: AuthenticatedActor, input: { connectionId: string; reason?: string }) {
    return this.requireController().disconnect(actor, input)
  }

  async reconnect(actor: AuthenticatedActor, input: { connectionId: string }) {
    return this.requireController().reconnect(actor, input.connectionId)
  }

  async listEvents(actor: AuthenticatedActor, query: { connectionId: string; limit: number }) {
    return this.requireController().listRecentEvents(actor, query)
  }

  async getOrderDetail(
    actor: AuthenticatedActor,
    input: IntegrationProviderOrderDetailQuery
  ): Promise<IntegrationProviderOrderDetail> {
    const repository = this.requireRepository()
    const service = this.requireService()

    const connection = await repository.findConnectionById(input.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Salla connection is not connected.",
        "SALLA_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const accessToken = await service.resolveAccessToken(connection.id)

    const response = await fetch(
      `${this.apiBaseUrl.replace(/\/$/, "")}/orders/${encodeURIComponent(input.orderId)}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      }
    )

    if (response.status === 404) {
      throw new IntegrationProviderError("Order not found.", "SALLA_ORDER_NOT_FOUND", false, 404)
    }
    if (!response.ok) {
      throw new IntegrationProviderError(
        "Salla API request failed while loading order details.",
        "SALLA_ORDER_DETAIL_REQUEST_FAILED",
        true,
        502
      )
    }

    const body = (await response.json()) as { data?: SallaOrderDetailApiResponse }
    // Temporary: confirms whether a real order's detail response genuinely omits per-item
    // amounts (sparse source data, e.g. an unconfigured demo-store order) versus this mapper
    // reading the wrong field path. Remove once verified against a real non-empty response.
    console.info(
      JSON.stringify({
        level: "info",
        service: "identity-platform",
        event: "salla.order_detail_raw",
        orderId: input.orderId,
        hasData: Boolean(body.data),
        itemsIsArray: Array.isArray(body.data?.items),
        itemCount: body.data?.items?.length ?? null,
        hasAmounts: Boolean(body.data?.amounts),
        firstItemKeys: body.data?.items?.[0] ? Object.keys(body.data.items[0]) : null,
      })
    )
    return mapSallaOrderDetail(body.data ?? {})
  }
}
