import type {
  ExecutionEngine,
  ExecutionEngineHealthSnapshot,
  ExecutionEngineManifest,
  ExecutionRequest,
  ExecutionResult,
} from "../../execution"
import type { N8nWorkflowAdapter } from "./n8n-adapter"

export function createGoogleAdsV2ExecutionManifest(): ExecutionEngineManifest {
  return {
    manifestType: "execution-engine",
    engineId: "google-ads-v2-engine",
    displayName: "Google Ads V2 Execution Engine",
    version: "1.0.0",
    entrypoint: "src/integration-platform/integration/google-ads-v2/execution-engine.ts",
    supportedModes: ["local", "mock"],
  }
}

export class GoogleAdsV2ExecutionEngine implements ExecutionEngine {
  private manifest: ExecutionEngineManifest | null = null

  constructor(
    public readonly engineId = "google-ads-v2-engine",
    private readonly n8n: N8nWorkflowAdapter
  ) {}

  registerManifest(manifest: ExecutionEngineManifest) {
    this.manifest = manifest
  }

  async execute(input: ExecutionRequest): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString()
    const workflowType =
      input.payload.action === "import"
        ? "import"
        : input.payload.action === "resync"
          ? "resync"
          : "sync"

    const workflow = await this.n8n.execute({
      connectorId: input.connectorId,
      workflowType,
      payload: input.payload,
    })

    return {
      executionId: input.executionId,
      engineId: this.engineId,
      status: "completed",
      output: {
        ...workflow.output,
        workflowRunId: workflow.runId,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
    }
  }

  async healthCheck(): Promise<ExecutionEngineHealthSnapshot> {
    const n8nHealth = this.n8n.health()
    return {
      engineId: this.engineId,
      registered: this.manifest !== null,
      status: n8nHealth.status === "healthy" ? "healthy" : "degraded",
      message: n8nHealth.message,
    }
  }
}
