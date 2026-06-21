import { ValidationError } from "@/lib/app-errors"

import type { WorkspaceService, WorkspaceSettings } from "../types"

import { findWorkspace, MockWorkspaceGateway, waitForMock } from "@/infrastructure"

export class MockWorkspaceService extends MockWorkspaceGateway implements WorkspaceService {
  async getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
    await waitForMock()

    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new ValidationError({
        code: "workspace_not_found",
        message: "Workspace settings could not be loaded.",
      })
    }

    return workspace.settings
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    payload: WorkspaceSettings
  ): Promise<WorkspaceSettings> {
    await waitForMock()

    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new ValidationError({
        code: "workspace_not_found",
        message: "Workspace settings could not be updated.",
      })
    }

    workspace.settings = {
      ...payload,
    }

    return workspace.settings
  }
}

export function createMockWorkspaceService(): WorkspaceService {
  return new MockWorkspaceService()
}
