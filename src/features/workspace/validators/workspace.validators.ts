import { z } from "zod"

export const workspaceSelectionSchema = z.object({
  organizationId: z.string().trim().min(1, "Organization is required."),
  workspaceId: z.string().trim().min(1, "Workspace is required."),
})

export const workspaceSettingsSchema = z.object({
  locale: z.string().trim().min(2, "Locale is required."),
  timezone: z.string().trim().min(2, "Timezone is required."),
  currency: z.string().trim().min(3, "Currency is required."),
  dateFormat: z.string().trim().min(2, "Date format is required."),
})

export type WorkspaceSelectionValues = z.infer<typeof workspaceSelectionSchema>
export type WorkspaceSettingsValues = z.infer<typeof workspaceSettingsSchema>
