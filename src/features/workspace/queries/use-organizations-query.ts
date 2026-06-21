import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { workspaceQueryKeys } from "./workspace-query-keys"

import type { WorkspaceApplicationService } from "@/application"

export function useOrganizationsQuery(service: WorkspaceApplicationService) {
  return useQuery({
    queryKey: workspaceQueryKeys.organizations(),
    queryFn: async () => {
      try {
        return await service.getOrganizations()
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}
