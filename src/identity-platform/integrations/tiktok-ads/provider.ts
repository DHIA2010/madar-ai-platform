import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { TikTokAdsOAuthController } from "../../tiktok-ads-oauth/controller"
import { TikTokAdsOAuthRepository } from "../../tiktok-ads-oauth/repository"
import { TikTokAdsOAuthService } from "../../tiktok-ads-oauth/service"
import { TikTokAdsSyncRepository } from "../../tiktok-ads-oauth/sync-repository"
import { TikTokAdsSyncService } from "../../tiktok-ads-oauth/sync-service"
import type { TikTokAdsOAuthConnectionView } from "../../tiktok-ads-oauth/types"
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

export class TikTokAdsIntegrationProvider {
  readonly providerId = "tiktok-ads"
  readonly displayName = "TikTok Ads"

  private readonly repository?: TikTokAdsOAuthRepository
  private readonly service?: TikTokAdsOAuthService
  private readonly controller?: TikTokAdsOAuthController
  private readonly syncService?: TikTokAdsSyncService

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new TikTokAdsOAuthRepository(database)
      this.service = new TikTokAdsOAuthService(this.repository)
      this.controller = new TikTokAdsOAuthController(this.service)
      this.syncService = new TikTokAdsSyncService(
        this.repository,
        new TikTokAdsSyncRepository(database),
        this.service
      )
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "TikTok Ads OAuth requires database-backed identity runtime.",
        "TIKTOK_ADS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "TikTok Ads OAuth repository unavailable.",
        "TIKTOK_ADS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "TikTok Ads OAuth service unavailable.",
        "TIKTOK_ADS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private requireSyncService() {
    if (!this.syncService) {
      throw new IntegrationProviderError(
        "TikTok Ads sync service unavailable.",
        "TIKTOK_ADS_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.syncService
  }

  private assertConnectionOwnership(
    connection: TikTokAdsOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is TikTokAdsOAuthConnectionView {
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "TikTok Ads connection not found.",
        "TIKTOK_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "TikTok Ads connection not found.",
        "TIKTOK_ADS_CONNECTION_NOT_FOUND",
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
        "TikTok Ads connection is not connected.",
        "TIKTOK_ADS_CONNECTION_NOT_READY",
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
        "TikTok Ads connection is not connected.",
        "TIKTOK_ADS_CONNECTION_NOT_READY",
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
        "TikTok Ads connection is not connected.",
        "TIKTOK_ADS_CONNECTION_NOT_READY",
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
        "TikTok Ads advertiser account is not accessible for this connection.",
        "TIKTOK_ADS_INVALID_ACCOUNT",
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
