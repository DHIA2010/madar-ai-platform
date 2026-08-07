import type { Role } from "../../types"
import type { AuthenticatedActor } from "../dto/identity-dtos"
import type { ListAuditLogsQuery, ListInvitationsQuery, ListOrganizationsQuery } from "../queries"
import type { IdentityRepositories } from "../../domain/repositories"
import { ERRORS } from "../errors/IdentityError"
import {
  hasPermission,
  ROLE_PERMISSIONS,
  resolvePermissions,
} from "../../domain/domain-services/permission-service"

// Fixed, non-editable default permission matrices for the platform's real
// membership roles -- unlike custom roles, these are not backed by
// custom_role_permissions and don't affect actual authorization checks (those
// still run on the fixed owner/admin/manager/analyst/viewer role system).
// This just gives the granular Roles UI something honest to display for the
// roles a member can actually be assigned.
const SYSTEM_ROLE_DEFINITIONS: Array<{
  role: Role
  name: string
  description: string
  permissions: Record<string, string[]>
}> = [
  {
    role: "owner",
    name: "Owner",
    description: "Full control across security, billing, and workspace governance.",
    permissions: {
      dashboard: ["view", "export"],
      campaigns: ["view", "create", "edit", "delete", "approve", "publish"],
      customers: ["view", "create", "edit", "delete", "export", "import"],
      products: ["view", "create", "edit", "delete", "export", "import"],
      reports: ["view", "export", "approve"],
      connections: ["view", "create", "edit", "delete", "manage"],
      creativeLibrary: ["view", "create", "edit", "delete", "publish"],
      ai: ["view", "manage"],
      settings: ["view", "edit", "manage"],
      workspace: ["view", "edit", "manage"],
      users: ["view", "create", "edit", "delete", "manage"],
      billing: ["view", "edit", "manage"],
      notifications: ["view", "edit", "manage"],
      api: ["view", "create", "delete", "manage"],
    },
  },
  {
    role: "admin",
    name: "Admin",
    description: "Manages users, roles, and operational settings.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view", "create", "edit", "delete", "approve", "publish"],
      customers: ["view"],
      products: ["view"],
      reports: ["view"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view", "edit", "manage"],
      workspace: ["view", "edit", "manage"],
      users: ["view", "create", "edit", "delete", "manage"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "manager",
    name: "Manager",
    description: "Owns campaign planning, approvals, and reporting.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view", "create", "edit", "approve", "publish"],
      customers: ["view"],
      products: ["view"],
      reports: ["view", "export"],
      connections: ["view"],
      creativeLibrary: ["view", "create", "edit", "publish"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "analyst",
    name: "Analyst",
    description: "Analyzes KPI trends and exports reporting data.",
    permissions: {
      dashboard: ["view", "export"],
      campaigns: ["view"],
      customers: ["view"],
      products: ["view"],
      reports: ["view", "export"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
  {
    role: "viewer",
    name: "Viewer",
    description: "Read-only access across approved modules.",
    permissions: {
      dashboard: ["view"],
      campaigns: ["view"],
      customers: ["view"],
      products: ["view"],
      reports: ["view"],
      connections: ["view"],
      creativeLibrary: ["view"],
      ai: ["view"],
      settings: ["view"],
      workspace: ["view"],
      users: ["view"],
      billing: ["view"],
      notifications: ["view"],
      api: ["view"],
    },
  },
]

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
          lastLoginAt: lastLoginTimestamps[row.userId] ?? null,
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
    return { organizationId, items }
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
