import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import type { Session } from "../types"
import { authQueryKeys } from "./auth-query-keys"

import type { AuthenticationApplicationService } from "@/application"

interface UseCurrentUserQueryOptions {
  service: AuthenticationApplicationService
  session: Session | null
  enabled?: boolean
}

export function useCurrentUserQuery({
  service,
  session,
  enabled = true,
}: UseCurrentUserQueryOptions) {
  return useQuery({
    queryKey: authQueryKeys.currentUser(),
    queryFn: async () => {
      try {
        return { user: await service.getCurrentUser(session) }
      } catch (error) {
        throw toAppError(error)
      }
    },
    enabled,
    staleTime: 1000 * 60,
    retry: false,
  })
}
