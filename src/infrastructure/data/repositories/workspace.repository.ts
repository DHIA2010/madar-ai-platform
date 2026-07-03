import type { WorkspaceRepository } from "@/application/contracts/infrastructure.contracts"
import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"
import type {
  OrganizationDto,
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
}

export function createWorkspaceRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): WorkspaceRepository {
  return new DataWorkspaceRepository(options)
}
