// @vitest-environment node

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { GoogleAdsMapper } from "@/infrastructure"

import {
  assertConnectorContract,
  assertExecutionEngineContract,
  collectPlatformDiagnostics,
  connectorManifestSchema,
  executionEngineManifestSchema,
  validateConnectorManifest,
} from "../safety"
import { createIntegrationPlatform } from "../bootstrap/create-integration-platform"

function ownerActor() {
  return {
    userId: "system",
    sessionId: "session",
    organizationId: "org",
    workspaceId: "workspace",
    roles: ["owner" as const],
  }
}

describe("phase 1.5 architecture safety", () => {
  it("enforces dependency rules through dependency-cruiser", () => {
    const binary = resolve(process.cwd(), "node_modules/.bin/dependency-cruiser")
    const config = resolve(process.cwd(), ".dependency-cruiser.cjs")

    expect(() => {
      execFileSync(binary, ["--config", config, "src", "--output-type", "err-long"], {
        stdio: "pipe",
        encoding: "utf8",
      })
    }).not.toThrow()
  }, 30_000)

  it("validates connector plugin manifests before loading", () => {
    const manifest = {
      manifestType: "connector",
      connectorId: "google_ads",
      connectorDefinitionId: "connector_def_google_ads",
      displayName: "Google Ads",
      description: "Reference marketing connector",
      version: "1.0.0",
      entrypoint: "src/infrastructure/integration/google-ads/index.ts",
      supportedEngines: ["local"],
      permissions: ["marketing:read"],
      featureFlags: ["integrations.google_ads"],
      capabilities: [
        { key: "campaigns", name: "Campaigns", enabled: true },
        { key: "ads", name: "Ads", enabled: true },
      ],
    }

    expect(validateConnectorManifest(manifest).success).toBe(true)
    expect(
      validateConnectorManifest({
        manifestType: "connector",
        connectorId: "",
        displayName: "x",
        version: "",
        entrypoint: "",
      }).success
    ).toBe(false)
    expect(connectorManifestSchema.safeParse(manifest).success).toBe(true)
  })

  it("supports execution engine contracts for future engines", async () => {
    const engineManifest = executionEngineManifestSchema.parse({
      manifestType: "execution-engine",
      engineId: "mock-executor",
      displayName: "Mock Executor",
      version: "1.0.0",
      entrypoint: "src/integration-platform/execution/mock-executor.ts",
      supportedModes: ["mock"],
    })

    await assertExecutionEngineContract(
      () => ({
        engineId: "mock-executor",
        async registerManifest() {
          return
        },
        async execute(input) {
          return {
            executionId: input.executionId,
            engineId: "mock-executor",
            status: "completed",
            output: input.payload,
          }
        },
        async healthCheck() {
          return { status: "healthy", registered: true, message: "ready" }
        },
      }),
      engineManifest
    )
  })

  it("keeps the Google Ads connector lifecycle working in the reference platform", async () => {
    const platform = createIntegrationPlatform()
    const integrations = platform.services.integrations

    const connector = await integrations.registerConnector(ownerActor() as never, {
      connectorId: "google_ads",
      displayName: "Google Ads",
      description: "Reference marketing connector",
      version: "1.0.0",
      capabilities: [
        { key: "campaigns", name: "Campaigns", enabled: true },
        { key: "ads", name: "Ads", enabled: true },
      ],
    })

    const connection = await integrations.createConnection(ownerActor() as never, {
      connectorId: connector.connectorId,
      workspaceId: "ws_google",
      metadata: {
        connectionName: "Google Ads Reference",
      },
    })

    const oauth = await integrations.startOAuth(ownerActor() as never, connection.id)
    const completed = await integrations.completeOAuth(ownerActor() as never, {
      state: oauth.session.state,
      code: "oauth-code",
      redirectUri: "https://madar.local/oauth/callback",
    })

    expect(completed.connection.status).toBe("connected")

    const syncRun = await integrations.requestSync(ownerActor() as never, {
      connectionId: connection.id,
      mode: "full",
    })

    expect(syncRun.status).toBe("completed")
    expect(
      GoogleAdsMapper.mapAccount({
        customer_id: "cust_1",
        manager_customer_id: "mcc_1",
        customer_name: "MADAR",
        manager_name: "MADAR MCC",
        currency: "SAR",
        updated_at: "2026-06-19T08:00:00.000Z",
      }).customerId
    ).toBe("cust_1")
  })

  it("reports healthy platform diagnostics for a consistent registry snapshot", () => {
    const report = collectPlatformDiagnostics({
      connectors: [{ connectorId: "google_ads", capabilities: ["campaigns", "ads"] }],
      executionEngines: [{ engineId: "mock-executor", registered: true }],
      plugins: [
        {
          pluginId: "google_ads",
          manifest: {
            manifestType: "connector",
            connectorId: "google_ads",
            connectorDefinitionId: "connector_def_google_ads",
            displayName: "Google Ads",
            version: "1.0.0",
            entrypoint: "src/infrastructure/integration/google-ads/index.ts",
            supportedEngines: ["local"],
            permissions: ["marketing:read"],
            featureFlags: [],
            capabilities: [
              { key: "campaigns", name: "Campaigns", enabled: true },
              { key: "ads", name: "Ads", enabled: true },
            ],
          },
        },
      ],
      capabilities: [
        { connectorId: "google_ads", capabilityKey: "campaigns" },
        { connectorId: "google_ads", capabilityKey: "ads" },
      ],
    })

    expect(report.healthy).toBe(true)
    expect(report.checks).toHaveLength(5)
    expect(report.checks.every((check) => check.status === "pass")).toBe(true)
  })

  it("flags broken registry snapshots", () => {
    const report = collectPlatformDiagnostics({
      connectors: [
        { connectorId: "google_ads", capabilities: ["campaigns"] },
        { connectorId: "google_ads", capabilities: ["campaigns"] },
      ],
      executionEngines: [{ engineId: "mock-executor", registered: false }],
      plugins: [
        {
          pluginId: "broken-plugin",
          manifest: {
            manifestType: "connector",
            connectorId: "",
            displayName: "",
            version: "",
            entrypoint: "",
          },
        },
      ],
      capabilities: [{ connectorId: "google_ads", capabilityKey: "campaigns" }],
    })

    expect(report.healthy).toBe(false)
    expect(report.checks.some((check) => check.status === "fail")).toBe(true)
  })
})
