import type { IncomingMessage } from "node:http"

import type { PostgresDatabase } from "../../infrastructure/postgres/database"
import { SallaOAuthController } from "../../salla-oauth/controller"
import { SallaOAuthRepository } from "../../salla-oauth/repository"
import { SallaOAuthService } from "../../salla-oauth/service"
import type { SallaOAuthConnectionView } from "../../salla-oauth/types"
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

interface SallaSyncResult {
  id: string
  connectionId: string
  provider: "salla"
  status: "completed"
  startedAt: string
  completedAt: string
  metrics: Record<string, number>
  mode: "initial"
}

interface SallaRecordItem {
  id: string
  entityType: string
  customerId: string
  entityId: string
  recordDate: string
  payload: Record<string, unknown>
  updatedAt: string
}

export class SallaIntegrationProvider {
  readonly providerId = "salla"
  readonly displayName = "Salla"

  private readonly repository?: SallaOAuthRepository
  private readonly service?: SallaOAuthService
  private readonly controller?: SallaOAuthController

  constructor(database?: PostgresDatabase) {
    if (database) {
      this.repository = new SallaOAuthRepository(database)
      this.service = new SallaOAuthService(this.repository)
      this.controller = new SallaOAuthController(this.service)
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

  async sync(
    actor: AuthenticatedActor,
    input: IntegrationProviderSyncInput
  ): Promise<SallaSyncResult> {
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

    const selected = await repository.findAccessibleCustomerAccount(
      input.connectionId,
      input.customerId
    )
    if (!selected) {
      throw new IntegrationProviderError(
        "Salla store is not accessible for this connection.",
        "SALLA_INVALID_ACCOUNT",
        false,
        400
      )
    }

    await service.resolveAccessToken(input.connectionId)

    return {
      id: input.idempotencyKey,
      connectionId: input.connectionId,
      provider: "salla",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      mode: "initial",
      metrics: {
        products: 0,
        orders: 0,
        customers: 0,
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

  async listRecords(
    actor: AuthenticatedActor,
    query: IntegrationProviderRecordQuery
  ): Promise<SallaRecordItem[]> {
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

    const account = await repository.findAccessibleCustomerAccount(
      query.connectionId,
      query.customerId
    )
    if (!account) {
      throw new IntegrationProviderError(
        "Salla store is not accessible for this connection.",
        "SALLA_INVALID_ACCOUNT",
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
}
