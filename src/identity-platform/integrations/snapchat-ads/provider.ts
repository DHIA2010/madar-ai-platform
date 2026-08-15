import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { SnapchatOAuthController } from "../../snapchat-oauth/controller"
import { SnapchatOAuthRepository } from "../../snapchat-oauth/repository"
import { SnapchatOAuthService } from "../../snapchat-oauth/service"
import { SnapchatSyncRepository } from "../../snapchat-oauth/sync-repository"
import { SnapchatSyncService } from "../../snapchat-oauth/sync-service"
import type { SnapchatOAuthConnectionView } from "../../snapchat-oauth/types"
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

export class SnapchatAdsIntegrationProvider {
  readonly providerId = "snapchat-ads"
  readonly displayName = "Snapchat Ads"

  private readonly repository?: SnapchatOAuthRepository
  private readonly service?: SnapchatOAuthService
  private readonly controller?: SnapchatOAuthController
  private readonly syncService?: SnapchatSyncService

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new SnapchatOAuthRepository(database)
      this.service = new SnapchatOAuthService(this.repository)
      this.controller = new SnapchatOAuthController(this.service)
      this.syncService = new SnapchatSyncService(
        this.repository,
        new SnapchatSyncRepository(database),
        this.service
      )
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "Snapchat OAuth requires database-backed identity runtime.",
        "SNAPCHAT_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "Snapchat OAuth repository unavailable.",
        "SNAPCHAT_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "Snapchat OAuth service unavailable.",
        "SNAPCHAT_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private requireSyncService() {
    if (!this.syncService) {
      throw new IntegrationProviderError(
        "Snapchat sync service unavailable.",
        "SNAPCHAT_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.syncService
  }

  private assertConnectionOwnership(
    connection: SnapchatOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is SnapchatOAuthConnectionView {
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat Ads connection not found.",
        "SNAPCHAT_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Snapchat Ads connection not found.",
        "SNAPCHAT_ADS_CONNECTION_NOT_FOUND",
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
        "Snapchat Ads connection is not connected.",
        "SNAPCHAT_ADS_CONNECTION_NOT_READY",
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
        "Snapchat Ads connection is not connected.",
        "SNAPCHAT_ADS_CONNECTION_NOT_READY",
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
        "Snapchat Ads connection is not connected.",
        "SNAPCHAT_ADS_CONNECTION_NOT_READY",
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
        "Snapchat Ads account is not accessible for this connection.",
        "SNAPCHAT_ADS_INVALID_ACCOUNT",
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
