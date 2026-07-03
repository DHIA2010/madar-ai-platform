// @vitest-environment node

import { describe, expect, it } from "vitest"

import { createIntegrationPlatform } from "../bootstrap/create-integration-platform"
import type { ExecutionRuntimeRequest } from "../execution/runtime.contracts"
import { ExecutionRuntime, ExecutionRuntimeError } from "../execution"

function buildRequest(
  overrides?: Partial<ExecutionRuntimeRequest> & { engineId?: string }
): ExecutionRuntimeRequest {
  return {
    executionId: overrides?.executionId ?? "execution-1",
    engineId: overrides?.engineId ?? "local-executor",
    connectorId: overrides?.connectorId ?? "google_ads",
    context: overrides?.context ?? {
      organization: { organizationId: "org_1" },
      workspace: { workspaceId: "ws_1" },
      project: { projectId: "proj_1" },
      connection: { connectionId: "conn_1" },
      workflow: { workflowId: "workflow_1" },
      correlationId: "corr_1",
      traceId: "trace_1",
      secretsReference: { provider: "vault", ref: "secret://conn_1" },
      metadata: {
        requestedBy: "system",
        source: "runtime-test",
        attempt: 1,
        tags: ["phase-3"],
      },
      featureFlags: { runtime: true },
    },
    input: overrides?.input ?? { message: "hello" },
  }
}

describe("phase 3 execution runtime", () => {
  it("drives the full queued to completed lifecycle through middleware and hooks", async () => {
    const platform = createIntegrationPlatform()
    const runtime = platform.executionRuntime as ExecutionRuntime
    const observedEvents: string[] = []
    const middlewareSignals: string[] = []
    const hookSignals: string[] = []

    runtime.useMiddleware(async (context, next) => {
      middlewareSignals.push(`before:${context.state.status}`)
      const result = await next()
      middlewareSignals.push(`after:${result.status}`)
      return result
    })

    runtime.useHook({
      onEvent(event) {
        observedEvents.push(event.type)
      },
      onBeforeExecute() {
        hookSignals.push("before-execute")
      },
      onAfterExecute(_context, result) {
        hookSignals.push(`after-execute:${result.status}`)
      },
    })

    const result = await runtime.execute(buildRequest())

    expect(result.status).toBe("completed")
    expect(result.output).toEqual({ message: "hello" })

    const state = runtime.getState("execution-1")
    expect(state?.status).toBe("completed")
    expect(observedEvents).toEqual([
      "ExecutionQueued",
      "ExecutionDispatched",
      "ExecutionStarted",
      "ExecutionHeartbeat",
      "ExecutionCompleted",
    ])
    expect(middlewareSignals).toEqual(["before:running", "after:completed"])
    expect(hookSignals).toEqual(["before-execute", "after-execute:completed"])

    const metrics = runtime.getMetrics()
    expect(metrics.queued).toBe(1)
    expect(metrics.dispatched).toBe(1)
    expect(metrics.running).toBe(1)
    expect(metrics.completed).toBe(1)
    expect(metrics.failed).toBe(0)
    expect(metrics.cancelled).toBe(0)
  })

  it("records cancelled executions in the same lifecycle model", async () => {
    const platform = createIntegrationPlatform()
    const runtime = platform.executionRuntime as ExecutionRuntime

    await runtime.queue(buildRequest({ executionId: "execution-cancelled" }))
    const cancelled = await runtime.cancel("execution-cancelled", "cancelled by test")

    expect(cancelled.status).toBe("cancelled")
    expect(runtime.getState("execution-cancelled")?.status).toBe("cancelled")
    expect(runtime.listEvents().at(-1)?.type).toBe("ExecutionCancelled")
  })

  it("marks missing engines as failed runtime executions without leaking engine details", async () => {
    const platform = createIntegrationPlatform()
    const runtime = platform.executionRuntime as ExecutionRuntime

    const result = await runtime.execute(
      buildRequest({ executionId: "execution-missing-engine", engineId: "unknown-engine" })
    )

    expect(result.status).toBe("failed")
    expect(result.output).toEqual({ error: "Execution engine unknown-engine is not registered." })

    const state = runtime.getState("execution-missing-engine")
    expect(state?.status).toBe("failed")
    expect(state?.error?.code).toBe("engine_not_registered")
    expect(runtime.listEvents().map((event) => event.type)).toContain("ExecutionFailed")
  })

  it("keeps the runtime error type available for future middleware failures", () => {
    const error = new ExecutionRuntimeError("runtime_error", "runtime exploded")
    expect(error.code).toBe("runtime_error")
    expect(error.message).toContain("runtime exploded")
  })
})
