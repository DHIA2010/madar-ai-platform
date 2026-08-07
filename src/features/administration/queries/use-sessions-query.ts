import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import type { AdministrationApplicationService } from "@/application"

export function useSessionsQuery(service: AdministrationApplicationService) {
  return useQuery({
    queryKey: administrationQueryKeys.sessions(),
    queryFn: async () => {
      try {
        return await service.getSessions()
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 30,
  })
}
