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
  // Account identity as it appears on invoices and official documents.
  commercialRegistration?: string
  taxNumber?: string
  phone?: string
  email?: string
  website?: string
  // Saudi National Address, the format ZATCA expects on an invoice.
  addressShort?: string
  buildingNumber?: string
  street?: string
  secondaryNumber?: string
  district?: string
  postalCode?: string
  city?: string
  // Stored preference only -- see the notifications section in SettingsDashboard.
  notifyEmail?: boolean
}

export interface OrganizationDto {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  // Real columns the API has always returned; they were simply never declared here, so nothing
  // downstream could read them. timezone and locale are both writable via PATCH.
  timezone?: string
  locale?: string
  createdAt?: string
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
  // A real backend column (workspaces.metadata jsonb, migration 002) with no fixed shape --
  // branch-management fields (city, address, district, phone, email, code, managerId,
  // managerName, openedAt) live here rather than in dedicated columns, the same way
  // OrganizationSettingsDto's fields live in organizations.settings.
  metadata?: Record<string, string>
  createdAt?: string
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
      timezone?: string
      locale?: string
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
  // Soft delete (POST /v1/organizations/:id/delete): the record is marked deleted and becomes
  // unwritable, it is not erased.
  deleteOrganization(organizationId: string): Promise<OrganizationDto>
  createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto>
  updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string
      status?: "active" | "archived"
      metadata?: Record<string, string>
      settings?: Record<string, string | boolean | number>
    }
  ): Promise<WorkspaceDto>
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
