import type {
  ConnectedPlatformsCountDto,
  OrganizationDto,
  OrganizationSettingsDto,
  SubscriptionActivationRequestDto,
  SubscriptionRequestStatus,
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

// Module-level, not per-instance -- mirrors mockOrganizations/mockWorkspaces' own module-level
// mutable-ish mock state, so a request created in one call is still visible to a list call in the
// same mock session. Never persisted beyond the page's lifetime, same as the rest of this file.
let mockSubscriptionRequests: SubscriptionActivationRequestDto[] = []

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
    payload: {
      name?: string
      currency?: string
      timezone?: string
      locale?: string
      settings?: OrganizationSettingsDto
    }
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

  async requestApplicationActivation(
    organizationId: string,
    payload: {
      application: SubscriptionActivationRequestDto["application"]
      planTier: SubscriptionActivationRequestDto["planTier"]
      attachmentContentType: string
      attachmentDataBase64: string
    }
  ): Promise<SubscriptionActivationRequestDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    const now = new Date().toISOString()
    const request: SubscriptionActivationRequestDto = {
      id: `mock-request-${mockSubscriptionRequests.length + 1}`,
      organizationId,
      organizationName: organization.name,
      requestedByUserId: "mock-user",
      application: payload.application,
      planTier: payload.planTier,
      attachmentUrl: `data:${payload.attachmentContentType};base64,${payload.attachmentDataBase64}`,
      attachmentContentType: payload.attachmentContentType,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    }
    mockSubscriptionRequests = [request, ...mockSubscriptionRequests]
    return request
  }

  async listMyOrganizationSubscriptionRequests(
    organizationId: string
  ): Promise<SubscriptionActivationRequestDto[]> {
    await waitForMock()
    return mockSubscriptionRequests.filter((entry) => entry.organizationId === organizationId)
  }

  async listAllSubscriptionActivationRequests(
    status?: SubscriptionRequestStatus
  ): Promise<SubscriptionActivationRequestDto[]> {
    await waitForMock()
    return status
      ? mockSubscriptionRequests.filter((entry) => entry.status === status)
      : mockSubscriptionRequests
  }

  async approveSubscriptionActivationRequest(
    requestId: string
  ): Promise<SubscriptionActivationRequestDto> {
    await waitForMock()
    const request = mockSubscriptionRequests.find((entry) => entry.id === requestId)
    if (!request) {
      throw new Error("Subscription request not found")
    }
    const updated: SubscriptionActivationRequestDto = {
      ...request,
      status: "approved",
      reviewedByUserId: "mock-admin",
      reviewedAt: new Date().toISOString(),
    }
    mockSubscriptionRequests = mockSubscriptionRequests.map((entry) =>
      entry.id === requestId ? updated : entry
    )
    return updated
  }

  async rejectSubscriptionActivationRequest(
    requestId: string,
    reason: string
  ): Promise<SubscriptionActivationRequestDto> {
    await waitForMock()
    const request = mockSubscriptionRequests.find((entry) => entry.id === requestId)
    if (!request) {
      throw new Error("Subscription request not found")
    }
    const updated: SubscriptionActivationRequestDto = {
      ...request,
      status: "rejected",
      reviewedByUserId: "mock-admin",
      reviewedAt: new Date().toISOString(),
      rejectionReason: reason,
    }
    mockSubscriptionRequests = mockSubscriptionRequests.map((entry) =>
      entry.id === requestId ? updated : entry
    )
    return updated
  }

  async restoreOrganization(organizationId: string): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return organization
  }

  async deleteOrganization(organizationId: string): Promise<OrganizationDto> {
    await waitForMock()
    const organization = mockOrganizations.find((entry) => entry.id === organizationId)
    if (!organization) {
      throw new Error("Organization not found")
    }
    return { ...organization, status: "deleted" }
  }

  async updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string
      status?: "active" | "archived"
      metadata?: Record<string, string>
      settings?: Record<string, string | boolean | number>
    }
  ): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return {
      ...workspace,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
      ...(payload.settings !== undefined
        ? { settings: { ...workspace.settings, ...payload.settings } }
        : {}),
    }
  }

  async archiveWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return { ...workspace, status: "archived" }
  }

  async restoreWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    await waitForMock()
    const workspace = findWorkspace(workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }
    return { ...workspace, status: "active" }
  }
}

export function createMockWorkspaceGateway(): WorkspaceGateway {
  return new MockWorkspaceGateway()
}
