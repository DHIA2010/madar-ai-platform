import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { SnapchatOAuthController } from "../../snapchat-oauth/controller"
import { SnapchatOAuthRepository } from "../../snapchat-oauth/repository"
import { SnapchatOAuthService } from "../../snapchat-oauth/service"
import type { AuthenticatedActor } from "../../application/dto/identity-dtos"

import { IntegrationProviderError } from "../provider-error"
import type {
  IntegrationProviderAccountsQuery,
  IntegrationProviderOAuthControllerResult,
  IntegrationProviderOAuthStartInput,
  IntegrationProviderRecordQuery,
  IntegrationProviderSyncInput,
} from "../provider-contracts"

interface SnapchatSyncResult {
  id: string
  connectionId: string
  provider: "snapchat-ads"
  status: "completed"
  startedAt: string
  completedAt: string
  metrics: Record<string, number>
  mode: "initial"
}

interface SnapchatRecordItem {
  id: string
  entityType: string
  customerId: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
  updatedAt: string
}

export class SnapchatAdsIntegrationProvider {
  readonly providerId = "snapchat-ads"
  readonly displayName = "Snapchat Ads"

  private readonly repository?: SnapchatOAuthRepository
  private readonly service?: SnapchatOAuthService
  private readonly controller?: SnapchatOAuthController

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new SnapchatOAuthRepository(database)
      this.service = new SnapchatOAuthService(this.repository)
      this.controller = new SnapchatOAuthController(this.service)
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

  async oauthStart(actor: AuthenticatedActor, input: IntegrationProviderOAuthStartInput) {
    return this.requireController().start(actor, input)
  }

  async oauthCallback(request: IncomingMessage, query: URLSearchParams): Promise<IntegrationProviderOAuthControllerResult> {
    return this.requireController().callback(request, query)
  }

  async getActiveConnection(actor: AuthenticatedActor) {
    return this.requireController().getActiveConnection(actor)
  }

  async sync(actor: AuthenticatedActor, input: IntegrationProviderSyncInput): Promise<SnapchatSyncResult> {
    const repository = this.requireRepository()
    const service = this.requireService()

    const connection = await repository.findConnectionById(input.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat Ads connection not found.",
        "SNAPCHAT_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Snapchat Ads connection is not connected.",
        "SNAPCHAT_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const selected = await repository.findAccessibleCustomerAccount(input.connectionId, input.customerId)
    if (!selected) {
      throw new IntegrationProviderError(
        "Snapchat Ads account is not accessible for this connection.",
        "SNAPCHAT_ADS_INVALID_ACCOUNT",
        false,
        400
      )
    }

    await service.resolveAccessToken(input.connectionId)

    return {
      id: input.idempotencyKey,
      connectionId: input.connectionId,
      provider: "snapchat-ads",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      mode: "initial",
      metrics: {
        campaigns: 0,
        ads: 0,
        totalRecords: 0,
      },
    }
  }

  async listAccounts(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery) {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat Ads connection not found.",
        "SNAPCHAT_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

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

  async listRecords(actor: AuthenticatedActor, query: IntegrationProviderRecordQuery): Promise<SnapchatRecordItem[]> {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Snapchat Ads connection not found.",
        "SNAPCHAT_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Snapchat Ads connection is not connected.",
        "SNAPCHAT_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const account = await repository.findAccessibleCustomerAccount(query.connectionId, query.customerId)
    if (!account) {
      throw new IntegrationProviderError(
        "Snapchat Ads account is not accessible for this connection.",
        "SNAPCHAT_ADS_INVALID_ACCOUNT",
        false,
        400
      )
    }

    const recordDate = query.startDate ?? new Date().toISOString().slice(0, 10)

    return [
      {
        id: `${query.customerId}:snapshot:0`,
        entityType: query.entityType ?? "initial_sync_marker",
        customerId: query.customerId,
        entityId: account.customerId,
        recordDate,
        payload: {
          stage: "initial_sync_skeleton",
          status: "completed",
        },
        updatedAt: new Date().toISOString(),
      },
    ]
  }
}
