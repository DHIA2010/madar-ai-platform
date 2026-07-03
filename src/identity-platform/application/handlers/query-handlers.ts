import type { AuthenticatedActor } from "../dto/identity-dtos"
import type { ListAuditLogsQuery, ListInvitationsQuery, ListOrganizationsQuery } from "../queries"
import type { IdentityRepositories } from "../../domain/repositories"
import { ERRORS } from "../errors/IdentityError"
import {
  hasPermission,
  ROLE_PERMISSIONS,
  resolvePermissions,
} from "../../domain/domain-services/permission-service"

export class IdentityQueryHandlers {
  constructor(private readonly repositories: IdentityRepositories) {}

  async getProfile(actor: AuthenticatedActor) {
    const user = await this.repositories.users.findById(actor.userId)
    if (!user) {
      throw ERRORS.notFound("User")
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      language: user.language,
      status: user.status,
      preferences: user.preferences,
      activeWorkspaceId: user.activeWorkspaceId,
      primaryOrganizationId: user.primaryOrganizationId,
      emailVerifiedAt: user.emailVerifiedAt,
    }
  }

  async getSession(actor: AuthenticatedActor) {
    const sessions = (await this.repositories.sessions.listByUserId(actor.userId))
      .filter((session) => !session.revokedAt)
      .map((session) => ({
        id: session.id,
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
      }))
    return {
      user: await this.getProfile(actor),
      sessions,
      roles: actor.roles,
    }
  }

  async listWorkspaces(actor: AuthenticatedActor) {
    if (!hasPermission(actor.roles, "workspace:read")) {
      throw ERRORS.forbidden()
    }
    const memberships = await this.repositories.memberships.listByUserId(actor.userId)
    const items = await Promise.all(
      memberships.map(async (membership) => ({
        role: membership.role,
        workspace: membership.workspaceId
          ? await this.repositories.workspaces.findById(membership.workspaceId)
          : null,
      }))
    )
    return items.filter((entry) => Boolean(entry.workspace))
  }

  async getOrganization(actor: AuthenticatedActor, organizationId: string) {
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const organization = await this.repositories.organizations.findById(organizationId)
    if (!organization) {
      throw ERRORS.notFound("Organization")
    }
    return organization
  }

  async listOrganizations(actor: AuthenticatedActor, query: ListOrganizationsQuery) {
    const memberships = await this.repositories.memberships.listByUserId(actor.userId)
    const organizationIds = new Set(
      memberships
        .filter((membership) => membership.status === "active" && !membership.deletedAt)
        .map((membership) => membership.organizationId)
    )
    const organizations = await this.repositories.organizations.list({
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
    })
    return {
      page: query.page,
      pageSize: query.pageSize,
      items: organizations.filter((organization) => organizationIds.has(organization.id)),
    }
  }

  async listOrganizationMembers(actor: AuthenticatedActor, organizationId: string) {
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const rows = await this.repositories.memberships.listByOrganizationId(organizationId)
    const members = await Promise.all(
      rows.map(async (row) => {
        const user = await this.repositories.users.findById(row.userId)
        const workspace = row.workspaceId
          ? await this.repositories.workspaces.findById(row.workspaceId)
          : null
        return {
          membershipId: row.id,
          userId: row.userId,
          email: user?.email ?? null,
          fullName: user?.fullName ?? null,
          role: row.role,
          status: row.status,
          profile: row.profile,
          history: row.history,
          roleHistory: row.roleHistory,
          workspaceId: row.workspaceId,
          workspaceName: workspace?.name ?? null,
        }
      })
    )
    return { organizationId, members }
  }

  async listOrganizationInvitations(
    actor: AuthenticatedActor,
    organizationId: string,
    query: ListInvitationsQuery
  ) {
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }

    const items = await this.repositories.invitations.listByOrganizationId(organizationId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    })
    return {
      page: query.page,
      pageSize: query.pageSize,
      items,
    }
  }

  async listWorkspaceMembers(actor: AuthenticatedActor, workspaceId: string) {
    const membership = await this.repositories.memberships.findByUserAndWorkspace(
      actor.userId,
      workspaceId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const rows = await this.repositories.memberships.listByWorkspaceId(workspaceId)
    const members = await Promise.all(
      rows.map(async (row) => {
        const user = await this.repositories.users.findById(row.userId)
        return {
          userId: row.userId,
          email: user?.email ?? null,
          fullName: user?.fullName ?? null,
          role: row.role,
        }
      })
    )
    return { workspaceId, members }
  }

  getRbac(actor: AuthenticatedActor) {
    return {
      role: actor.roles[0] ?? "viewer",
      permissions: resolvePermissions(actor.roles),
    }
  }

  getPermissionMatrix() {
    return { roles: ROLE_PERMISSIONS }
  }

  async getAuditLogs(actor: AuthenticatedActor, query: ListAuditLogsQuery) {
    if (!hasPermission(actor.roles, "org:read")) {
      throw ERRORS.forbidden()
    }
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: await this.repositories.auditLogs.count(),
      data: await this.repositories.auditLogs.listRecent(query.page, query.pageSize),
    }
  }
}
