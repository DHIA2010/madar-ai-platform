import { IdentityError } from "../application/errors/IdentityError"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import { SnapchatOAuthRepository } from "./repository"

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IdentityError("SNAPCHAT_OAUTH_FORBIDDEN", 403, "security", "Permission denied.")
  }
}

export class SnapchatOAuthConnectionDeletionService {
  constructor(private readonly repository: SnapchatOAuthRepository) {}

  async deleteConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    await this.repository.withTransaction(async () => {
      const ownership = await this.repository.findConnectionOwnershipById(connectionId)
      if (!ownership) {
        throw new IdentityError(
          "SNAPCHAT_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (ownership.organizationId !== actor.organizationId) {
        throw new IdentityError(
          "SNAPCHAT_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (actor.workspaceId && ownership.workspaceId !== actor.workspaceId) {
        throw new IdentityError(
          "SNAPCHAT_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      const currentConnection = await this.repository.findConnectionById(connectionId)

      const occurredAt = new Date().toISOString()
      const payload = {
        previousStatus: currentConnection?.status ?? null,
        nextStatus: "deleted",
        message: "Connection deleted.",
      }

      await this.repository.saveEvent(connectionId, "snapchat.oauth.connection.deleted", payload)
      await this.repository.appendAuditLog({
        actorUserId: actor.userId,
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId,
        action: "integration.snapchat_oauth.deleted",
        entityId: connectionId,
        metadata: payload,
        createdAt: occurredAt,
      })
      await this.repository.appendOutboxEvent({
        eventType: "snapchat.oauth.connection.deleted",
        aggregateId: connectionId,
        occurredAt,
        metadata: {
          actorUserId: actor.userId,
          organizationId: ownership.organizationId,
          workspaceId: ownership.workspaceId,
          projectId: null,
        },
        payload,
      })

      await this.repository.deleteConnectionCascade(connectionId)
    })
  }
}
