import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { workspaceQueryKeys } from "./workspace-query-keys"

import type { WorkspaceApplicationService } from "@/application"

interface UseWorkspacesQueryOptions {
  service: WorkspaceApplicationService
  organizationId?: string
}

export function useWorkspacesQuery({ service, organizationId }: UseWorkspacesQueryOptions) {
  return useQuery({
    queryKey: workspaceQueryKeys.workspaces(organizationId),
    queryFn: async () => {
      try {
        return await service.getWorkspaces(organizationId)
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
