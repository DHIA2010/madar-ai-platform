import type { WorkspaceRepository } from "@/application/contracts/infrastructure.contracts"
import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"
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
import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

import { RepositoryCache, createWorkspaceCacheKey } from "../cache/repository-cache"
import { mapRepositoryError } from "../errors"
import { WorkspaceApiAdapter } from "../adapters/workspace-api.adapter"
import { createHttpDataClient } from "../api/http-data-client"
import { resolveRepositoryBackend } from "./repository-runtime"

export class DataWorkspaceRepository implements WorkspaceRepository {
  private readonly cache = new RepositoryCache(120_000)
  private readonly adapter: WorkspaceApiAdapter

  constructor(options?: {
    getSession?: () => AuthSessionDto | null
    getWorkspaceId?: () => string | null
  }) {
    this.adapter = new WorkspaceApiAdapter(createHttpDataClient(options))
  }

  private async getMockGateway() {
    const { MockWorkspaceGateway } = await import("@/infrastructure/mock/mock-workspace.gateway")
    return new MockWorkspaceGateway()
  }

  private resolveBackend() {
    const env = getClientEnvironment()
    if (env.APP_RUNTIME_MODE === "mock") {
      return "mock" as const
    }

    return resolveRepositoryBackend("workspace")
  }

  async getOrganizations(): Promise<OrganizationDto[]> {
    const cacheKey = createWorkspaceCacheKey("workspace", null, "organizations")
    const cached = this.cache.get<OrganizationDto[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.getOrganizations()
        return this.cache.set(cacheKey, dto)
      }

      const dto = await this.adapter.getOrganizations()
      return this.cache.set(cacheKey, dto)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getWorkspaces(organizationId?: string): Promise<WorkspaceDto[]> {
    const scope = organizationId ?? "all"
    const cacheKey = createWorkspaceCacheKey(
      "workspace",
      organizationId ?? null,
      `workspaces:${scope}`
    )
    const cached = this.cache.get<WorkspaceDto[]>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.getWorkspaces(organizationId)
        return this.cache.set(cacheKey, dto)
      }

      const dto = await this.adapter.getWorkspaces(organizationId)
      return this.cache.set(cacheKey, dto)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getCurrentWorkspace(selection: WorkspaceServiceSelectionDto): Promise<WorkspaceDto | null> {
    const cacheKey = createWorkspaceCacheKey("workspace", selection.workspaceId, "current")
    const cached = this.cache.get<WorkspaceDto | null>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.getCurrentWorkspace(selection)
        return this.cache.set(cacheKey, dto)
      }

      const dto = await this.adapter.getCurrentWorkspace(selection)
      return this.cache.set(cacheKey, dto)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async switchWorkspace(payload: WorkspaceSelectionDto): Promise<WorkspaceDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.switchWorkspace(payload)
        this.cache.invalidateWorkspace(payload.workspaceId)
        return dto
      }

      const dto = await this.adapter.switchWorkspace(payload)
      this.cache.invalidateWorkspace(payload.workspaceId)
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async createOrganization(payload: {
    name: string
    metadata?: Record<string, string>
  }): Promise<OrganizationDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.createOrganization(payload)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.createOrganization(payload)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async createWorkspace(payload: {
    organizationId: string
    name: string
    metadata?: Record<string, string>
    settings?: Record<string, string | boolean | number>
  }): Promise<WorkspaceDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.createWorkspace(payload)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.createWorkspace(payload)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
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
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.updateOrganization(organizationId, payload)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.updateOrganization(organizationId, payload)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async uploadOrganizationLogo(
    organizationId: string,
    payload: { contentType: string; dataBase64: string }
  ): Promise<OrganizationDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.uploadOrganizationLogo(organizationId, payload)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.uploadOrganizationLogo(organizationId, payload)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getConnectedPlatformsCount(organizationId: string): Promise<ConnectedPlatformsCountDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.getConnectedPlatformsCount(organizationId)
      }

      return await this.adapter.getConnectedPlatformsCount(organizationId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
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
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.requestApplicationActivation(organizationId, payload)
      }

      return await this.adapter.requestApplicationActivation(organizationId, payload)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async listMyOrganizationSubscriptionRequests(
    organizationId: string
  ): Promise<SubscriptionActivationRequestDto[]> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.listMyOrganizationSubscriptionRequests(organizationId)
      }

      return await this.adapter.listMyOrganizationSubscriptionRequests(organizationId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async listAllSubscriptionActivationRequests(
    status?: SubscriptionRequestStatus
  ): Promise<SubscriptionActivationRequestDto[]> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.listAllSubscriptionActivationRequests(status)
      }

      return await this.adapter.listAllSubscriptionActivationRequests(status)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async approveSubscriptionActivationRequest(
    requestId: string
  ): Promise<SubscriptionActivationRequestDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.approveSubscriptionActivationRequest(requestId)
      }

      return await this.adapter.approveSubscriptionActivationRequest(requestId)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async rejectSubscriptionActivationRequest(
    requestId: string,
    reason: string
  ): Promise<SubscriptionActivationRequestDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        return await mockGateway.rejectSubscriptionActivationRequest(requestId, reason)
      }

      return await this.adapter.rejectSubscriptionActivationRequest(requestId, reason)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async archiveOrganization(organizationId: string): Promise<OrganizationDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.archiveOrganization(organizationId)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.archiveOrganization(organizationId)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async restoreOrganization(organizationId: string): Promise<OrganizationDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.restoreOrganization(organizationId)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.restoreOrganization(organizationId)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async deleteOrganization(organizationId: string): Promise<OrganizationDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.deleteOrganization(organizationId)
        this.cache.clear()
        return dto
      }

      const dto = await this.adapter.deleteOrganization(organizationId)
      this.cache.clear()
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
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
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.updateWorkspace(workspaceId, payload)
        this.cache.invalidateWorkspace(workspaceId)
        return dto
      }

      const dto = await this.adapter.updateWorkspace(workspaceId, payload)
      this.cache.invalidateWorkspace(workspaceId)
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async archiveWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.archiveWorkspace(workspaceId)
        this.cache.invalidateWorkspace(workspaceId)
        return dto
      }

      const dto = await this.adapter.archiveWorkspace(workspaceId)
      this.cache.invalidateWorkspace(workspaceId)
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async restoreWorkspace(workspaceId: string): Promise<WorkspaceDto> {
    try {
      if (this.resolveBackend() === "mock") {
        const mockGateway = await this.getMockGateway()
        const dto = await mockGateway.restoreWorkspace(workspaceId)
        this.cache.invalidateWorkspace(workspaceId)
        return dto
      }

      const dto = await this.adapter.restoreWorkspace(workspaceId)
      this.cache.invalidateWorkspace(workspaceId)
      return dto
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }
}

export function createWorkspaceRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): WorkspaceRepository {
  return new DataWorkspaceRepository(options)
}
