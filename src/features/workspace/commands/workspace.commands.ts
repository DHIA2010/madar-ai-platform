import { type AppError, toAppError } from "@/lib/app-errors"
import { failure, type Result, success } from "@/lib/result"

import type {
  Workspace,
  WorkspaceSelectionPayload,
  WorkspaceService,
  WorkspaceSettings,
} from "../types"
import { workspaceSelectionSchema, workspaceSettingsSchema } from "../validators"

interface WorkspaceCommands {
  switchWorkspace: (payload: WorkspaceSelectionPayload) => Promise<Result<Workspace, AppError>>
  updateWorkspaceSettings: (
    workspaceId: string,
    payload: WorkspaceSettings
  ) => Promise<Result<WorkspaceSettings, AppError>>
}

export function createWorkspaceCommands(service: WorkspaceService): WorkspaceCommands {
  return {
    switchWorkspace: async (payload) => {
      try {
        const validatedPayload = workspaceSelectionSchema.parse(payload)
        const workspace = await service.switchWorkspace(validatedPayload)
        return success(workspace)
      } catch (error) {
        return failure(toAppError(error))
      }
    },

    updateWorkspaceSettings: async (workspaceId, payload) => {
      try {
        const validatedPayload = workspaceSettingsSchema.parse(payload)
        const settings = await service.updateWorkspaceSettings(workspaceId, validatedPayload)
        return success(settings)
      } catch (error) {
        return failure(toAppError(error))
      }
    },
  }
}
