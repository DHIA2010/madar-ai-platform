// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  createTracingExecutionInterceptor,
  ExecutionBus,
  ExecutionDispatcher,
  type ExecutionEnvelopeMetadata,
  ExecutionEngineRegistry,
  ExecutionRuntimeError,
  LocalExecutionEngine,
  createLocalExecutionManifest,
  type ExecutionRuntimeRequest,
} from "../execution"

function buildRequest(overrides?: Partial<ExecutionRuntimeRequest>): ExecutionRuntimeRequest {
  return {
    executionId: overrides?.executionId ?? "bus-execution-1",
    engineId: overrides?.engineId ?? "local-executor",
    connectorId: overrides?.connectorId ?? "connector-1",
    context: overrides?.context ?? {
      organization: { organizationId: "org-bus" },
      workspace: { workspaceId: "ws-bus" },
      project: { projectId: "project-bus" },
      connection: { connectionId: "connection-bus" },
      workflow: { workflowId: "workflow-bus" },
      correlationId: "corr-bus",
      traceId: "trace-bus",
      secretsReference: { provider: "vault", ref: "secret://bus" },
      metadata: {
        requestedBy: "system",
        source: "execution-bus-test",
        attempt: 1,
        workflowVersion: "2026.07.03",
        retryCount: 1,
        tags: ["phase-4"],
      },
      featureFlags: {
        executionBus: true,
      },
    },
    input: overrides?.input ?? { hello: "bus" },
  }
}

function createLocalBus() {
  const registry = new ExecutionEngineRegistry()
  registry.register(new LocalExecutionEngine(), createLocalExecutionManifest())
  const dispatcher = new ExecutionDispatcher(registry)
  const bus = new ExecutionBus({ dispatcher })
  return { bus, registry }
}

describe("phase 4 execution bus", () => {
  it("publishes request and result envelopes with trace and correlation metadata", async () => {
    const { bus } = createLocalBus()
    const envelopes: Array<{ kind: string; metadata: ExecutionEnvelopeMetadata }> = []
    const trace: string[] = []

    bus.addInterceptor(createTracingExecutionInterceptor(trace))
    bus.subscribe({
      kinds: ["ExecutionRequest", "ExecutionResult"],
      onEnvelope(envelope) {
        envelopes.push({ kind: envelope.kind, metadata: envelope.metadata })
      },
    })

    const result = await bus.dispatch(buildRequest())

    expect(result.status).toBe("completed")
    expect(envelopes.map((envelope) => envelope.kind)).toEqual(["ExecutionRequest", "ExecutionResult"])
    expect(envelopes[0]?.metadata).toMatchObject({
      correlationId: "corr-bus",
      traceId: "trace-bus",
      engineName: "local-executor",
      workflowVersion: "2026.07.03",
    })
    expect(trace).toEqual([
      "interceptor:before:bus-execution-1:1",
      "interceptor:after:completed:bus-execution-1:1",
    ])
  })

  it("supports execution cancellation before dispatch", async () => {
    const { bus } = createLocalBus()
    bus.cancel("bus-cancelled", "cancelled by policy")

    const result = await bus.dispatch(buildRequest({ executionId: "bus-cancelled" }))
    expect(result.status).toBe("cancelled")
    expect(result.output).toEqual({ reason: "cancelled by policy" })
  })

  it("applies retry policy for retryable execution errors", async () => {
    let attempts = 0
    const registry = new ExecutionEngineRegistry()
    registry.register(
      {
        engineId: "flaky-engine",
        registerManifest() {
          return
        },
        async execute(request) {
          attempts += 1
          if (attempts === 1) {
            throw new ExecutionRuntimeError("engine_unavailable", "engine temporarily unavailable")
          }
          const now = new Date().toISOString()
          return {
            executionId: request.executionId,
            engineId: "flaky-engine",
            status: "completed" as const,
            output: { attempt: attempts },
            startedAt: now,
            finishedAt: now,
          }
        },
        async healthCheck() {
          return {
            engineId: "flaky-engine",
            registered: true,
            status: "healthy" as const,
            message: "ok",
          }
        },
      },
      {
        manifestType: "execution-engine",
        engineId: "flaky-engine",
        displayName: "Flaky Engine",
        version: "1.0.0",
        entrypoint: "src/integration-platform/tests/phase-4-execution-bus.test.ts",
        supportedModes: ["mock"],
      }
    )

    const dispatcher = new ExecutionDispatcher(registry)
    const bus = new ExecutionBus({ dispatcher })

    const result = await bus.dispatch(
      buildRequest({ executionId: "bus-retry", engineId: "flaky-engine" }),
      {
        policy: {
          retry: {
            maxAttempts: 2,
            retryableErrorCodes: ["engine_unavailable"],
          },
        },
      }
    )

    expect(result.status).toBe("completed")
    expect(result.output).toEqual({ attempt: 2 })
    expect(attempts).toBe(2)
  })

  it("raises timeout errors for long-running executions", async () => {
    const registry = new ExecutionEngineRegistry()
    registry.register(
      {
        engineId: "slow-engine",
        registerManifest() {
          return
        },
        async execute(request) {
          await new Promise((resolve) => setTimeout(resolve, 25))
          const now = new Date().toISOString()
          return {
            executionId: request.executionId,
            engineId: "slow-engine",
            status: "completed" as const,
            output: { ok: true },
            startedAt: now,
            finishedAt: now,
          }
        },
        async healthCheck() {
          return {
            engineId: "slow-engine",
            registered: true,
            status: "healthy" as const,
            message: "ok",
          }
        },
      },
      {
        manifestType: "execution-engine",
        engineId: "slow-engine",
        displayName: "Slow Engine",
        version: "1.0.0",
        entrypoint: "src/integration-platform/tests/phase-4-execution-bus.test.ts",
        supportedModes: ["mock"],
      }
    )

    const dispatcher = new ExecutionDispatcher(registry)
    const bus = new ExecutionBus({ dispatcher })

    await expect(
      bus.dispatch(buildRequest({ executionId: "bus-timeout", engineId: "slow-engine" }), {
        policy: {
          timeout: {
            timeoutMs: 1,
          },
        },
      })
    ).rejects.toMatchObject({ code: "execution_timed_out" })
  })
})
