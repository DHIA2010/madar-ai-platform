import { z } from "zod"

import {
  DASHBOARD_REFRESH_REASONS,
  DASHBOARD_WIDGET_SLOTS,
  DASHBOARD_WIDGET_STATES,
} from "../constants"

export const widgetResponsiveBehaviorSchema = z.object({
  mobile: z.number().int().min(1).max(12),
  tablet: z.number().int().min(1).max(12).optional(),
  desktop: z.number().int().min(1).max(12).optional(),
  tabletBreakpoint: z.enum(["md", "lg"]).optional(),
  desktopBreakpoint: z.literal("xl").optional(),
  utilityClassName: z.string().optional(),
})

export const widgetManifestSchema = z.object({
  metadata: z.object({
    widgetId: z.string().min(1),
    displayName: z.string().min(1),
    category: z.string().min(1),
    version: z.string().min(1),
    owner: z.string().min(1),
    businessQuestion: z.string().min(1),
  }),
  permissions: z.array(z.string()),
  featureFlags: z.array(z.string()),
  dashboardAvailability: z.array(z.string().min(1)),
  contracts: z.object({
    readModel: z.string().min(1),
    propsContract: z.literal("none"),
    stateContract: z.array(z.enum(DASHBOARD_WIDGET_STATES)).min(1),
  }),
  loadingStrategy: z.object({
    strategy: z.literal("lazy"),
    suspense: z.boolean(),
    fallbackVariant: z.enum(["card", "chart", "table"]),
    fallbackHeight: z.number().positive(),
  }),
  refreshStrategy: z.object({
    strategy: z.enum(["manual", "event-driven"]),
    triggers: z.array(z.enum(DASHBOARD_REFRESH_REASONS)).min(1),
    intervalMs: z.number().positive().optional(),
  }),
  sizing: z.object({
    defaultSize: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }),
  }),
  responsiveBehavior: widgetResponsiveBehaviorSchema,
})

export const dashboardLayoutItemSchema = z.object({
  widgetId: z.string().min(1),
  zone: z.enum(DASHBOARD_WIDGET_SLOTS),
  order: z.number().int().nonnegative(),
  responsive: widgetResponsiveBehaviorSchema,
})

export type WidgetManifestValues = z.infer<typeof widgetManifestSchema>
