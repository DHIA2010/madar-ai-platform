import type {
  OrganizationDto,
  WorkspaceDto,
  WorkspaceSelectionDto,
  WorkspaceServiceSelectionDto,
} from "@/application/contracts/workspace.contracts"
import type { WorkspaceGateway } from "@/application/contracts/infrastructure.contracts"

import {
  assertValidWorkspaceSelection,
  findWorkspace,
  mockOrganizations,
  mockWorkspaces,
  waitForMock,
} from "../workspace"

export class MockWorkspaceGateway implements WorkspaceGateway {
  async getOrganizations(): Promise<OrganizationDto[]> {
    await waitForMock()
    return mockOrganizations
  }

  async getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    await waitForMock()

    if (!organizationId) {
      return mockWorkspaces
    }

    return mockWorkspaces.filter((workspace) => workspace.organizationId === organizationId)
  }

  async getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null> {
    await waitForMock()

    if (!selection.workspaceId) {
      return null
    }

    const workspace = findWorkspace(selection.workspaceId)
    if (!workspace) {
      return null
    }

    if (selection.organizationId && workspace.organizationId !== selection.organizationId) {
      return null
    }

    return workspace
  }

  async switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    await waitForMock()
    return assertValidWorkspaceSelection(payload)
  }
}

export function createMockWorkspaceGateway(): WorkspaceGateway {
  return new MockWorkspaceGateway()
}
