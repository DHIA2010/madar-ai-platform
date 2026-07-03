import { z } from "zod"

export const compatibilityRuleSchema = z.object({
  ruleId: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
})

export const connectorDependencySchema = z.object({
  dependencyId: z.string().min(1),
  type: z.enum(["connector", "service", "feature"]),
  minVersion: z.string().min(1).optional(),
  maxVersion: z.string().min(1).optional(),
})

export const connectorCapabilitySchema = z.object({
  capabilityKey: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean(),
  description: z.string().optional(),
})

export const connectorFieldSchema = z.object({
  fieldId: z.string().min(1),
  displayName: z.string().min(1),
  dataType: z.string().min(1),
  required: z.boolean(),
  description: z.string().optional(),
})

export const connectorObjectSchema = z.object({
  objectId: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(connectorFieldSchema),
})

export const connectorOperationSchema = z.object({
  operationId: z.string().min(1),
  displayName: z.string().min(1),
  operationType: z.enum(["read", "write", "mutate", "action"]),
  objectId: z.string().min(1).optional(),
  supportedCapabilityKeys: z.array(z.string().min(1)).default([]),
  supportedWorkflowTypes: z.array(z.string().min(1)).default([]),
  supportedEvents: z.array(z.string().min(1)).default([]),
  supportedCommands: z.array(z.string().min(1)).default([]),
  description: z.string().optional(),
})

export const connectorWorkflowTemplateSchema = z.object({
  templateId: z.string().min(1),
  displayName: z.string().min(1),
  workflowType: z.string().min(1),
  operationIds: z.array(z.string().min(1)).default([]),
  eventIds: z.array(z.string().min(1)).default([]),
  commandIds: z.array(z.string().min(1)).default([]),
  description: z.string().optional(),
})

export const connectorHealthCheckSchema = z.object({
  checkId: z.string().min(1),
  displayName: z.string().min(1),
  intervalSeconds: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  description: z.string().optional(),
})

export const connectorRateLimitSchema = z.object({
  limitId: z.string().min(1),
  scope: z.enum(["global", "organization", "workspace", "connection"]),
  maxRequests: z.number().int().positive(),
  intervalSeconds: z.number().int().positive(),
})

export const connectorManifestSchema = z.object({
  manifestType: z.literal("connector-manifest"),
  connectorId: z.string().min(1),
  connectorVersion: z.string().min(1),
  sdkVersion: z.string().min(1),
  provider: z.object({
    providerId: z.string().min(1),
    displayName: z.string().min(1),
  }),
  displayName: z.string().min(1),
  authenticationType: z.enum(["oauth2", "api_key", "basic", "custom"]),
  requiredOAuthScopes: z.array(z.string().min(1)).default([]),
  capabilities: z.array(connectorCapabilitySchema),
  supportedObjects: z.array(connectorObjectSchema),
  supportedOperations: z.array(connectorOperationSchema),
  workflowTemplates: z.array(connectorWorkflowTemplateSchema).default([]),
  supportedEvents: z.array(z.string().min(1)).default([]),
  supportedCommands: z.array(z.string().min(1)).default([]),
  healthChecks: z.array(connectorHealthCheckSchema).default([]),
  rateLimits: z.array(connectorRateLimitSchema).default([]),
  dependencies: z.array(connectorDependencySchema).default([]),
  minimumPlatformVersion: z.string().min(1),
  maximumPlatformVersion: z.string().min(1),
  compatibilityRules: z.array(compatibilityRuleSchema).default([]),
})

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>

export interface ManifestValidationIssue {
  code:
    | "required_fields"
    | "metadata_consistency"
    | "capability_consistency"
    | "version_incompatibility"
    | "duplicate_connector_id"
    | "duplicate_object_id"
    | "duplicate_operation_id"
  message: string
  path?: string
}

export interface ManifestValidationResult {
  ok: boolean
  issues: ManifestValidationIssue[]
  manifest: ConnectorManifest | null
}
