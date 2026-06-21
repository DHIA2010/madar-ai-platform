import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import type { DashboardPackageResolverInput } from "../types"
import { dashboardQueryKeys } from "./dashboard-query-keys"

import type { DashboardApplicationService } from "@/application"

interface UseDashboardPackageQueryOptions {
  service: DashboardApplicationService
  input: DashboardPackageResolverInput
}

export function useDashboardPackageQuery({ service, input }: UseDashboardPackageQueryOptions) {
  return useQuery({
    queryKey: dashboardQueryKeys.package(input.workspaceId, input.role),
    queryFn: async () => {
      try {
        return await service.resolveDashboardPackage(input)
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 60,
  })
}
