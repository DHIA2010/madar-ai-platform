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

export interface OrganizationDto {
  id: string
  name: string
  slug: string
  subscription: SubscriptionDto
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
}

export type WorkspaceGateway = WorkspaceRepository

export interface WorkspaceContextViewModel {
  currentOrganization: OrganizationDto | null
  currentWorkspace: WorkspaceDto | null
  availableOrganizations: OrganizationDto[]
  availableWorkspaces: WorkspaceDto[]
}
