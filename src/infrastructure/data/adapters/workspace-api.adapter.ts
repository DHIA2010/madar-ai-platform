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
    return this.client
      .get<{ items: OrganizationDto[] }>("/v1/organizations")
      .then((response) => response.items)
  }

  getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    return this.client
      .get<{ items: Array<{ workspace: WorkspaceDto }> }>("/v1/workspaces")
      .then((response) => response.items.map((item) => item.workspace))
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
}
