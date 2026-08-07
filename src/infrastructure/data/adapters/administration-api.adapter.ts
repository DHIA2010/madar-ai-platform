import type {
  CancelInvitationRequestDto,
  CreateCustomRoleRequestDto,
  CreateTeamRequestDto,
  GetAuditLogsRequestDto,
  ResendInvitationRequestDto,
  RevokeSessionRequestDto,
  RolePermissionDto,
  SendInvitationRequestDto,
  UpdateCustomRoleRequestDto,
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
  role: string
  status: "invited" | "active" | "suspended" | "removed"
  profile: Record<string, string>
  workspaceId: string | null
  workspaceName: string | null
  lastLoginAt: string | null
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
}

export interface OrganizationTeamsApiResponse {
  organizationId: string
  items: TeamApiEntry[]
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
      { name: string; description?: string; workspaceId?: string },
      TeamApiEntry
    >(`/v1/organizations/${request.organizationId}/teams`, {
      name: request.name,
      description: request.description,
      workspaceId: request.workspaceId,
    })
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
}
