import { z } from "zod"

export const workspaceSelectionDtoSchema = z.object({
  organizationId: z.string().min(1),
  workspaceId: z.string().min(1),
})

export const workspaceServiceSelectionDtoSchema = z.object({
  organizationId: z.string().nullable(),
  workspaceId: z.string().nullable(),
})
