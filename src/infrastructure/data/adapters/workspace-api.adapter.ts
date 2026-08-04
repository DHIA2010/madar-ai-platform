import type {
  OrganizationDto,
  WorkspaceDto,
  WorkspaceSelectionDto,
  WorkspaceServiceSelectionDto,
} from "@/application/contracts/workspace.contracts"
import type { ApiClient } from "@/infrastructure/http"

interface RawOrganization {
  id: string
  name: string
  subscriptionReference?: string | null
  status?: "active" | "archived" | "deleted"
}

interface RawWorkspace {
  id: string
  organizationId: string
  name: string
  settings?: Record<string, unknown>
  status?: "active" | "archived"
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// The backend's organization/workspace records don't carry slug or
// subscription data -- those are frontend-only display concepts, so they're
// synthesized here rather than sent to or expected from the API.
function toOrganizationDto(raw: RawOrganization): OrganizationDto {
  return {
    id: raw.id,
    name: raw.name,
    slug: slugify(raw.name) || raw.id,
    subscription: {
      id: raw.subscriptionReference ?? raw.id,
      status: "active",
      seats: 1,
      renewsAt: null,
      plan: {
        id: "default",
        code: "default",
        name: "Default",
        tier: "starter",
        workspaceLimit: 25,
        memberLimit: 100,
      },
    },
    status: raw.status,
  }
}

function toWorkspaceDto(raw: RawWorkspace): WorkspaceDto {
  const settings = raw.settings ?? {}
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    name: raw.name,
    slug: slugify(raw.name) || raw.id,
    settings: {
      locale: typeof settings.locale === "string" ? settings.locale : "en-US",
      timezone: typeof settings.timezone === "string" ? settings.timezone : "UTC",
      currency: typeof settings.currency === "string" ? settings.currency : "USD",
      dateFormat: typeof settings.dateFormat === "string" ? settings.dateFormat : "dd/MM/yyyy",
    },
    status: raw.status,
  }
}

export class WorkspaceApiAdapter {
  constructor(private readonly client: ApiClient) {}

  getOrganizations(): Promise<OrganizationDto[]> {
    return this.client
      .get<{ items: OrganizationDto[] }>("/v1/organizations")
      .then((response) => response.items)
  }

  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    return this.client
      .get<{ items: Array<{ workspace: WorkspaceDto }> }>("/v1/workspaces")
      .then((response) => {
        const workspaces = response.items.map((item) => item.workspace)
        return organizationId
          ? workspaces.filter((workspace) => workspace.organizationId === organizationId)
          : workspaces
      })
  }

  getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null> {
    return this.client
      .get<{ items: Array<{ workspace: WorkspaceDto }> }>("/v1/workspaces")
      .then((response) => {
        const workspaces = response.items.map((item) => item.workspace)

        if (selection.workspaceId) {
          return workspaces.find((workspace) => workspace.id === selection.workspaceId) ?? null
        }

        if (selection.organizationId) {
          return (
            workspaces.find((workspace) => workspace.organizationId === selection.organizationId) ??
            null
          )
        }

        return workspaces[0] ?? null
      })
  }

  switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    return this.client
      .get<{ items: Array<{ workspace: WorkspaceDto }> }>("/v1/workspaces")
      .then((response) => {
        const workspaces = response.items.map((item) => item.workspace)
        const selectedWorkspace =
          workspaces.find((workspace) => workspace.id === payload.workspaceId) ??
          workspaces.find((workspace) => workspace.organizationId === payload.organizationId)

        if (!selectedWorkspace) {
          throw new Error("Workspace not found")
        }

        return selectedWorkspace
      })
  }

  createOrganization(payload: {
    name: string
    metadata?: Record<string, string>
  }): Promise<OrganizationDto> {
    return this.client
      .post<typeof payload, RawOrganization>("/v1/organizations", payload)
      .then(toOrganizationDto)
  }

  updateOrganization(organizationId: string, payload: { name?: string }): Promise<OrganizationDto> {
    return this.client
      .patch<{ name?: string }, RawOrganization>(`/v1/organizations/${organizationId}`, payload)
      .then(toOrganizationDto)
  }

  archiveOrganization(organizationId: string): Promise<OrganizationDto> {
    return this.client
      .post<
        Record<string, never>,
        RawOrganization
      >(`/v1/organizations/${organizationId}/archive`, {})
      .then(toOrganizationDto)
  }

  restoreOrganization(organizationId: string): Promise<OrganizationDto> {
    return this.client
      .post<
        Record<string, never>,
        RawOrganization
      >(`/v1/organizations/${organizationId}/restore`, {})
      .then(toOrganizationDto)
  }

  createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto> {
    return this.client
      .post<typeof payload, RawWorkspace>("/v1/workspaces", payload)
      .then(toWorkspaceDto)
  }

  updateWorkspace(workspaceId: string, payload: { name?: string }): Promise<WorkspaceDto> {
    return this.client
      .patch<{ name?: string }, RawWorkspace>(`/v1/workspaces/${workspaceId}`, payload)
      .then(toWorkspaceDto)
  }

  archiveWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    return this.client
      .post<Record<string, never>, RawWorkspace>(`/v1/workspaces/${workspaceId}/archive`, {})
      .then(toWorkspaceDto)
  }

  restoreWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    return this.client
      .post<Record<string, never>, RawWorkspace>(`/v1/workspaces/${workspaceId}/restore`, {})
      .then(toWorkspaceDto)
  }
}
