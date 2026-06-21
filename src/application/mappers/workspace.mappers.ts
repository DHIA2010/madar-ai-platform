import type { OrganizationDto, WorkspaceContextViewModel, WorkspaceDto } from "../contracts"
import { createReadModel } from "../read-models"

export function mapWorkspaceContextDtoToReadModel(payload: WorkspaceContextViewModel) {
  return createReadModel({
    id: `workspace-context:${payload.currentWorkspace?.id ?? "none"}`,
    owner: "workspace",
    sourceDomains: ["workspace"],
    payload,
  })
}

export function mapWorkspaceContextReadModelToViewModel(
  readModel: ReturnType<typeof mapWorkspaceContextDtoToReadModel>
): WorkspaceContextViewModel {
  return {
    currentOrganization: readModel.payload.currentOrganization
      ? { ...readModel.payload.currentOrganization }
      : null,
    currentWorkspace: readModel.payload.currentWorkspace
      ? { ...readModel.payload.currentWorkspace }
      : null,
    availableOrganizations: readModel.payload.availableOrganizations.map((organization) => ({
      ...organization,
    })) as OrganizationDto[],
    availableWorkspaces: readModel.payload.availableWorkspaces.map((workspace) => ({
      ...workspace,
    })) as WorkspaceDto[],
  }
}
