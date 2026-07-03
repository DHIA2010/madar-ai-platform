import type {
  AuditLogState,
  EmailVerificationState,
  InvitationState,
  MembershipState,
  OrganizationState,
  PasswordResetState,
  SessionState,
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

export interface AuditLogRepository {
  append(entry: AuditLogState): Promise<void>
  listRecent(page: number, pageSize: number): Promise<AuditLogState[]>
  count(): Promise<number>
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
}
