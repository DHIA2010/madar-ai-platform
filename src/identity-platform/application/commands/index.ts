import type { Role } from "../../types"

export interface RegisterUserCommand {
  email: string
  password: string
  fullName: string
  organizationName: string
  rememberMe?: boolean
  timezone: string
  language: string
}

export interface VerifyEmailCommand {
  token: string
}

export interface LoginUserCommand {
  email: string
  password: string
  rememberMe?: boolean
}

export interface RefreshSessionCommand {
  refreshToken: string
}

export interface LogoutCommand {
  sessionId: string
}

export interface RevokeSessionCommand {
  sessionId: string
}

export interface ForgotPasswordCommand {
  email: string
}

export interface ResetPasswordCommand {
  token: string
  password: string
}

export interface UpdateProfileCommand {
  fullName?: string
  avatarUrl?: string | null
  timezone?: string
  language?: string
  preferences?: Record<string, string | number | boolean>
}

export interface ChangeEmailCommand {
  newEmail: string
  password: string
}

export interface ChangePasswordCommand {
  currentPassword: string
  newPassword: string
}

export interface CreateOrganizationCommand {
  name: string
  metadata?: Record<string, string>
  branding?: Record<string, string>
  logoUrl?: string | null
  timezone?: string
  locale?: string
  currency?: string
  subscriptionReference?: string | null
  settings?: Record<string, string | boolean | number>
}

export interface UpdateOrganizationCommand {
  name?: string
  status?: "active" | "archived" | "deleted"
  metadata?: Record<string, string>
  branding?: Record<string, string>
  logoUrl?: string | null
  timezone?: string
  locale?: string
  currency?: string
  subscriptionReference?: string | null
  settings?: Record<string, string | boolean | number>
}

export interface ArchiveOrganizationCommand {
  organizationId: string
}

export interface RestoreOrganizationCommand {
  organizationId: string
}

export interface DeleteOrganizationCommand {
  organizationId: string
}

export interface CreateWorkspaceCommand {
  organizationId: string
  name: string
  metadata?: Record<string, string>
  settings?: Record<string, string | boolean | number>
}

export interface UpdateWorkspaceCommand {
  name?: string
  status?: "active" | "archived"
  metadata?: Record<string, string>
  settings?: Record<string, string | boolean | number>
}

export interface InviteMemberCommand {
  organizationId: string
  workspaceId?: string
  email: string
  role: Role
  idempotencyKey?: string
}

export interface AcceptInvitationCommand {
  token: string
}

export interface DeclineInvitationCommand {
  token: string
}

export interface CancelInvitationCommand {
  invitationId: string
}

export interface ResendInvitationCommand {
  invitationId: string
}

export interface RemoveMemberCommand {
  organizationId: string
  memberUserId: string
  reason: string
}

export interface SuspendMemberCommand {
  organizationId: string
  memberUserId: string
  reason: string
}

export interface ReactivateMemberCommand {
  organizationId: string
  memberUserId: string
}

export interface TransferOwnershipCommand {
  organizationId: string
  newOwnerUserId: string
}

export interface AssignMemberRoleCommand {
  organizationId: string
  memberUserId: string
  role: Role
}

export interface UpdateMemberProfileCommand {
  organizationId: string
  memberUserId: string
  profile: Record<string, string>
}

export interface SwitchWorkspaceCommand {
  workspaceId: string
}
