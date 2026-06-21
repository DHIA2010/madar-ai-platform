import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { workspaceQueryKeys } from "./workspace-query-keys"

import type { WorkspaceApplicationService } from "@/application"

interface UseCurrentWorkspaceQueryOptions {
  service: WorkspaceApplicationService
  organizationId: string | null
  workspaceId: string | null
}

export function useCurrentWorkspaceQuery({
  service,
  organizationId,
  workspaceId,
}: UseCurrentWorkspaceQueryOptions) {
  return useQuery({
    queryKey: workspaceQueryKeys.currentWorkspace(
      organizationId ?? undefined,
      workspaceId ?? undefined
    ),
    queryFn: async () => {
      try {
        return await service.getCurrentWorkspace({ organizationId, workspaceId })
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: Boolean(organizationId && workspaceId),
    staleTime: 1000 * 60,
    retry: false,
  })
}
