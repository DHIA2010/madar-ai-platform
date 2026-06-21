import type {
  OrganizationDto,
  WorkspaceDto,
  WorkspaceSelectionDto,
  WorkspaceServiceSelectionDto,
} from "@/application/contracts/workspace.contracts"
import type { ApiClient } from "@/infrastructure/http"

export class WorkspaceApiAdapter {
  constructor(private readonly client: ApiClient) {}

  getOrganizations(): Promise<OrganizationDto[]> {
    return this.client.get<OrganizationDto[]>("/workspaces/organizations")
  }

  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    return this.client.get<WorkspaceDto[]>("/workspaces", {
      query: organizationId ? { organizationId } : undefined,
    })
  }

  getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null> {
    return this.client.get<WorkspaceDto | null>("/workspaces/current", {
      query: {
        organizationId: selection.organizationId ?? undefined,
        workspaceId: selection.workspaceId ?? undefined,
      },
    })
  }

  switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    return this.client.post<WorkspaceSelectionDto, WorkspaceDto>("/workspaces/switch", payload)
  }
}
