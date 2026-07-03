import { ValidationError } from "@/lib/app-errors"

import type {
  Organization,
  Workspace,
  WorkspaceSelectionPayload,
  WorkspaceService,
  WorkspaceServiceSelection,
  WorkspaceSettings,
} from "../types"

const mockOrganizations: Organization[] = [
  {
    id: "org_madar",
    name: "MADAR",
    slug: "madar",
    subscription: {
      id: "sub_madar",
      plan: {
        id: "plan_growth",
        code: "growth",
        name: "Growth",
        tier: "growth",
        workspaceLimit: 10,
        memberLimit: 50,
      },
      status: "active",
      seats: 5,
      renewsAt: null,
    },
  },
]

const mockWorkspaces = new Map<string, Workspace>([
  [
    "workspace_madar",
    {
      id: "workspace_madar",
      organizationId: "org_madar",
      name: "MADAR Main",
      slug: "madar-main",
      settings: {
        locale: "en",
        timezone: "Asia/Riyadh",
        currency: "SAR",
        dateFormat: "dd/MM/yyyy",
      },
    },
  ],
])

function waitForMock() {
  return Promise.resolve()
}

function findWorkspace(workspaceId: string) {
  return mockWorkspaces.get(workspaceId) ?? null
}

function assertValidWorkspaceSelection(payload: WorkspaceSelectionPayload) {
  const workspace = findWorkspace(payload.workspaceId)
  if (!workspace || workspace.organizationId !== payload.organizationId) {
    throw new ValidationError({
      code: "workspace_not_found",
      message: "Workspace could not be selected.",
    })
  }

  return workspace
}

export class MockWorkspaceService implements WorkspaceService {
  async getOrganizations(): Promise<Organization[]> {
    await waitForMock()
    return mockOrganizations
  }

  async getWorkspaces(organizationId?: string): Promise<Workspace[]> {
    await waitForMock()

    if (!organizationId) {
      return [...mockWorkspaces.values()]
    }

    return [...mockWorkspaces.values()].filter(
      (workspace) => workspace.organizationId === organizationId
    )
  }

  async getCurrentWorkspace(selection: WorkspaceServiceSelection): Promise<Workspace | null> {
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

  async switchWorkspace(payload: WorkspaceSelectionPayload): Promise<Workspace> {
    await waitForMock()
    return assertValidWorkspaceSelection(payload)
  }

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
