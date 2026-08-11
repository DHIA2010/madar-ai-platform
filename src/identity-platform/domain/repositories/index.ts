import type {
  AuditLogState,
  CustomRoleState,
  EmailVerificationState,
  InvitationState,
  MembershipState,
  OrganizationState,
  PasswordResetState,
  SessionState,
  TeamMemberState,
  TeamState,
  UserState,
  WorkspaceState,
} from "../entities"

export interface UserRepository {
  findById(id: string): Promise<UserState | null>
  findByEmail(email: string): Promise<UserState | null>
  save(user: UserState): Promise<void>
}

export interface OrganizationRepository {
  findById(id: string): Promise<OrganizationState | null>
  list(input?: {
    ownerUserId?: string
    status?: OrganizationState["status"]
    page?: number
    pageSize?: number
    sort?: "createdAt:asc" | "createdAt:desc" | "name:asc" | "name:desc"
  }): Promise<OrganizationState[]>
  save(organization: OrganizationState): Promise<void>
}

export interface WorkspaceRepository {
  findById(id: string): Promise<WorkspaceState | null>
  findFirstByOrganizationId(organizationId: string): Promise<WorkspaceState | null>
  save(workspace: WorkspaceState): Promise<void>
}

export interface MembershipRepository {
  findById(id: string): Promise<MembershipState | null>
  save(membership: MembershipState): Promise<void>
  findByUserAndWorkspace(userId: string, workspaceId: string): Promise<MembershipState | null>
  findByUserAndOrganization(userId: string, organizationId: string): Promise<MembershipState | null>
  findFirstByUserId(userId: string): Promise<MembershipState | null>
  listByUserId(userId: string): Promise<MembershipState[]>
  listByWorkspaceId(workspaceId: string): Promise<MembershipState[]>
  listByOrganizationId(organizationId: string): Promise<MembershipState[]>
  listRolesByUserInOrganization(userId: string, organizationId: string): Promise<string[]>
}

export interface SessionRepository {
  findById(id: string): Promise<SessionState | null>
  findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionState | null>
  listByUserId(userId: string): Promise<SessionState[]>
  save(session: SessionState): Promise<void>
}

export interface EmailVerificationRepository {
  findByTokenHash(tokenHash: string): Promise<EmailVerificationState | null>
  save(entry: EmailVerificationState): Promise<void>
}

export interface PasswordResetRepository {
  findByTokenHash(tokenHash: string): Promise<PasswordResetState | null>
  save(entry: PasswordResetState): Promise<void>
}

export interface InvitationRepository {
  findById(id: string): Promise<InvitationState | null>
  findByToken(token: string): Promise<InvitationState | null>
  listByOrganizationId(
    organizationId: string,
    input?: { page?: number; pageSize?: number; status?: InvitationState["status"] }
  ): Promise<InvitationState[]>
  findPendingByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<InvitationState | null>
  save(entry: InvitationState): Promise<void>
}

export interface AuditLogListItem extends AuditLogState {
  actorName: string | null
}

export interface AuditLogRepository {
  append(entry: AuditLogState): Promise<void>
  listRecent(organizationId: string, page: number, pageSize: number): Promise<AuditLogListItem[]>
  count(organizationId: string): Promise<number>
  getLastLoginTimestamps(organizationId: string): Promise<Record<string, string>>
}

export interface CustomRolePermission {
  module: string
  action: string
}

export interface TeamListItem extends TeamState {
  managerName: string | null
  workspaceName: string | null
  memberCount: number
}

export interface TeamMemberListItem extends TeamMemberState {
  userFullName: string
  userEmail: string
}

export interface TeamRepository {
  findById(id: string): Promise<TeamState | null>
  save(team: TeamState): Promise<void>
  listByOrganizationId(organizationId: string): Promise<TeamListItem[]>
  addMember(member: TeamMemberState): Promise<void>
  listMembers(teamId: string): Promise<TeamMemberListItem[]>
  removeMember(teamId: string, userId: string): Promise<void>
  listMemberTeamNames(
    organizationId: string
  ): Promise<Array<{ userId: string; teamId: string; teamName: string }>>
}

export interface CustomRoleListItem extends CustomRoleState {
  permissions: CustomRolePermission[]
}

export interface CustomRoleRepository {
  findById(id: string): Promise<CustomRoleState | null>
  findByIdWithPermissions(id: string): Promise<CustomRoleListItem | null>
  save(role: CustomRoleState): Promise<void>
  listByOrganizationId(organizationId: string): Promise<CustomRoleListItem[]>
  replacePermissions(roleId: string, permissions: CustomRolePermission[]): Promise<void>
}

export interface IdentityRepositories {
  users: UserRepository
  organizations: OrganizationRepository
  workspaces: WorkspaceRepository
  memberships: MembershipRepository
  sessions: SessionRepository
  emailVerifications: EmailVerificationRepository
  passwordResets: PasswordResetRepository
  invitations: InvitationRepository
  auditLogs: AuditLogRepository
  teams: TeamRepository
  customRoles: CustomRoleRepository
}
