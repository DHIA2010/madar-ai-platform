import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import type { AdministrationApplicationService } from "@/application"

export function useTeamMembersQuery(
  service: AdministrationApplicationService,
  teamId: string | null | undefined
) {
  return useQuery({
    queryKey: administrationQueryKeys.teamMembers(teamId),
    queryFn: async () => {
      try {
        return await service.getTeamMembers({ teamId: teamId as string })
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled: Boolean(teamId),
    staleTime: 1000 * 30,
  })
}
