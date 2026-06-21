import { z } from "zod"

export const connectorCapabilitySchema = z.enum([
  "products",
  "orders",
  "customers",
  "campaigns",
  "ads",
  "traffic",
  "events",
  "conversions",
  "catalog",
  "media",
])

export const connectionStatusSchema = z.enum([
  "draft",
  "authorized",
  "connected",
  "valid",
  "syncing",
  "paused",
  "disconnected",
  "deleted",
  "error",
])

export const syncJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "paused",
  "canceled",
])

export const createConnectionSchema = z.object({
  workspaceId: z.string().min(1),
  connectorDefinitionId: z.string().min(1),
  connectorId: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
  credential: z
    .object({
      type: z.enum(["api_key", "oauth", "service_account"]),
      payload: z.record(z.string(), z.string()),
    })
    .optional(),
})

export const validateConnectionSchema = z.object({
  connectionId: z.string().min(1),
})

export const authorizeConnectorSchema = z.object({
  connectionId: z.string().min(1),
  authorizationCode: z.string().min(1).optional(),
})

export const refreshConnectionSchema = z.object({
  connectionId: z.string().min(1),
})

export const disconnectConnectionSchema = z.object({
  connectionId: z.string().min(1),
  reason: z.string().min(1).optional(),
})

export const runSyncSchema = z.object({
  connectionId: z.string().min(1),
  trigger: z.enum(["manual", "scheduled", "webhook", "retry"]).optional(),
})

export const scheduleSyncSchema = z.object({
  connectionId: z.string().min(1),
  cron: z.string().min(3),
  timezone: z.string().min(1),
  enabled: z.boolean().optional(),
})

export const retrySyncSchema = z.object({
  syncJobId: z.string().min(1),
})

export const pauseSyncSchema = z.object({
  syncJobId: z.string().min(1),
})

export const resumeSyncSchema = z.object({
  syncJobId: z.string().min(1),
})

export const getIntegrationStatusSchema = z.object({
  connectionId: z.string().min(1),
})

export const getSyncHistorySchema = z.object({
  connectionId: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
})

export const getConnectorHealthSchema = z.object({
  connectorId: z.string().min(1),
})
