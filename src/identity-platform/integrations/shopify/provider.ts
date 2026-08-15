import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { ShopifyOAuthController } from "../../shopify-oauth/controller"
import { ShopifyOAuthRepository } from "../../shopify-oauth/repository"
import { ShopifyOAuthService } from "../../shopify-oauth/service"
import { ShopifySyncRepository } from "../../shopify-oauth/sync-repository"
import { ShopifySyncService } from "../../shopify-oauth/sync-service"
import type { ShopifyOAuthConnectionView } from "../../shopify-oauth/types"
import type { AuthenticatedActor } from "../../application/dto/identity-dtos"

import { IntegrationProviderError } from "../provider-error"
import type {
  IntegrationProviderAccountSelectionInput,
  IntegrationProviderAccountsQuery,
  IntegrationProviderOAuthControllerResult,
  IntegrationProviderOAuthStartInput,
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../provider-contracts"

export class ShopifyIntegrationProvider {
  readonly providerId = "shopify"
  readonly displayName = "Shopify"

  private readonly repository?: ShopifyOAuthRepository
  private readonly service?: ShopifyOAuthService
  private readonly controller?: ShopifyOAuthController
  private readonly syncService?: ShopifySyncService

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new ShopifyOAuthRepository(database)
      this.service = new ShopifyOAuthService(this.repository)
      this.controller = new ShopifyOAuthController(this.service)
      this.syncService = new ShopifySyncService(
        this.repository,
        new ShopifySyncRepository(database),
        this.service
      )
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "Shopify OAuth requires database-backed identity runtime.",
        "SHOPIFY_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "Shopify OAuth repository unavailable.",
        "SHOPIFY_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "Shopify OAuth service unavailable.",
        "SHOPIFY_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private requireSyncService() {
    if (!this.syncService) {
      throw new IntegrationProviderError(
        "Shopify sync service unavailable.",
        "SHOPIFY_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.syncService
  }

  private assertConnectionOwnership(
    connection: ShopifyOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is ShopifyOAuthConnectionView {
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
        "Shopify connection is not connected.",
        "SHOPIFY_CONNECTION_NOT_READY",
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
        "Shopify connection is not connected.",
        "SHOPIFY_CONNECTION_NOT_READY",
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
        "Shopify connection is not connected.",
        "SHOPIFY_CONNECTION_NOT_READY",
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
        "Shopify store is not accessible for this connection.",
        "SHOPIFY_INVALID_ACCOUNT",
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
}
