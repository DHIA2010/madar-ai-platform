import assert from "node:assert/strict"

import { z } from "zod"

export const connectorCapabilitySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  description: z.string().optional(),
})

export const connectorManifestSchema = z.object({
  manifestType: z.literal("connector"),
  connectorId: z.string().min(1),
  connectorDefinitionId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  description: z.string().min(1).optional(),
  version: z.string().min(1),
  entrypoint: z.string().min(1),
  supportedEngines: z.array(z.string().min(1)).default([]),
  permissions: z.array(z.string().min(1)).default([]),
  featureFlags: z.array(z.string().min(1)).default([]),
  capabilities: z.array(connectorCapabilitySchema).default([]),
})

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>

export const executionEngineManifestSchema = z.object({
  manifestType: z.literal("execution-engine"),
  engineId: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  entrypoint: z.string().min(1),
  supportedModes: z.array(z.enum(["local", "remote", "mock", "orchestrated"])).min(1),
})

export type ExecutionEngineManifest = z.infer<typeof executionEngineManifestSchema>

export interface ExecutionEngineHealthSnapshot {
  status: "healthy" | "degraded" | "unhealthy"
  registered: boolean
  message: string
}

export interface ExecutionEngineContract {
  engineId: string
  registerManifest(manifest: ExecutionEngineManifest): Promise<void> | void
  execute(input: {
    executionId: string
    connectorId: string
    payload: Record<string, unknown>
  }): Promise<{
    executionId: string
    engineId: string
    status: "completed" | "failed"
    output: Record<string, unknown>
  }>
  healthCheck(): Promise<ExecutionEngineHealthSnapshot> | ExecutionEngineHealthSnapshot
}

export interface ConnectorContractTarget {
  createConnection(input: {
    connectorId: string
    workspaceId: string
    connectorDefinitionId: string
    credential: { type: "oauth"; payload: Record<string, string> }
  }): Promise<
    { payload: { connectionId: string; status: string } } | { connectionId: string; status: string }
  >
  authorizeConnector(input: {
    connectionId: string
    authorizationCode: string
  }): Promise<
    | {
        payload: {
          status: string
          accessToken?: { value: string }
          refreshToken?: { value: string }
        }
      }
    | { status: string }
  >
  validateConnection(input: {
    connectionId: string
  }): Promise<{ payload: { status: string } } | { status: string }>
  runSync(input: {
    connectionId: string
    trigger: "manual" | "scheduled" | "webhook"
  }): Promise<{ payload: { result?: { message?: string } } } | { result?: { message?: string } }>
}

export function validateConnectorManifest(input: unknown) {
  return connectorManifestSchema.safeParse(input)
}

export function validateExecutionEngineManifest(input: unknown) {
  return executionEngineManifestSchema.safeParse(input)
}

export async function assertExecutionEngineContract(
  factory: () => ExecutionEngineContract,
  manifest: ExecutionEngineManifest
) {
  const engine = factory()

  assert.equal(engine.engineId, manifest.engineId)

  await Promise.resolve(engine.registerManifest(manifest))
  const health = await Promise.resolve(engine.healthCheck())
  assert.equal(health.registered, true)
  assert.equal(health.status, "healthy")

  const execution = await engine.execute({
    executionId: "execution-1",
    connectorId: "connector-1",
    payload: { source: "contract-test" },
  })

  assert.equal(execution.executionId, "execution-1")
  assert.equal(execution.engineId, manifest.engineId)
  assert.equal(execution.status, "completed")
  assert.deepEqual(execution.output, { source: "contract-test" })
}

export async function assertConnectorContract(
  factory: () => ConnectorContractTarget,
  connectorManifest: ConnectorManifest
) {
  const connectorService = factory()
  const connectorDefinitionId =
    connectorManifest.connectorDefinitionId ?? `${connectorManifest.connectorId}_definition`

  const connection = await connectorService.createConnection({
    connectorId: connectorManifest.connectorId,
    workspaceId: "ws_google",
    connectorDefinitionId,
    credential: {
      type: "oauth",
      payload: {
        clientId: "client-id",
        clientSecret: "client-secret",
        redirectUri: "https://example.com/oauth/callback",
      },
    },
  })

  const connectionId =
    "payload" in connection ? connection.payload.connectionId : connection.connectionId
  assert.equal(connectionId.length > 0, true)

  const authorized = await connectorService.authorizeConnector({
    connectionId,
    authorizationCode: "authorization-code",
  })
  const authorizedStatus = "payload" in authorized ? authorized.payload.status : authorized.status
  assert.equal(authorizedStatus, "authorized")

  const validated = await connectorService.validateConnection({ connectionId })
  const validatedStatus = "payload" in validated ? validated.payload.status : validated.status
  assert.equal(validatedStatus, "valid")

  const synced = await connectorService.runSync({
    connectionId,
    trigger: "manual",
  })

  const syncMessage =
    "payload" in synced ? (synced.payload.result?.message ?? "") : (synced.result?.message ?? "")
  assert.equal(syncMessage.length > 0, true)
}
