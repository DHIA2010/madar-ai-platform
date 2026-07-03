import { createIdentityPlatform } from "./bootstrap/create-identity-platform"
import type { AuthenticatedActor } from "./application/dto/identity-dtos"
import { loadIdentityPlatformConfig, type IdentityPlatformConfig } from "./configuration"
import type { RequestContext, Role } from "./types"

export class IdentityPlatformService {
  readonly container

  constructor(config: Partial<IdentityPlatformConfig>) {
    this.container = createIdentityPlatform({ config: loadIdentityPlatformConfig(config), mode: "memory" })
  }

  register(payload: Parameters<(typeof this.container.commands)["register"]>[0], context: RequestContext) {
    return this.container.commands.register(payload, context)
  }

  verifyEmail(payload: Parameters<(typeof this.container.commands)["verifyEmail"]>[0], context: RequestContext) {
    return this.container.commands.verifyEmail(payload, context)
  }

  login(payload: Parameters<(typeof this.container.commands)["login"]>[0], context: RequestContext) {
    return this.container.commands.login(payload, context)
  }

  refresh(payload: Parameters<(typeof this.container.commands)["refresh"]>[0], context: RequestContext) {
    return this.container.commands.refresh(payload, context)
  }

  logout(payload: { sessionId: string }, context: RequestContext, actorUserId: string) {
    return this.container.commands.logout(payload, context, this.resolveActorFromUserId(actorUserId, ["owner"]))
  }

  revokeSession(payload: { sessionId: string }, context: RequestContext, actorUserId: string, actorRoles: Role[]) {
    return this.container.commands.revokeSession(payload, context, this.resolveActorFromUserId(actorUserId, actorRoles))
  }

  createPasswordReset(payload: Parameters<(typeof this.container.commands)["createPasswordReset"]>[0], context: RequestContext) {
    return this.container.commands.createPasswordReset(payload, context)
  }

  resetPassword(payload: Parameters<(typeof this.container.commands)["resetPassword"]>[0], context: RequestContext) {
    return this.container.commands.resetPassword(payload, context)
  }

  async resolveAccessToken(token: string) {
    const actor = await this.container.commands.resolveActorFromAccessToken(token)
    return {
      user: await this.container.queries.getProfile(actor),
      session: {
        id: actor.sessionId,
        organizationId: actor.organizationId,
        workspaceId: actor.workspaceId,
      },
      roles: actor.roles,
    }
  }

  getProfile(actorUserId: string) {
    return this.container.queries.getProfile(this.resolveActorFromUserId(actorUserId, ["owner"]))
  }

  updateProfile(
    actorUserId: string,
    payload: {
      fullName?: string
      avatarUrl?: string | null
      timezone?: string
      language?: string
      preferences?: Record<string, string | number | boolean>
    },
    context: RequestContext
  ) {
    return this.container.commands.updateProfile(this.resolveActorFromUserId(actorUserId, ["owner"]), payload, context)
  }

  createWorkspace(
    actorUserId: string,
    actorRoles: Role[],
    payload: { organizationId: string; name: string; metadata?: Record<string, string> },
    context: RequestContext
  ) {
    return this.container.commands.createWorkspace(this.resolveActorFromUserId(actorUserId, actorRoles), payload, context)
  }

  listWorkspaces(actorUserId: string, actorRoles: Role[]) {
    return this.container.queries.listWorkspaces(this.resolveActorFromUserId(actorUserId, actorRoles))
  }

  createOrganizationInvite(
    actorUserId: string,
    actorRoles: Role[],
    payload: { organizationId: string; workspaceId?: string; email: string; role: Role },
    context: RequestContext
  ) {
    return this.container.commands.inviteMember(
      this.resolveActorFromUserId(actorUserId, actorRoles),
      {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId as string,
        email: payload.email,
        role: payload.role,
      },
      context
    )
  }

  getAuditLogs(actorRoles: Role[]) {
    return this.container.queries.getAuditLogs(
      {
        userId: "system",
        sessionId: "system",
        organizationId: "system",
        workspaceId: null,
        roles: actorRoles,
      },
      { page: 1, pageSize: 100 }
    )
  }

  private resolveActorFromUserId(actorUserId: string, roles: Role[]): AuthenticatedActor {
    return {
      userId: actorUserId,
      sessionId: "legacy",
      organizationId: "legacy",
      workspaceId: null,
      roles,
    }
  }
}
