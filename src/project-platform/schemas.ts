import { z } from "zod"

const primitiveRecord = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

export const createProjectSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(200),
  metadata: z.record(z.string(), z.string()).optional(),
  branding: z.record(z.string(), z.string()).optional(),
  logoUrl: z.string().url().nullable().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  locale: z.string().optional(),
  environment: z.enum(["development", "staging", "production", "sandbox"]).optional(),
  settings: primitiveRecord.optional(),
  retentionPolicy: z.string().nullable().optional(),
  defaultDashboard: z.string().nullable().optional(),
  notificationPreferences: primitiveRecord.optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  connectorPreferences: primitiveRecord.optional(),
})

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["active", "archived", "deleted"]).optional(),
})

export const createDataSourceSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.enum([
    "google_ads",
    "meta_ads",
    "tiktok_ads",
    "snapchat_ads",
    "google_analytics_4",
    "shopify",
    "woocommerce",
    "salla",
    "zid",
    "csv_import",
    "rest_api",
    "webhook",
    "manual_upload",
  ]),
  metadata: primitiveRecord.optional(),
  futureOauthReady: z.boolean().optional(),
  connectionReference: z.string().nullable().optional(),
})

export const updateDataSourceSchema = createDataSourceSchema.partial().extend({
  validationStatus: z.enum(["pending", "valid", "invalid"]).optional(),
  healthStatus: z.enum(["healthy", "degraded", "unhealthy", "unknown"]).optional(),
  syncStatus: z.enum(["idle", "syncing", "failed", "disabled", "pending"]).optional(),
  connectionStatus: z.enum(["connected", "disconnected", "pending", "error", "not_applicable"]).optional(),
  status: z.enum(["draft", "enabled", "disabled", "archived", "deleted"]).optional(),
})

export const projectMemberActionSchema = z.object({
  reason: z.string().min(2).optional(),
  role: z.enum(["owner", "admin", "manager", "analyst", "viewer"]).optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
})

export const projectInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "manager", "analyst", "viewer"]),
  idempotencyKey: z.string().min(8).max(100).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
})
