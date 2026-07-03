import { randomUUID } from "node:crypto"

export interface N8nWorkflowRequest {
  connectorId: string
  workflowType: "import" | "sync" | "resync"
  payload: Record<string, unknown>
}

export interface N8nWorkflowResult {
  runId: string
  workflowType: "import" | "sync" | "resync"
  status: "completed"
  output: Record<string, unknown>
  startedAt: string
  finishedAt: string
}

export interface N8nWorkflowAdapter {
  execute(input: N8nWorkflowRequest): Promise<N8nWorkflowResult>
  health(): { status: "healthy" | "degraded"; message: string; restartedAt: string | null }
}

export class InMemoryN8nWorkflowAdapter implements N8nWorkflowAdapter {
  private restartedAt: string | null = null

  restart(now = new Date().toISOString()) {
    this.restartedAt = now
  }

  async execute(input: N8nWorkflowRequest): Promise<N8nWorkflowResult> {
    const startedAt = new Date().toISOString()
    const finishedAt = new Date().toISOString()
    return {
      runId: randomUUID(),
      workflowType: input.workflowType,
      status: "completed",
      output: {
        connectorId: input.connectorId,
        workflowType: input.workflowType,
        accountIds: input.payload.accountIds ?? [],
        importedCount: Array.isArray(input.payload.accountIds) ? input.payload.accountIds.length : 0,
      },
      startedAt,
      finishedAt,
    }
  }

  health() {
    return {
      status: "healthy" as const,
      message: "n8n adapter is ready.",
      restartedAt: this.restartedAt,
    }
  }
}
