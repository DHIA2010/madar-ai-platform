import type { Role } from "../../types"

export interface RegisterUserCommand {
  email: string
  password: string
  fullName: string
  organizationName?: string
  invitationToken?: string
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

export interface UploadAvatarCommand {
  contentType: string
  dataBase64: string
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

export interface CreateTeamCommand {
  organizationId: string
  workspaceId?: string
  name: string
  description?: string
  color?: string
  roleReference?: string | null
}

export interface AddTeamMemberCommand {
  teamId: string
  userId: string
}

export interface RemoveTeamMemberCommand {
  teamId: string
  userId: string
}

export interface UpdateTeamCommand {
  teamId: string
  name?: string
  description?: string
  workspaceId?: string | null
  color?: string
  roleReference?: string | null
}

export interface DeleteTeamCommand {
  teamId: string
}

export interface RolePermissionInput {
  module: string
  action: string
}

export interface CreateCustomRoleCommand {
  organizationId: string
  name: string
  description?: string
  permissions: RolePermissionInput[]
}

export interface UpdateCustomRoleCommand {
  roleId: string
  name?: string
  description?: string
  permissions?: RolePermissionInput[]
}

export interface DeleteCustomRoleCommand {
  roleId: string
}

export interface UpdateWorkspaceCommand {
  name?: string
  status?: "active" | "archived"
  metadata?: Record<string, string>
  settings?: Record<string, string | boolean | number>
}

export interface ArchiveWorkspaceCommand {
  workspaceId: string
}

export interface RestoreWorkspaceCommand {
  workspaceId: string
}

export interface InviteMemberCommand {
  organizationId: string
  workspaceId?: string
  email: string
  // A suggested name for the invitee -- personalizes the invitation email and pre-fills (does
  // not lock) the name field on the accept-invite page. Optional: nothing to attach it to until
  // the admin actually knows who's being invited.
  fullName?: string
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

export interface AssignMemberCustomRoleCommand {
  organizationId: string
  memberUserId: string
  customRoleId: string | null
}

export interface SetMemberModuleAccessCommand {
  organizationId: string
  memberUserId: string
  revoked: boolean
}

export interface UpdateMemberProfileCommand {
  organizationId: string
  memberUserId: string
  // A member can hold one membership per workspace, each with its own profile (department is
  // stored per-membership, not per-user) -- omitting this targets an arbitrary one of the
  // member's memberships in the org, so callers editing a specific workspace's profile should
  // always pass it.
  workspaceId?: string | null
  profile: Record<string, string>
}

export interface UpdateMemberIdentityCommand {
  organizationId: string
  memberUserId: string
  fullName?: string
}

export interface UploadMemberAvatarCommand {
  organizationId: string
  memberUserId: string
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  dataBase64: string
}

export interface SendMemberPasswordResetCommand {
  organizationId: string
  memberUserId: string
}

// Skips the invitation/accept round-trip: the admin vouches for the account directly, so it's
// created active with no email verification step. No `role` field -- new members always start as
// "viewer" here too, matching the invite flow's own DEFAULT_INVITE_ROLE_ID (roles come from teams,
// not from how the member was added).
export interface CreateMemberDirectCommand {
  organizationId: string
  // One real membership is created per workspace here, all under the same new user, in one
  // atomic call -- omitted/empty falls back to the organization's first workspace, same as a
  // single-workspace direct-add always did.
  workspaceIds?: string[]
  email: string
  fullName: string
  password: string
}

export interface SwitchWorkspaceCommand {
  workspaceId: string
}
