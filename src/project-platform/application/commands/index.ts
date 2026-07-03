import type { DataSourceType, ProjectEnvironment, ProjectRole } from "../../types"

export interface CreateProjectCommand {
  organizationId: string
  workspaceId?: string | null
  name: string
  metadata?: Record<string, string>
  branding?: Record<string, string>
  logoUrl?: string | null
  timezone?: string
  currency?: string
  locale?: string
  environment?: ProjectEnvironment
  settings?: Record<string, string | number | boolean>
  retentionPolicy?: string | null
  defaultDashboard?: string | null
  notificationPreferences?: Record<string, string | number | boolean>
  featureFlags?: Record<string, boolean>
  connectorPreferences?: Record<string, string | number | boolean>
}

export interface UpdateProjectCommand extends Partial<Omit<CreateProjectCommand, "organizationId">> {
  status?: "active" | "archived" | "deleted"
}

export interface CreateProjectDataSourceCommand {
  projectId: string
  name: string
  type: DataSourceType
  metadata?: Record<string, string | number | boolean>
  futureOauthReady?: boolean
  connectionReference?: string | null
}

export interface UpdateProjectDataSourceCommand {
  name?: string
  type?: DataSourceType
  metadata?: Record<string, string | number | boolean>
  validationStatus?: "pending" | "valid" | "invalid"
  healthStatus?: "healthy" | "degraded" | "unhealthy" | "unknown"
  syncStatus?: "idle" | "syncing" | "failed" | "disabled" | "pending"
  connectionStatus?: "connected" | "disconnected" | "pending" | "error" | "not_applicable"
  futureOauthReady?: boolean
  connectionReference?: string | null
  status?: "draft" | "enabled" | "disabled" | "archived" | "deleted"
}

export interface InviteProjectMemberCommand {
  projectId: string
  email: string
  role: ProjectRole
  idempotencyKey?: string
  workspaceId?: string | null
}

export interface AddProjectMemberCommand {
  projectId: string
  userId: string
  organizationRole: ProjectRole
  projectRole: ProjectRole
  permissions?: Record<string, boolean>
}

export interface UpdateProjectMemberRoleCommand {
  projectId: string
  userId: string
  role: ProjectRole
}

export interface SuspendProjectMemberCommand {
  projectId: string
  userId: string
  reason: string
}

export interface RemoveProjectMemberCommand {
  projectId: string
  userId: string
  reason: string
}

export interface AcceptProjectInvitationCommand {
  token: string
}

export interface DeclineProjectInvitationCommand {
  token: string
}

export interface CancelProjectInvitationCommand {
  invitationId: string
}

export interface ResendProjectInvitationCommand {
  invitationId: string
}
