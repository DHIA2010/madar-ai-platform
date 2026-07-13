import { IdentityError } from "../application/errors/IdentityError"
import type { AuthenticatedActor } from "../application/dto/identity-dtos"

import { GoogleOAuthRepository } from "./repository"

function assertActorCanManageIntegrations(actor: AuthenticatedActor) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("admin")) {
    throw new IdentityError("GOOGLE_OAUTH_FORBIDDEN", 403, "security", "Permission denied.")
  }
}

export class GoogleOAuthConnectionDeletionService {
  constructor(private readonly repository: GoogleOAuthRepository) {}

  async deleteConnection(actor: AuthenticatedActor, connectionId: string) {
    assertActorCanManageIntegrations(actor)

    await this.repository.withTransaction(async () => {
      const ownership = await this.repository.findConnectionOwnershipById(connectionId)
      if (!ownership) {
        throw new IdentityError(
          "GOOGLE_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (ownership.organizationId !== actor.organizationId) {
        throw new IdentityError(
          "GOOGLE_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      if (actor.workspaceId && ownership.workspaceId !== actor.workspaceId) {
        throw new IdentityError(
          "GOOGLE_OAUTH_CONNECTION_NOT_FOUND",
          404,
          "business",
          "Connection not found."
        )
      }

      await this.repository.deleteConnectionCascade(connectionId)
    })
  }
}
