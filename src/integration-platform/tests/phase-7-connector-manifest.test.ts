// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  ConnectorManifestRegistry,
  ConnectorManifestRegistryError,
  type ConnectorManifest,
} from "../manifest"

function googleAdsManifest(): ConnectorManifest {
  return {
    manifestType: "connector-manifest",
    connectorId: "google_ads",
    connectorVersion: "1.2.0",
    sdkVersion: "1.0.0",
    provider: { providerId: "google", displayName: "Google" },
    displayName: "Google Ads",
    authenticationType: "oauth2",
    requiredOAuthScopes: ["https://www.googleapis.com/auth/adwords"],
    capabilities: [
      { capabilityKey: "reporting.read", displayName: "Reporting Read", enabled: true },
      { capabilityKey: "campaign.manage", displayName: "Campaign Manage", enabled: true },
    ],
    supportedObjects: [
      {
        objectId: "campaign",
        displayName: "Campaign",
        fields: [
          {
            fieldId: "campaign_id",
            displayName: "Campaign ID",
            dataType: "string",
            required: true,
          },
          {
            fieldId: "campaign_name",
            displayName: "Campaign Name",
            dataType: "string",
            required: true,
          },
        ],
      },
    ],
    supportedOperations: [
      {
        operationId: "campaign.list",
        displayName: "List Campaigns",
        operationType: "read",
        objectId: "campaign",
        supportedCapabilityKeys: ["reporting.read"],
        supportedWorkflowTypes: ["sync"],
        supportedEvents: ["campaign.synced"],
        supportedCommands: ["campaign.fetch"],
      },
    ],
    workflowTemplates: [
      {
        templateId: "daily-campaign-sync",
        displayName: "Daily Campaign Sync",
        workflowType: "sync",
        operationIds: ["campaign.list"],
        eventIds: ["campaign.synced"],
        commandIds: ["campaign.fetch"],
      },
    ],
    supportedEvents: ["campaign.synced"],
    supportedCommands: ["campaign.fetch"],
    healthChecks: [
      {
        checkId: "oauth-health",
        displayName: "OAuth Health",
        intervalSeconds: 300,
        timeoutMs: 3000,
      },
    ],
    rateLimits: [
      { limitId: "google-api", scope: "connection", maxRequests: 1000, intervalSeconds: 60 },
    ],
    dependencies: [],
    minimumPlatformVersion: "1.0.0",
    maximumPlatformVersion: "2.0.0",
    compatibilityRules: [
      {
        ruleId: "oauth-required",
        description: "OAuth token required for all operations",
        required: true,
      },
    ],
  }
}

function fakeCommerceManifest(): ConnectorManifest {
  return {
    manifestType: "connector-manifest",
    connectorId: "fake_commerce",
    connectorVersion: "3.0.0",
    sdkVersion: "1.0.0",
    provider: { providerId: "fakeinc", displayName: "Fake Inc" },
    displayName: "Fake Commerce",
    authenticationType: "api_key",
    requiredOAuthScopes: [],
    capabilities: [
      { capabilityKey: "orders.read", displayName: "Orders Read", enabled: true },
      { capabilityKey: "payments.events", displayName: "Payments Events", enabled: true },
    ],
    supportedObjects: [
      {
        objectId: "order",
        displayName: "Order",
        fields: [
          { fieldId: "order_id", displayName: "Order ID", dataType: "string", required: true },
          { fieldId: "amount", displayName: "Amount", dataType: "number", required: true },
        ],
      },
    ],
    supportedOperations: [
      {
        operationId: "orders.pull",
        displayName: "Pull Orders",
        operationType: "read",
        objectId: "order",
        supportedCapabilityKeys: ["orders.read"],
        supportedWorkflowTypes: ["sync"],
        supportedEvents: ["orders.synced"],
        supportedCommands: ["orders.pull"],
      },
      {
        operationId: "payments.subscribe",
        displayName: "Subscribe Payments",
        operationType: "action",
        supportedCapabilityKeys: ["payments.events"],
        supportedWorkflowTypes: ["event-driven"],
        supportedEvents: ["payment.received"],
        supportedCommands: ["payments.subscribe"],
      },
    ],
    workflowTemplates: [
      {
        templateId: "order-delta-sync",
        displayName: "Order Delta Sync",
        workflowType: "sync",
        operationIds: ["orders.pull"],
        eventIds: ["orders.synced"],
        commandIds: ["orders.pull"],
      },
    ],
    supportedEvents: ["orders.synced", "payment.received"],
    supportedCommands: ["orders.pull", "payments.subscribe"],
    healthChecks: [
      {
        checkId: "api-key-health",
        displayName: "API Key Health",
        intervalSeconds: 120,
        timeoutMs: 2000,
      },
    ],
    rateLimits: [
      { limitId: "tenant-limit", scope: "workspace", maxRequests: 120, intervalSeconds: 60 },
    ],
    dependencies: [{ dependencyId: "events-core", type: "service", minVersion: "1.0.0" }],
    minimumPlatformVersion: "1.0.0",
    maximumPlatformVersion: "2.0.0",
    compatibilityRules: [
      {
        ruleId: "event-ingestion-required",
        description: "Event ingestion must be enabled",
        required: true,
      },
    ],
  }
}

describe("phase 7 connector manifest", () => {
  it("accepts a valid Google Ads manifest", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    const registered = registry.register(googleAdsManifest())
    expect(registered.connectorId).toBe("google_ads")
  })

  it("accepts a valid fake commerce manifest", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    const registered = registry.register(fakeCommerceManifest())
    expect(registered.connectorId).toBe("fake_commerce")
  })

  it("rejects invalid manifests with missing required fields", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    expect(() =>
      registry.register({ manifestType: "connector-manifest", connectorId: "invalid" })
    ).toThrow(ConnectorManifestRegistryError)
  })

  it("rejects duplicate connector registrations", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    registry.register(googleAdsManifest())
    expect(() => registry.register(googleAdsManifest())).toThrow(ConnectorManifestRegistryError)
  })

  it("rejects version-incompatible manifests", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    const manifest = googleAdsManifest()
    manifest.minimumPlatformVersion = "2.1.0"
    manifest.maximumPlatformVersion = "3.0.0"

    expect(() => registry.register(manifest)).toThrow(ConnectorManifestRegistryError)
  })

  it("rejects capability mismatches and duplicate operation/object ids", () => {
    const registry = new ConnectorManifestRegistry({ platformVersion: "1.5.0" })
    const manifest = fakeCommerceManifest()
    manifest.supportedObjects.push({
      objectId: "order",
      displayName: "Duplicate Order",
      fields: [{ fieldId: "x", displayName: "X", dataType: "string", required: true }],
    })
    manifest.supportedOperations.push({
      operationId: "orders.pull",
      displayName: "Duplicate Orders Pull",
      operationType: "read",
      supportedCapabilityKeys: ["orders.read"],
      supportedWorkflowTypes: ["sync"],
      supportedEvents: ["orders.synced"],
      supportedCommands: ["orders.pull"],
    })
    manifest.supportedOperations[0]!.supportedCapabilityKeys = ["missing.capability"]

    try {
      registry.register(manifest)
      throw new Error("expected manifest registration to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectorManifestRegistryError)
      const issues = (error as ConnectorManifestRegistryError).issues
      expect(issues.some((issue) => issue.code === "capability_consistency")).toBe(true)
      expect(issues.some((issue) => issue.code === "duplicate_object_id")).toBe(true)
      expect(issues.some((issue) => issue.code === "duplicate_operation_id")).toBe(true)
    }
  })
})
