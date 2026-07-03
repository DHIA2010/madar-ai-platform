export interface ExecutionEngineManifest {
  manifestType: "execution-engine"
  engineId: string
  displayName: string
  version: string
  entrypoint: string
  supportedModes: Array<"local" | "remote" | "mock" | "orchestrated">
}

export interface ExecutionEngineHealthSnapshot {
  engineId: string
  registered: boolean
  status: "healthy" | "degraded" | "unhealthy"
  message: string
}

export interface ExecutionRequest {
  executionId: string
  connectorId: string
  payload: Record<string, unknown>
}

export interface ExecutionResult {
  executionId: string
  engineId: string
  status: "completed" | "failed" | "cancelled"
  output: Record<string, unknown>
  startedAt: string
  finishedAt: string
}

export interface ExecutionEngine {
  engineId: string
  registerManifest(manifest: ExecutionEngineManifest): Promise<void> | void
  execute(input: ExecutionRequest): Promise<ExecutionResult>
  healthCheck(): Promise<ExecutionEngineHealthSnapshot> | ExecutionEngineHealthSnapshot
}
