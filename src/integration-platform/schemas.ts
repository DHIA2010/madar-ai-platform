import { z } from "zod"

const primitiveRecord = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

export const registerConnectorSchema = z.object({
  connectorId: z.string().min(1),
  displayName: z.string().min(2),
  description: z.string().optional(),
  version: z.string().optional(),
  capabilities: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        enabled: z.boolean(),
        description: z.string().optional(),
      })
    )
    .default([]),
})

export const createConnectionSchema = z.object({
  connectorId: z.string().min(1),
  workspaceId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  metadata: primitiveRecord.optional(),
})

export const oauthCallbackSchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1),
  redirectUri: z.string().url(),
})

export const syncRequestSchema = z.object({
  connectionId: z.string().min(1),
  mode: z.enum(["full", "incremental"]),
})

export const webhookRegistrationSchema = z.object({
  connectionId: z.string().min(1),
  endpointUrl: z.string().url(),
  secret: z.string().min(8),
  signatureHeader: z.string().min(1),
})
