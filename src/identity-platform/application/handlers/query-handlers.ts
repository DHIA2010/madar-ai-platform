import type { AuthenticatedActor } from "../dto/identity-dtos"
import type { ListAuditLogsQuery, ListInvitationsQuery, ListOrganizationsQuery } from "../queries"
import type { CustomRoleListItem, IdentityRepositories } from "../../domain/repositories"
import { SYSTEM_ROLE_DEFINITIONS } from "../../domain/domain-services/system-roles"
import { ERRORS } from "../errors/IdentityError"
import {
  hasPermission,
  ROLE_PERMISSIONS,
  resolvePermissions,
} from "../../domain/domain-services/permission-service"

function resolveRolePermissions(
  roleReference: string | null,
  customRoleById: Map<string, CustomRoleListItem>
): Record<string, string[]> {
  if (!roleReference) return {}

  const systemRole = SYSTEM_ROLE_DEFINITIONS.find((definition) => definition.role === roleReference)
  if (systemRole) return systemRole.permissions

  const customRole = customRoleById.get(roleReference)
  if (!customRole) return {}

  const record: Record<string, string[]> = {}
  for (const permission of customRole.permissions) {
    const existing = record[permission.module] ?? []
    existing.push(permission.action)
    record[permission.module] = existing
  }
  return record
}

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
    const now = Date.now()
    const sessions = (await this.repositories.sessions.listByUserId(actor.userId))
      .filter((session) => !session.revokedAt && new Date(session.expiresAt).getTime() > now)
      .map((session) => ({
        id: session.id,
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        rememberMe: session.rememberMe,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      }))
    return {
      user: await this.getProfile(actor),
      sessions,
      currentSessionId: actor.sessionId,
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

  async getWorkspace(actor: AuthenticatedActor, workspaceId: string) {
    const membership = await this.repositories.memberships.findByUserAndWorkspace(
      actor.userId,
      workspaceId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const workspace = await this.repositories.workspaces.findById(workspaceId)
    if (!workspace) {
      throw ERRORS.notFound("Workspace")
    }
    return workspace
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
    const lastLoginTimestamps =
      await this.repositories.auditLogs.getLastLoginTimestamps(organizationId)
    const memberTeamRows = await this.repositories.teams.listMemberTeamNames(organizationId)
    const teamsByUserId = new Map<string, Array<{ id: string; name: string }>>()
    for (const row of memberTeamRows) {
      const existing = teamsByUserId.get(row.userId) ?? []
      existing.push({ id: row.teamId, name: row.teamName })
      teamsByUserId.set(row.userId, existing)
    }
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
          avatarUrl: user?.avatarUrl ?? null,
          role: row.role,
          status: row.status,
          profile: row.profile,
          history: row.history,
          roleHistory: row.roleHistory,
          workspaceId: row.workspaceId,
          workspaceName: workspace?.name ?? null,
          lastLoginAt: lastLoginTimestamps[row.userId] ?? null,
          teams: teamsByUserId.get(row.userId) ?? [],
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

    const rows = await this.repositories.invitations.listByOrganizationId(organizationId, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    })
    const items = await Promise.all(
      rows.map(async (row) => {
        const workspace = row.workspaceId
          ? await this.repositories.workspaces.findById(row.workspaceId)
          : null
        return { ...row, workspaceName: workspace?.name ?? null }
      })
    )
    return {
      page: query.page,
      pageSize: query.pageSize,
      items,
    }
  }

  async listTeams(actor: AuthenticatedActor, organizationId: string) {
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const items = await this.repositories.teams.listByOrganizationId(organizationId)
    if (items.length === 0) {
      return { organizationId, items: [] }
    }

    const customRoles = await this.repositories.customRoles.listByOrganizationId(organizationId)
    const customRoleById = new Map(customRoles.map((role) => [role.id, role]))

    return {
      organizationId,
      items: items.map((team) => ({
        ...team,
        permissions: resolveRolePermissions(team.roleReference, customRoleById),
      })),
    }
  }

  async listTeamMembers(actor: AuthenticatedActor, teamId: string) {
    const teamState = await this.repositories.teams.findById(teamId)
    if (!teamState) {
      throw ERRORS.notFound("Team")
    }
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      teamState.organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }
    const items = await this.repositories.teams.listMembers(teamId)
    return { teamId, items }
  }

  async listRoles(actor: AuthenticatedActor, organizationId: string) {
    const membership = await this.repositories.memberships.findByUserAndOrganization(
      actor.userId,
      organizationId
    )
    if (!membership) {
      throw ERRORS.forbidden()
    }

    const orgMemberships = await this.repositories.memberships.listByOrganizationId(organizationId)
    const activeCountByRole = new Map<string, number>()
    for (const row of orgMemberships) {
      if (row.status !== "active") continue
      activeCountByRole.set(row.role, (activeCountByRole.get(row.role) ?? 0) + 1)
    }

    const systemRoles = SYSTEM_ROLE_DEFINITIONS.map((definition) => ({
      id: definition.role,
      name: definition.name,
      description: definition.description,
      isDefault: true,
      editable: false,
      userCount: activeCountByRole.get(definition.role) ?? 0,
      permissions: definition.permissions,
    }))

    const customRoles = await this.repositories.customRoles.listByOrganizationId(organizationId)
    const customRoleItems = customRoles.map((role) => {
      const permissions: Record<string, string[]> = {}
      for (const permission of role.permissions) {
        const existing = permissions[permission.module] ?? []
        existing.push(permission.action)
        permissions[permission.module] = existing
      }
      return {
        id: role.id,
        name: role.name,
        description: role.description,
        isDefault: false,
        editable: true,
        userCount: 0,
        permissions,
      }
    })

    return { organizationId, items: [...systemRoles, ...customRoleItems] }
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
      total: await this.repositories.auditLogs.count(actor.organizationId),
      data: await this.repositories.auditLogs.listRecent(
        actor.organizationId,
        query.page,
        query.pageSize
      ),
    }
  }
}
