import { IdentityError } from "../application/errors/IdentityError"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import { TikTokAdsOAuthRepository } from "./repository"

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IdentityError("TIKTOK_ADS_OAUTH_FORBIDDEN", 403, "security", "Permission denied.")
  }
}

export class TikTokAdsOAuthConnectionDeletionService {
  constructor(private readonly repository: TikTokAdsOAuthRepository) {}

  async deleteConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    await this.repository.withTransaction(async () => {
      const ownership = await this.repository.findConnectionOwnershipById(connectionId)
      if (!ownership) {
        throw new IdentityError(
          "TIKTOK_ADS_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (ownership.organizationId !== actor.organizationId) {
        throw new IdentityError(
          "TIKTOK_ADS_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (actor.workspaceId && ownership.workspaceId !== actor.workspaceId) {
        throw new IdentityError(
          "TIKTOK_ADS_OAUTH_CONNECTION_NOT_FOUND",
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

      await this.repository.saveEvent(connectionId, "tiktok_ads.oauth.connection.deleted", payload)
      await this.repository.appendAuditLog({
        actorUserId: actor.userId,
        organizationId: ownership.organizationId,
        workspaceId: ownership.workspaceId,
        action: "integration.tiktok_ads_oauth.deleted",
        entityId: connectionId,
        metadata: payload,
        createdAt: occurredAt,
      })
      await this.repository.appendOutboxEvent({
        eventType: "tiktok_ads.oauth.connection.deleted",
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
