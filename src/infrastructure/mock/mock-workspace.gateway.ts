import type {
  ConnectedPlatformsCountDto,
  OrganizationDto,
  OrganizationSettingsDto,
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

  async createOrganization(payload: {
    name: string
    metadata?: Record<string, string>
  }): Promise<OrganizationDto> {
    await waitForMock()
    return {
      id: crypto.randomUUID(),
      name: payload.name,
      slug: payload.name.trim().toLowerCase().replace(/\s+/g, "-"),
      logoUrl: null,
      currency: "SAR",
      settings: {},
      subscription: {
        id: crypto.randomUUID(),
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
    }
  }

  async createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto> {
    await waitForMock()
    return {
      id: crypto.randomUUID(),
      organizationId: payload.organizationId,
      name: payload.name,
      slug: payload.name.trim().toLowerCase().replace(/\s+/g, "-"),
      settings: {
        locale: "en-US",
        timezone: "UTC",
        currency: "USD",
        dateFormat: "dd/MM/yyyy",
      },
    }
  }

  async updateOrganization(
    organizationId: string,
    payload: { name?: string; currency?: string; settings?: OrganizationSettingsDto }
  ): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return {
      ...organization,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.currency !== undefined ? { currency: payload.currency } : {}),
      ...(payload.settings !== undefined
        ? { settings: { ...organization.settings, ...payload.settings } }
        : {}),
    }
  }

  async uploadOrganizationLogo(
    organizationId: string,
    payload: { contentType: string; dataBase64: string }
  ): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return { ...organization, logoUrl: `data:${payload.contentType};base64,${payload.dataBase64}` }
  }

  async getConnectedPlatformsCount(organizationId: string): Promise<ConnectedPlatformsCountDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return { connected: 0, total: 8, userCount: 1 }
  }

  async archiveOrganization(organizationId: string): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return organization
  }

  async restoreOrganization(organizationId: string): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return organization
  }

  async updateWorkspace(workspaceId: string, payload: { name?: string }): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return { ...workspace, ...(payload.name !== undefined ? { name: payload.name } : {}) }
  }

  async archiveWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return workspace
  }

  async restoreWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return workspace
  }
}

export function createMockWorkspaceGateway(): WorkspaceGateway {
  return new MockWorkspaceGateway()
}
