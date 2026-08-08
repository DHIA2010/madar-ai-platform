export interface AuditLogEventDto {
  id: string
  actor: string
  action: string
  target: string
  category: "activity" | "audit"
  createdAt: string
  severity: "low" | "medium" | "high"
}

export interface GetAuditLogsRequestDto {
  page: number
  pageSize: number
}

export interface AuditLogListDto {
  page: number
  pageSize: number
  total: number
  items: AuditLogEventDto[]
}

export type AdministrationUserStatus = "active" | "inactive" | "pending" | "suspended"

export interface AdministrationUserDto {
  id: string
  fullName: string
  email: string
  department: string
  roleId: string
  workspaces: string[]
  status: AdministrationUserStatus
  lastLogin: string
  mfaEnabled: boolean
  teams: string[]
  recentActivity: string[]
  devices: Array<{ name: string; browser: string; lastActive: string }>
}

export interface GetUsersRequestDto {
  organizationId: string
}

export type AdministrationInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "canceled"
  | "expired"

export interface AdministrationInvitationDto {
  id: string
  email: string
  roleId: string
  workspace: string
  department: string
  status: AdministrationInvitationStatus
  expiresAt: string
  invitedAt: string
}

export interface GetInvitationsRequestDto {
  organizationId: string
}

export interface SendInvitationRequestDto {
  organizationId: string
  email: string
  roleId: string
  workspaceId?: string
}

export interface CancelInvitationRequestDto {
  invitationId: string
}

export interface ResendInvitationRequestDto {
  invitationId: string
}

export interface AdministrationSessionDto {
  id: string
  browser: string
  device: string
  ip: string
  location: string
  loginTime: string
  lastActivity: string
  current: boolean
}

export interface RevokeSessionRequestDto {
  sessionId: string
}

export interface AdministrationTeamDto {
  id: string
  name: string
  manager: string
  members: number
  workspace: string
  workspaceId: string | null
  description: string
  color: string
  roleReference: string | null
  permissions: Record<string, string[]>
}

export interface GetTeamsRequestDto {
  organizationId: string
}

export interface CreateTeamRequestDto {
  organizationId: string
  name: string
  description?: string
  workspaceId?: string
  roleReference?: string | null
}

export interface AdministrationTeamMemberDto {
  id: string
  userId: string
  fullName: string
  email: string
  addedAt: string
}

export interface GetTeamMembersRequestDto {
  teamId: string
}

export interface AddTeamMemberRequestDto {
  teamId: string
  userId: string
}

export interface RemoveTeamMemberRequestDto {
  teamId: string
  userId: string
}

export interface UpdateTeamRequestDto {
  teamId: string
  name?: string
  description?: string
  workspaceId?: string | null
  roleReference?: string | null
}

export interface DeleteTeamRequestDto {
  teamId: string
}

export interface RolePermissionDto {
  module: string
  action: string
}

export interface AdministrationRoleDto {
  id: string
  name: string
  description: string
  userCount: number
  isDefault: boolean
  editable: boolean
  permissions: Record<string, string[]>
}

export interface GetRolesRequestDto {
  organizationId: string
}

export interface CreateCustomRoleRequestDto {
  organizationId: string
  name: string
  description?: string
  permissions: RolePermissionDto[]
}

export interface UpdateCustomRoleRequestDto {
  roleId: string
  name?: string
  description?: string
  permissions?: RolePermissionDto[]
}

export interface AdministrationGateway {
  getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogListDto>
  getUsers(request: GetUsersRequestDto): Promise<AdministrationUserDto[]>
  getInvitations(request: GetInvitationsRequestDto): Promise<AdministrationInvitationDto[]>
  sendInvitation(request: SendInvitationRequestDto): Promise<AdministrationInvitationDto>
  cancelInvitation(request: CancelInvitationRequestDto): Promise<void>
  resendInvitation(request: ResendInvitationRequestDto): Promise<AdministrationInvitationDto>
  getSessions(): Promise<AdministrationSessionDto[]>
  revokeSession(request: RevokeSessionRequestDto): Promise<void>
  getTeams(request: GetTeamsRequestDto): Promise<AdministrationTeamDto[]>
  createTeam(request: CreateTeamRequestDto): Promise<AdministrationTeamDto>
  getTeamMembers(request: GetTeamMembersRequestDto): Promise<AdministrationTeamMemberDto[]>
  addTeamMember(request: AddTeamMemberRequestDto): Promise<void>
  removeTeamMember(request: RemoveTeamMemberRequestDto): Promise<void>
  updateTeam(request: UpdateTeamRequestDto): Promise<AdministrationTeamDto>
  deleteTeam(request: DeleteTeamRequestDto): Promise<void>
  getRoles(request: GetRolesRequestDto): Promise<AdministrationRoleDto[]>
  createCustomRole(request: CreateCustomRoleRequestDto): Promise<AdministrationRoleDto>
  updateCustomRole(request: UpdateCustomRoleRequestDto): Promise<AdministrationRoleDto>
}

export type AdministrationRepository = AdministrationGateway
