export interface SubscriptionDto {
  id: string
  status: "trialing" | "active" | "past_due"
  seats: number
  renewsAt: string | null
  plan: {
    id: string
    code: string
    name: string
    tier: "starter" | "growth" | "enterprise"
    workspaceLimit: number
    memberLimit: number
  }
}

// Purely-display org settings with no dedicated column (store name, country) live in the
// backend's free-form organizations.settings jsonb -- never queried/joined elsewhere, so a
// migration wasn't needed to add them.
export interface OrganizationSettingsDto {
  storeName?: string
  country?: string
}

export interface OrganizationDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  settings: OrganizationSettingsDto
  subscription: SubscriptionDto
  status?: "active" | "archived" | "deleted"
}

export interface ConnectedPlatformsCountDto {
  connected: number
  total: number
  userCount: number
}

export interface WorkspaceDto {
  id: string
  organizationId: string
  name: string
  slug: string
  settings: {
    locale: string
    timezone: string
    currency: string
    dateFormat: string
  }
  status?: "active" | "archived"
}

export interface WorkspaceSelectionDto {
  organizationId: string
  workspaceId: string
}

export interface WorkspaceServiceSelectionDto {
  organizationId: string | null
  workspaceId: string | null
}

export interface WorkspaceRepository {
  getOrganizations(): Promise<OrganizationDto[]>
  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]>
  getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null>
  switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto>
  createOrganization(payload: {
    name: string
    metadata?: Record<string, string>
  }): Promise<OrganizationDto>
  updateOrganization(
    organizationId: string,
    payload: {
      name?: string
      currency?: string
      settings?: OrganizationSettingsDto
    }
  ): Promise<OrganizationDto>
  uploadOrganizationLogo(
    organizationId: string,
    payload: { contentType: string; dataBase64: string }
  ): Promise<OrganizationDto>
  getConnectedPlatformsCount(organizationId: string): Promise<ConnectedPlatformsCountDto>
  archiveOrganization(organizationId: string): Promise<OrganizationDto>
  restoreOrganization(organizationId: string): Promise<OrganizationDto>
  createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto>
  updateWorkspace(workspaceId: string, payload: { name?: string }): Promise<WorkspaceDto>
  archiveWorkspace(workspaceId: string): Promise<WorkspaceDto>
  restoreWorkspace(workspaceId: string): Promise<WorkspaceDto>
}

export type WorkspaceGateway = WorkspaceRepository

export interface WorkspaceContextViewModel {
  currentOrganization: OrganizationDto | null
  currentWorkspace: WorkspaceDto | null
  availableOrganizations: OrganizationDto[]
  availableWorkspaces: WorkspaceDto[]
}
