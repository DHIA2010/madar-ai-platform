import { z } from "zod"

export const dashboardPackageQueryDtoSchema = z.object({
  workspaceId: z.string().nullable(),
  permissions: z.array(z.string()),
  featureFlags: z.record(z.string(), z.boolean()),
  role: z.string().nullable(),
})

export const widgetReadModelQuerySchema = z.object({
  widgetId: z.string().min(1),
})
