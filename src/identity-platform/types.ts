export type Role = "owner" | "admin" | "manager" | "analyst" | "viewer"

export type Permission =
  | "org:read"
  | "org:write"
  | "org:invite"
  | "workspace:read"
  | "workspace:write"
  | "workspace:switch"
  | "membership:write"
  | "session:read"
  | "session:revoke"
  | "identity:read"
  | "identity:write"

export type UserProfile = import("./domain/entities").UserState
export type Organization = import("./domain/entities").OrganizationState
export type Workspace = import("./domain/entities").WorkspaceState
export type Membership = import("./domain/entities").MembershipState
export type SessionRecord = import("./domain/entities").SessionState
export type EmailVerificationToken = import("./domain/entities").EmailVerificationState
export type PasswordResetToken = import("./domain/entities").PasswordResetState
export type AuditLogEntry = import("./domain/entities").AuditLogState
export type RequestContext = import("./application/dto/identity-dtos").RequestContext
export type TokenPair = import("./application/dto/identity-dtos").TokenPair
