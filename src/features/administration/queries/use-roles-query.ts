import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import type { AdministrationApplicationService } from "@/application"

export function useRolesQuery(
  service: AdministrationApplicationService,
  organizationId: string | null | undefined
) {
  return useQuery({
    queryKey: administrationQueryKeys.roles(organizationId),
    queryFn: async () => {
      try {
        return await service.getRoles({ organizationId: organizationId as string })
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: Boolean(organizationId),
    staleTime: 1000 * 30,
  })
}
