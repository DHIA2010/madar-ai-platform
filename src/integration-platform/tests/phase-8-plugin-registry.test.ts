// @vitest-environment node

import { describe, expect, it } from "vitest"

import { PluginRegistry, PluginRegistryError } from "../plugins"
import type { ConnectorManifest } from "../manifest"

function buildManifest(connectorId: string): ConnectorManifest {
  return {
    manifestType: "connector-manifest",
    connectorId,
    connectorVersion: "1.0.0",
    sdkVersion: "1.0.0",
    provider: { providerId: "provider", displayName: "Provider" },
    displayName: connectorId,
    authenticationType: "custom",
    requiredOAuthScopes: [],
    capabilities: [{ capabilityKey: "sync.read", displayName: "Sync Read", enabled: true }],
    supportedObjects: [{ objectId: "entity", displayName: "Entity", fields: [] }],
    supportedOperations: [
      {
        operationId: "entity.list",
        displayName: "List Entity",
        operationType: "read",
        objectId: "entity",
        supportedCapabilityKeys: ["sync.read"],
        supportedWorkflowTypes: ["sync"],
        supportedEvents: ["entity.synced"],
        supportedCommands: ["entity.fetch"],
      },
    ],
    workflowTemplates: [
      {
        templateId: "sync-template",
        displayName: "Sync Template",
        workflowType: "sync",
        operationIds: ["entity.list"],
        eventIds: ["entity.synced"],
        commandIds: ["entity.fetch"],
      },
    ],
    supportedEvents: ["entity.synced"],
    supportedCommands: ["entity.fetch"],
    healthChecks: [{ checkId: "health", displayName: "Health", intervalSeconds: 30, timeoutMs: 500 }],
    rateLimits: [{ limitId: "default", scope: "connection", maxRequests: 10, intervalSeconds: 1 }],
    dependencies: [],
    minimumPlatformVersion: "1.0.0",
    maximumPlatformVersion: "2.0.0",
    compatibilityRules: [{ ruleId: "base", description: "Base compatibility", required: true }],
  }
}

describe("phase 8 plugin registry", () => {
  it("registers plugin manifest and implementation as one contract", () => {
    const plugins = new PluginRegistry({ platformVersion: "1.5.0" })

    const registration = plugins.register({
      pluginId: "google-ads-plugin",
      manifest: buildManifest("google_ads"),
      implementation: { setup() {} },
    })

    expect(registration.manifest.connectorId).toBe("google_ads")
    expect(plugins.findByConnector("google_ads")?.pluginId).toBe("google-ads-plugin")
  })

  it("rejects duplicate plugin ids", () => {
    const plugins = new PluginRegistry({ platformVersion: "1.5.0" })
    plugins.register({
      pluginId: "shared-plugin-id",
      manifest: buildManifest("google_ads"),
      implementation: { setup() {} },
    })

    expect(() =>
      plugins.register({
        pluginId: "shared-plugin-id",
        manifest: buildManifest("fake_commerce"),
        implementation: { setup() {} },
      })
    ).toThrow(PluginRegistryError)
  })
})
