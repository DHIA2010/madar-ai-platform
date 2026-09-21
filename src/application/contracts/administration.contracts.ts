export interface AuditLogEventDto {
  id: string
  actorUserId: string | null
  actor: string
  action: string
  target: string
  category: "activity" | "audit"
  createdAt: string
  // Both derived client-side from the real `action` string (e.g. "auth.login_failed" is a real,
  // already-audited event) -- there is no separate backend classification for either field.
  severity: "low" | "medium" | "high"
  status: "success" | "failed"
  ipAddress: string | null
}

export interface GetAuditLogsRequestDto {
  page: number
  pageSize: number
  // Narrows to one member's own events -- used by the user profile drawer's real Recent Activity.
  actorUserId?: string
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
  avatarUrl: string | null
  // Real, distinct departments across every one of this member's workspace memberships, joined
  // for display -- a summary, since department is stored per-membership (per-workspace), not
  // per-user. Empty string when none of their memberships has one set.
  department: string
  // The same data, unflattened -- one real entry per workspace membership, each independently
  // editable (see UpdateMemberProfileRequestDto.workspaceId). This is what an edit UI should
  // actually present for a member who belongs to more than one workspace.
  departments: Array<{ workspaceId: string; workspaceName: string; department: string }>
  roleId: string
  customRoleId: string | null
  moduleAccessRevoked: boolean
  // Display names, for the Users screen's own workspace column/filter -- names are not a stable
  // identity (two workspaces can share a name), so anything that needs to test "is this member
  // in workspace X" (a picker's own pre-checked state, an access-grant check...) must use
  // workspaceIds below instead, never match against this array.
  workspaces: string[]
  workspaceIds: string[]
  status: AdministrationUserStatus
  lastLogin: string
  teams: string[]
  // No MFA field: MFA isn't a feature this backend has, so there is nothing real to report.
  // No recentActivity/devices here either -- the profile drawer fetches those itself, on demand,
  // via the actorUserId-filtered audit log and the org-wide session list (real, but too
  // expensive to eagerly join onto every row of the user list).
}

export interface GetUsersRequestDto {
  organizationId: string
}

export interface SuspendMemberRequestDto {
  organizationId: string
  memberUserId: string
  reason?: string
}

export interface ReactivateMemberRequestDto {
  organizationId: string
  memberUserId: string
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
  // A suggested name for the invitee, set by whoever sent the invite -- real (stored on the
  // invitation, personalizes the invite email, pre-fills the accept-invite page), but optional:
  // older invitations and any that omit it have none.
  fullName: string | null
  roleId: string
  workspace: string
  // No "department" field: an invitation never captures one anywhere in this backend (not
  // hidden, not optional -- the invite command/schema has no such input), so there is nothing
  // real to show here.
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
  fullName?: string
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

// Every active member's real sessions, org-wide -- distinct from AdministrationSessionDto (the
// caller's own sessions only, backed by /v1/auth/session). Used by the Administration "Sessions"
// tab, which is an admin-facing view across the whole organization, not a self-service one.
export interface AdministrationOrgSessionDto {
  id: string
  userId: string
  fullName: string | null
  email: string | null
  browser: string
  device: string
  ip: string
  location: string | null
  loginTime: string
  lastActivity: string
  current: boolean
}

export interface GetOrganizationSessionsRequestDto {
  organizationId: string
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

export interface DeleteCustomRoleRequestDto {
  roleId: string
}

export interface AssignMemberRoleRequestDto {
  organizationId: string
  memberUserId: string
  role: string
}

export interface AssignMemberCustomRoleRequestDto {
  organizationId: string
  memberUserId: string
  customRoleId: string | null
}

export interface SetMemberModuleAccessRequestDto {
  organizationId: string
  memberUserId: string
  revoked: boolean
}

export interface UpdateMemberProfileRequestDto {
  organizationId: string
  memberUserId: string
  // Targets one specific membership (a member has one per workspace, each with its own
  // profile/department) -- omitted, the backend falls back to an arbitrary membership in the
  // org, which is only safe for a member who belongs to just one workspace.
  workspaceId?: string | null
  profile: Record<string, string>
}

export interface UpdateMemberIdentityRequestDto {
  organizationId: string
  memberUserId: string
  fullName?: string
}

export interface UploadMemberAvatarRequestDto {
  organizationId: string
  memberUserId: string
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  dataBase64: string
}

export interface SendMemberPasswordResetRequestDto {
  organizationId: string
  memberUserId: string
}

// No role field -- new members always start as "viewer" here too, matching the invitations
// screen's own DEFAULT_INVITE_ROLE_ID (roles come from teams, not from how the member was added).
export interface CreateMemberDirectRequestDto {
  organizationId: string
  // One real membership is created per workspace here, all under the same new user, in one
  // atomic call -- omitted/empty falls back to the organization's first workspace.
  workspaceIds?: string[]
  email: string
  fullName: string
  password: string
}

// Grants an EXISTING organization member access to more workspaces -- distinct from
// CreateMemberDirectRequestDto, which always creates a brand-new user. Used by the branch
// (Settings -> إدارة مساحات العمل) create/edit form's user picker.
export interface AssignUserWorkspacesRequestDto {
  organizationId: string
  userId: string
  workspaceIds: string[]
}

export interface AdministrationGateway {
  getAuditLogs(request: GetAuditLogsRequestDto): Promise<AuditLogListDto>
  getUsers(request: GetUsersRequestDto): Promise<AdministrationUserDto[]>
  suspendMember(request: SuspendMemberRequestDto): Promise<void>
  reactivateMember(request: ReactivateMemberRequestDto): Promise<void>
  assignMemberRole(request: AssignMemberRoleRequestDto): Promise<void>
  assignMemberCustomRole(request: AssignMemberCustomRoleRequestDto): Promise<void>
  setMemberModuleAccess(request: SetMemberModuleAccessRequestDto): Promise<void>
  updateMemberProfile(request: UpdateMemberProfileRequestDto): Promise<void>
  updateMemberIdentity(request: UpdateMemberIdentityRequestDto): Promise<void>
  uploadMemberAvatar(request: UploadMemberAvatarRequestDto): Promise<{ avatarUrl: string }>
  sendMemberPasswordReset(request: SendMemberPasswordResetRequestDto): Promise<void>
  createMemberDirect(request: CreateMemberDirectRequestDto): Promise<{ userId: string }>
  assignUserWorkspaces(request: AssignUserWorkspacesRequestDto): Promise<void>
  getInvitations(request: GetInvitationsRequestDto): Promise<AdministrationInvitationDto[]>
  sendInvitation(request: SendInvitationRequestDto): Promise<AdministrationInvitationDto>
  cancelInvitation(request: CancelInvitationRequestDto): Promise<void>
  resendInvitation(request: ResendInvitationRequestDto): Promise<AdministrationInvitationDto>
  getSessions(): Promise<AdministrationSessionDto[]>
  getOrganizationSessions(
    request: GetOrganizationSessionsRequestDto
  ): Promise<AdministrationOrgSessionDto[]>
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
  deleteCustomRole(request: DeleteCustomRoleRequestDto): Promise<void>
}

export type AdministrationRepository = AdministrationGateway
