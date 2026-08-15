import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { GoogleAnalyticsOAuthController } from "../../google-analytics-oauth/controller"
import { GoogleAnalyticsOAuthRepository } from "../../google-analytics-oauth/repository"
import { GoogleAnalyticsOAuthService } from "../../google-analytics-oauth/service"
import { GoogleAnalyticsSyncRepository } from "../../google-analytics-oauth/sync-repository"
import { GoogleAnalyticsSyncService } from "../../google-analytics-oauth/sync-service"
import type { GoogleAnalyticsOAuthConnectionView } from "../../google-analytics-oauth/types"
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

export class GoogleAnalyticsIntegrationProvider {
  readonly providerId = "google-analytics"
  readonly displayName = "Google Analytics"

  private readonly repository?: GoogleAnalyticsOAuthRepository
  private readonly service?: GoogleAnalyticsOAuthService
  private readonly controller?: GoogleAnalyticsOAuthController
  private readonly syncService?: GoogleAnalyticsSyncService

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new GoogleAnalyticsOAuthRepository(database)
      this.service = new GoogleAnalyticsOAuthService(this.repository)
      this.controller = new GoogleAnalyticsOAuthController(this.service)
      this.syncService = new GoogleAnalyticsSyncService(
        this.repository,
        new GoogleAnalyticsSyncRepository(database),
        this.service
      )
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "Google Analytics OAuth requires database-backed identity runtime.",
        "GOOGLE_ANALYTICS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "Google Analytics OAuth repository unavailable.",
        "GOOGLE_ANALYTICS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "Google Analytics OAuth service unavailable.",
        "GOOGLE_ANALYTICS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private requireSyncService() {
    if (!this.syncService) {
      throw new IntegrationProviderError(
        "Google Analytics sync service unavailable.",
        "GOOGLE_ANALYTICS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.syncService
  }

  private assertConnectionOwnership(
    connection: GoogleAnalyticsOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is GoogleAnalyticsOAuthConnectionView {
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Google Analytics connection not found.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Google Analytics connection not found.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_FOUND",
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
        "Google Analytics connection is not connected.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_READY",
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
        "Google Analytics connection is not connected.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_READY",
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
        "Google Analytics connection is not connected.",
        "GOOGLE_ANALYTICS_CONNECTION_NOT_READY",
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
        "Google Analytics property is not accessible for this connection.",
        "GOOGLE_ANALYTICS_INVALID_ACCOUNT",
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
