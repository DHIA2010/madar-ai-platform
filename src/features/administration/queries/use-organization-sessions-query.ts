import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import type { AdministrationApplicationService } from "@/application"

// Every active member's real sessions, org-wide -- see GET /v1/organizations/:id/sessions and
// IdentityQueryHandlers.getOrganizationSessions. Distinct from useSessionsQuery, which is the
// caller's own sessions only (backed by /v1/auth/session).
export function useOrganizationSessionsQuery(
  service: AdministrationApplicationService,
  organizationId: string | null | undefined
) {
  return useQuery({
    queryKey: administrationQueryKeys.organizationSessions(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      try {
        return await service.getOrganizationSessions({ organizationId: organizationId! })
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 15,
  })
}
