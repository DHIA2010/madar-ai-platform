import type {
  ExecutionEngine,
  ExecutionEngineHealthSnapshot,
  ExecutionEngineManifest,
  ExecutionRequest,
  ExecutionResult,
} from "./contracts"

export class LocalExecutionEngine implements ExecutionEngine {
  private manifest: ExecutionEngineManifest | null = null

  constructor(public readonly engineId = "local-executor") {}

  registerManifest(manifest: ExecutionEngineManifest) {
    this.manifest = manifest
  }

  async execute(input: ExecutionRequest): Promise<ExecutionResult> {
    void input.connectorId
    const startedAt = new Date().toISOString()
    const finishedAt = new Date().toISOString()
    return {
      executionId: input.executionId,
      engineId: this.engineId,
      status: "completed",
      output: input.payload,
      startedAt,
      finishedAt,
    }
  }

  async healthCheck(): Promise<ExecutionEngineHealthSnapshot> {
    return {
      engineId: this.engineId,
      registered: this.manifest !== null,
      status: this.manifest ? "healthy" : "degraded",
      message: this.manifest ? "Local executor ready." : "Execution manifest not registered yet.",
    }
  }
}

export function createLocalExecutionManifest(): ExecutionEngineManifest {
  return {
    manifestType: "execution-engine",
    engineId: "local-executor",
    displayName: "Local Executor",
    version: "1.0.0",
    entrypoint: "src/integration-platform/execution/local-execution-engine.ts",
    supportedModes: ["local", "mock"],
  }
}
