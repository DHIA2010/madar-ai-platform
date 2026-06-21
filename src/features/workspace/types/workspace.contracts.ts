import type {
  Organization,
  Workspace,
  WorkspaceSelectionPayload,
  WorkspaceServiceSelection,
  WorkspaceSettings,
} from "./workspace.types"

export interface WorkspaceService {
  getOrganizations(): Promise<Organization[]>
  getWorkspaces(organizationId?: string): Promise<Workspace[]>
  getCurrentWorkspace(selection: WorkspaceServiceSelection): Promise<Workspace | null>
  switchWorkspace(payload: WorkspaceSelectionPayload): Promise<Workspace>
  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings>
  updateWorkspaceSettings(
    workspaceId: string,
    payload: WorkspaceSettings
  ): Promise<WorkspaceSettings>
}
