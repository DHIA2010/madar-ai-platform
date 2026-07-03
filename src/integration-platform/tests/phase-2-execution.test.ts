// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  createLocalExecutionManifest,
  ExecutionEngineRegistry,
  LocalExecutionEngine,
} from "../execution"
import { createIntegrationPlatform } from "../bootstrap/create-integration-platform"

describe("phase 2 execution engines", () => {
  it("registers the local execution engine by default", async () => {
    const platform = createIntegrationPlatform()
    const registry = platform.executionEngines as ExecutionEngineRegistry

    expect(registry.list()).toHaveLength(1)
    expect(registry.find("local-executor")?.manifest.engineId).toBe("local-executor")

    const health = await registry.health()
    expect(health).toEqual([
      expect.objectContaining({
        engineId: "local-executor",
        registered: true,
        status: "healthy",
      }),
    ])
  })

  it("supports reusable execution engine contract behavior", async () => {
    const registry = new ExecutionEngineRegistry()
    const engine = new LocalExecutionEngine("mock-executor")
    const manifest = createLocalExecutionManifest()

    registry.register(engine, {
      ...manifest,
      engineId: "mock-executor",
      displayName: "Mock Executor",
      entrypoint: "src/integration-platform/execution/local-execution-engine.ts",
      supportedModes: ["mock"],
    })

    const result = await engine.execute({
      executionId: "execution-123",
      connectorId: "google_ads",
      payload: { source: "phase-2-test" },
    })

    expect(result).toMatchObject({
      executionId: "execution-123",
      engineId: "mock-executor",
      status: "completed",
      output: { source: "phase-2-test" },
    })
    expect(result.startedAt).toBeTypeOf("string")
    expect(result.finishedAt).toBeTypeOf("string")
  })
})
