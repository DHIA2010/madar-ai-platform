export type WorkspaceStatus = "idle" | "loading" | "ready" | "switching" | "error"

export interface Plan {
  id: string
  code: string
  name: string
  tier: "starter" | "growth" | "enterprise"
  workspaceLimit: number
  memberLimit: number
}

export interface Subscription {
  id: string
  plan: Plan
  status: "trialing" | "active" | "past_due"
  seats: number
  renewsAt: string | null
}

export interface WorkspaceSettings {
  locale: string
  timezone: string
  currency: string
  dateFormat: string
}

// storeName/country are purely-display fields with no dedicated backend column (stored in
// organizations.settings jsonb) -- see OrganizationSettingsDto in
// @/application/contracts/workspace.contracts for the backend-facing equivalent.
export interface OrganizationSettings {
  storeName?: string
  country?: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  settings: OrganizationSettings
  subscription: Subscription
  status?: "active" | "archived" | "deleted"
}

export interface ConnectedPlatformsCount {
  connected: number
  total: number
  userCount: number
}

export interface Workspace {
  id: string
  organizationId: string
  name: string
  slug: string
  settings: WorkspaceSettings
  status?: "active" | "archived"
}

export interface Membership {
  id: string
  userId: string
  organizationId: string
  workspaceId: string
  role: "owner" | "admin" | "member"
}

export interface TenantContext {
  organizationId: string | null
  workspaceId: string | null
  subscription: Subscription | null
  locale: string
  timezone: string
}

export interface WorkspaceContextModel {
  currentOrganization: Organization | null
  currentWorkspace: Workspace | null
  availableOrganizations: Organization[]
  availableWorkspaces: Workspace[]
  tenantContext: TenantContext
  workspaceStatus: WorkspaceStatus
}

export interface WorkspaceSelectionPayload {
  organizationId: string
  workspaceId: string
}

export interface WorkspaceCreatePayload {
  organizationId: string
  name: string
  description: string
  language: string
  timezone: string
}

export interface OrganizationCreatePayload {
  name: string
  businessType: string
  region: string
}

export interface WorkspaceServiceSelection {
  organizationId: string | null
  workspaceId: string | null
}
