import { type AppError, toAppError } from "@/lib/app-errors"
import { failure, type Result, success } from "@/lib/result"

import type { DashboardPackage, DashboardPackageResolverInput, DashboardService } from "../types"

interface DashboardCommands {
  resolvePackage: (
    input: DashboardPackageResolverInput
  ) => Promise<Result<DashboardPackage, AppError>>
}

export function createDashboardCommands(service: DashboardService): DashboardCommands {
  return {
    resolvePackage: async (input) => {
      try {
        return success(await service.resolvePackage(input))
      } catch (error) {
        return failure(toAppError(error))
      }
    },
  }
}
