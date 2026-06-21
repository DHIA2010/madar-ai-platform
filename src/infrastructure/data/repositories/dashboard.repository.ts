import type {
  DashboardPackageDto,
  DashboardPackageQueryDto,
  DashboardWidgetReadModelPayload,
} from "@/application/contracts/dashboard.contracts"
import type { DashboardRepository } from "@/application/contracts/infrastructure.contracts"

import {
  dashboardWidgetPayloadDtos,
  marketingDashboardPackageDto,
} from "@/infrastructure/dashboard"
import type { AuthSessionDto } from "@/application/contracts/authentication.contracts"

import { createWorkspaceCacheKey, RepositoryCache } from "../cache/repository-cache"
import { mapRepositoryError } from "../errors"
import { serializeFilters } from "../serializers/query-serializer"
import { DashboardApiAdapter } from "../adapters/dashboard-api.adapter"
import { createHttpDataClient } from "../api/http-data-client"
import { resolveRepositoryBackend } from "./repository-runtime"

const DASHBOARD_NAMESPACE = "dashboard"

export class DataDashboardRepository implements DashboardRepository {
  private readonly cache = new RepositoryCache(60_000)
  private readonly adapter: DashboardApiAdapter

  constructor(options?: {
    getSession?: () => AuthSessionDto | null
    getWorkspaceId?: () => string | null
  }) {
    this.adapter = new DashboardApiAdapter(createHttpDataClient(options))
  }

  async resolvePackage(input: DashboardPackageQueryDto): Promise<DashboardPackageDto> {
    const cacheKey = createWorkspaceCacheKey(DASHBOARD_NAMESPACE, input.workspaceId, "package")
    const cached = this.cache.get<DashboardPackageDto>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const backend = resolveRepositoryBackend("dashboard")
      if (backend === "mock") {
        return this.cache.set(cacheKey, marketingDashboardPackageDto, {
          tags: [`workspace:${input.workspaceId ?? "global"}`],
        })
      }

      const dto = await this.adapter.resolvePackage({
        workspaceId: input.workspaceId,
        role: input.role,
        permissions: input.permissions.join(","),
        ...serializeFilters(
          Object.entries(input.featureFlags).map(([field, value]) => ({
            field,
            operator: "eq",
            value,
          }))
        ),
      })

      return this.cache.set(cacheKey, dto, {
        tags: [`workspace:${input.workspaceId ?? "global"}`],
      })
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  async getWidgetReadModel(widgetId: string): Promise<DashboardWidgetReadModelPayload | null> {
    const cacheKey = `${DASHBOARD_NAMESPACE}:widget:${widgetId}`
    const cached = this.cache.get<DashboardWidgetReadModelPayload | null>(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const backend = resolveRepositoryBackend("dashboard")
      if (backend === "mock") {
        const dto = dashboardWidgetPayloadDtos[widgetId] ?? null
        return this.cache.set(cacheKey, dto)
      }

      const dto = await this.adapter.getWidgetReadModel(widgetId)
      return this.cache.set(cacheKey, dto)
    } catch (error) {
      throw mapRepositoryError(error)
    }
  }

  invalidateWorkspace(workspaceId: string | null | undefined) {
    this.cache.invalidateWorkspace(workspaceId)
  }
}

export function createDashboardRepository(options?: {
  getSession?: () => AuthSessionDto | null
  getWorkspaceId?: () => string | null
}): DashboardRepository {
  return new DataDashboardRepository(options)
}
