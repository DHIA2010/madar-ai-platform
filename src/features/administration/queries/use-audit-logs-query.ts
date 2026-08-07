import { useQuery } from "@tanstack/react-query"

import { toAppError } from "@/lib/app-errors"

import { administrationQueryKeys } from "./administration-query-keys"

import type { AdministrationApplicationService } from "@/application"

export function useAuditLogsQuery(
  service: AdministrationApplicationService,
  page = 1,
  pageSize = 50
) {
  return useQuery({
    queryKey: administrationQueryKeys.auditLogs(page, pageSize),
    queryFn: async () => {
      try {
        return await service.getAuditLogs({ page, pageSize })
      } catch (error) {
        throw toAppError(error)
      }
    },
    staleTime: 1000 * 30,
  })
}
