import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { MetaOAuthController } from "../../meta-oauth/controller"
import { MetaOAuthRepository } from "../../meta-oauth/repository"
import { MetaOAuthService } from "../../meta-oauth/service"
import type { MetaOAuthConnectionView } from "../../meta-oauth/types"
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

interface MetaSyncResult {
  id: string
  connectionId: string
  provider: "meta-ads"
  status: "completed"
  startedAt: string
  completedAt: string
  metrics: Record<string, number>
  mode: "initial"
}

interface MetaRecordItem {
  id: string
  entityType: string
  customerId: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
  updatedAt: string
}

export class MetaAdsIntegrationProvider {
  readonly providerId = "meta-ads"
  readonly displayName = "Meta Ads"
  readonly providerFamily = "meta" as const

  private readonly repository?: MetaOAuthRepository
  private readonly service?: MetaOAuthService
  private readonly controller?: MetaOAuthController

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new MetaOAuthRepository(database)
      this.service = new MetaOAuthService(this.repository)
      this.controller = new MetaOAuthController(this.service)
    }
  }

  private requireController() {
    if (!this.controller) {
      throw new IntegrationProviderError(
        "Meta OAuth requires database-backed identity runtime.",
        "META_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.controller
  }

  private requireRepository() {
    if (!this.repository) {
      throw new IntegrationProviderError(
        "Meta OAuth repository unavailable.",
        "META_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.repository
  }

  private requireService() {
    if (!this.service) {
      throw new IntegrationProviderError(
        "Meta OAuth service unavailable.",
        "META_OAUTH_UNAVAILABLE",
        false,
        503
      )
    }

    return this.service
  }

  private assertConnectionOwnership(
    connection: MetaOAuthConnectionView | null,
    actor: AuthenticatedActor
  ): asserts connection is MetaOAuthConnectionView {
    if (!connection || connection.organizationId !== actor.organizationId) {
      throw new IntegrationProviderError(
        "Meta Ads connection not found.",
        "META_ADS_CONNECTION_NOT_FOUND",
        false,
        404
      )
    }

    if (actor.workspaceId && connection.workspaceId !== actor.workspaceId) {
      throw new IntegrationProviderError(
        "Meta Ads connection not found.",
        "META_ADS_CONNECTION_NOT_FOUND",
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

  async sync(
    actor: AuthenticatedActor,
    input: IntegrationProviderSyncInput
  ): Promise<MetaSyncResult> {
    const repository = this.requireRepository()
    const service = this.requireService()

    const connection = await repository.findConnectionById(input.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Meta Ads connection is not connected.",
        "META_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const selected = await repository.findAccessibleCustomerAccount(
      input.connectionId,
      input.customerId
    )
    if (!selected) {
      throw new IntegrationProviderError(
        "Meta Ads account is not accessible for this connection.",
        "META_ADS_INVALID_ACCOUNT",
        false,
        400
      )
    }

    await service.resolveAccessToken(input.connectionId)

    return {
      id: input.idempotencyKey,
      connectionId: input.connectionId,
      provider: "meta-ads",
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
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Meta Ads connection is not connected.",
        "META_ADS_CONNECTION_NOT_READY",
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

  async listRecords(
    actor: AuthenticatedActor,
    query: IntegrationProviderRecordQuery
  ): Promise<MetaRecordItem[]> {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Meta Ads connection is not connected.",
        "META_ADS_CONNECTION_NOT_READY",
        false,
        409
      )
    }

    const account = await repository.findAccessibleCustomerAccount(
      query.connectionId,
      query.customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "Meta Ads account is not accessible for this connection.",
        "META_ADS_INVALID_ACCOUNT",
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

  async getSelectedAccount(actor: AuthenticatedActor, query: IntegrationProviderAccountsQuery) {
    const repository = this.requireRepository()

    const connection = await repository.findConnectionById(query.connectionId)
    this.assertConnectionOwnership(connection, actor)

    if (connection.status !== "connected") {
      throw new IntegrationProviderError(
        "Meta Ads connection is not connected.",
        "META_ADS_CONNECTION_NOT_READY",
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
        "Meta Ads connection is not connected.",
        "META_ADS_CONNECTION_NOT_READY",
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
        "Meta Ads account is not accessible for this connection.",
        "META_ADS_INVALID_ACCOUNT",
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
