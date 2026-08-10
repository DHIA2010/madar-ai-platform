import type {
  AddTeamMemberRequestDto,
  CancelInvitationRequestDto,
  CreateCustomRoleRequestDto,
  CreateTeamRequestDto,
  DeleteCustomRoleRequestDto,
  DeleteTeamRequestDto,
  GetAuditLogsRequestDto,
  ReactivateMemberRequestDto,
  RemoveTeamMemberRequestDto,
  ResendInvitationRequestDto,
  RevokeSessionRequestDto,
  RolePermissionDto,
  SendInvitationRequestDto,
  SuspendMemberRequestDto,
  UpdateCustomRoleRequestDto,
  UpdateTeamRequestDto,
} from "@/application/contracts/administration.contracts"
import type { ApiClient } from "@/infrastructure/http"

interface AuditLogApiEntry {
  id: string
  actorUserId: string | null
  actorName: string | null
  organizationId: string | null
  workspaceId: string | null
  action: string
  targetType: string
  targetId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface AuditLogsApiResponse {
  items: {
    page: number
    pageSize: number
    total: number
    data: AuditLogApiEntry[]
  }
}

export interface OrganizationMemberApiEntry {
  membershipId: string
  userId: string
  email: string | null
  fullName: string | null
  avatarUrl: string | null
  role: string
  status: "invited" | "active" | "suspended" | "removed"
  profile: Record<string, string>
  workspaceId: string | null
  workspaceName: string | null
  lastLoginAt: string | null
  teams: Array<{ id: string; name: string }>
}

export interface OrganizationMembersApiResponse {
  organizationId: string
  members: OrganizationMemberApiEntry[]
}

export interface InvitationApiEntry {
  id: string
  email: string
  organizationId: string
  workspaceId: string | null
  workspaceName: string | null
  role: string
  status: "pending" | "accepted" | "declined" | "canceled" | "expired"
  expiresAt: string
  createdAt: string
}

export interface OrganizationInvitationsApiResponse {
  page: number
  pageSize: number
  items: InvitationApiEntry[]
}

export interface SessionApiEntry {
  id: string
  organizationId: string
  workspaceId: string | null
  userAgent: string
  ipAddress: string
  rememberMe: boolean
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface CurrentSessionApiResponse {
  sessions: SessionApiEntry[]
  currentSessionId: string
}

export interface TeamApiEntry {
  id: string
  organizationId: string
  workspaceId: string | null
  workspaceName: string | null
  name: string
  description: string
  color: string
  managerUserId: string | null
  managerName: string | null
  memberCount: number
  roleReference: string | null
  permissions: Record<string, string[]>
}

export interface OrganizationTeamsApiResponse {
  organizationId: string
  items: TeamApiEntry[]
}

export interface TeamMemberApiEntry {
  id: string
  teamId: string
  userId: string
  addedByUserId: string | null
  createdAt: string
  userFullName: string
  userEmail: string
}

export interface TeamMembersApiResponse {
  teamId: string
  items: TeamMemberApiEntry[]
}

export interface RoleApiEntry {
  id: string
  name: string
  description: string
  isDefault: boolean
  editable: boolean
  userCount: number
  permissions: Record<string, string[]>
}

export interface OrganizationRolesApiResponse {
  organizationId: string
  items: RoleApiEntry[]
}

export interface CustomRoleApiEntry {
  id: string
  organizationId: string
  name: string
  description: string
  permissions: RolePermissionDto[]
}

export class AdministrationApiAdapter {
  constructor(private readonly client: ApiClient) {}

  getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogsApiResponse["items"]> {
    return this.client
      .get<AuditLogsApiResponse>("/v1/audit-logs", {
        query: { page: request.page, pageSize: request.pageSize },
      })
      .then((response) => response.items)
  }

  getOrganizationMembers(organizationId: string): Promise<OrganizationMemberApiEntry[]> {
    return this.client
      .get<OrganizationMembersApiResponse>(`/v1/organizations/${organizationId}/members`)
      .then((response) => response.members)
  }

  getOrganizationInvitations(organizationId: string): Promise<InvitationApiEntry[]> {
    return this.client
      .get<OrganizationInvitationsApiResponse>(`/v1/organizations/${organizationId}/invitations`, {
        query: { page: 1, pageSize: 100 },
      })
      .then((response) => response.items)
  }

  sendInvitation(request: SendInvitationRequestDto): Promise<InvitationApiEntry> {
    return this.client.post<
      { email: string; role: string; workspaceId?: string },
      InvitationApiEntry
    >(`/v1/organizations/${request.organizationId}/invitations`, {
      email: request.email,
      role: request.roleId,
      workspaceId: request.workspaceId,
    })
  }

  cancelInvitation(request: CancelInvitationRequestDto): Promise<void> {
    return this.client
      .post<
        Record<string, never>,
        { success: boolean }
      >(`/v1/organizations/invitations/${request.invitationId}/cancel`, {})
      .then(() => undefined)
  }

  resendInvitation(request: ResendInvitationRequestDto): Promise<InvitationApiEntry> {
    return this.client.post<Record<string, never>, InvitationApiEntry>(
      `/v1/organizations/invitations/${request.invitationId}/resend`,
      {}
    )
  }

  getCurrentSession(): Promise<CurrentSessionApiResponse> {
    return this.client.get<CurrentSessionApiResponse>("/v1/auth/session")
  }

  revokeSession(request: RevokeSessionRequestDto): Promise<void> {
    return this.client
      .post<{ sessionId: string }, void>("/v1/auth/sessions/revoke", {
        sessionId: request.sessionId,
      })
      .then(() => undefined)
  }

  getTeams(organizationId: string): Promise<TeamApiEntry[]> {
    return this.client
      .get<OrganizationTeamsApiResponse>(`/v1/organizations/${organizationId}/teams`)
      .then((response) => response.items)
  }

  createTeam(request: CreateTeamRequestDto): Promise<TeamApiEntry> {
    return this.client.post<
      {
        name: string
        description?: string
        workspaceId?: string
        roleReference?: string | null
      },
      TeamApiEntry
    >(`/v1/organizations/${request.organizationId}/teams`, {
      name: request.name,
      description: request.description,
      workspaceId: request.workspaceId,
      roleReference: request.roleReference,
    })
  }

  getTeamMembers(teamId: string): Promise<TeamMemberApiEntry[]> {
    return this.client
      .get<TeamMembersApiResponse>(`/v1/organizations/teams/${teamId}/members`)
      .then((response) => response.items)
  }

  addTeamMember(request: AddTeamMemberRequestDto): Promise<void> {
    return this.client
      .post<
        { userId: string },
        { added: boolean }
      >(`/v1/organizations/teams/${request.teamId}/members`, { userId: request.userId })
      .then(() => undefined)
  }

  removeTeamMember(request: RemoveTeamMemberRequestDto): Promise<void> {
    return this.client
      .delete<{
        removed: boolean
      }>(`/v1/organizations/teams/${request.teamId}/members/${request.userId}`)
      .then(() => undefined)
  }

  updateTeam(request: UpdateTeamRequestDto): Promise<TeamApiEntry> {
    return this.client.patch<
      {
        name?: string
        description?: string
        workspaceId?: string | null
        roleReference?: string | null
      },
      TeamApiEntry
    >(`/v1/organizations/teams/${request.teamId}`, {
      name: request.name,
      description: request.description,
      workspaceId: request.workspaceId,
      roleReference: request.roleReference,
    })
  }

  deleteTeam(request: DeleteTeamRequestDto): Promise<void> {
    return this.client
      .delete<{ deleted: boolean }>(`/v1/organizations/teams/${request.teamId}`)
      .then(() => undefined)
  }

  getRoles(organizationId: string): Promise<RoleApiEntry[]> {
    return this.client
      .get<OrganizationRolesApiResponse>(`/v1/organizations/${organizationId}/roles`)
      .then((response) => response.items)
  }

  createCustomRole(request: CreateCustomRoleRequestDto): Promise<CustomRoleApiEntry> {
    return this.client.post<
      { name: string; description?: string; permissions: RolePermissionDto[] },
      CustomRoleApiEntry
    >(`/v1/organizations/${request.organizationId}/roles`, {
      name: request.name,
      description: request.description,
      permissions: request.permissions,
    })
  }

  updateCustomRole(request: UpdateCustomRoleRequestDto): Promise<CustomRoleApiEntry> {
    return this.client.patch<
      { name?: string; description?: string; permissions?: RolePermissionDto[] },
      CustomRoleApiEntry
    >(`/v1/organizations/roles/${request.roleId}`, {
      name: request.name,
      description: request.description,
      permissions: request.permissions,
    })
  }

  deleteCustomRole(request: DeleteCustomRoleRequestDto): Promise<void> {
    return this.client
      .delete<{ success: boolean }>(`/v1/organizations/roles/${request.roleId}`)
      .then(() => undefined)
  }

  suspendMember(request: SuspendMemberRequestDto): Promise<void> {
    return this.client
      .post<
        { reason?: string },
        unknown
      >(`/v1/organizations/${request.organizationId}/members/${request.memberUserId}/suspend`, { reason: request.reason })
      .then(() => undefined)
  }

  reactivateMember(request: ReactivateMemberRequestDto): Promise<void> {
    return this.client
      .post<
        Record<string, never>,
        unknown
      >(`/v1/organizations/${request.organizationId}/members/${request.memberUserId}/reactivate`, {})
      .then(() => undefined)
  }
}
