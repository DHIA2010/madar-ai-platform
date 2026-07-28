// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  CapabilityRegistry,
  MetadataRegistry,
  type ConnectorMetadataDefinition,
} from "../application"

function connectorDefinitions(): ConnectorMetadataDefinition[] {
  return [
    {
      connectorId: "google_ads",
      displayName: "Google Ads",
      provider: { providerId: "google", displayName: "Google" },
      authenticationType: "oauth2",
      version: "1.0.0",
      description: "Ads connector",
      objects: [],
      capabilities: [
        { capabilityKey: "reporting.read", displayName: "Reporting Read", enabled: true },
      ],
      operations: [
        {
          operationKey: "campaign.list",
          displayName: "List Campaigns",
          operationType: "read",
          supportedWorkflowTypes: ["sync"],
          supportedEvents: ["campaign.synced"],
          supportedCommands: ["campaign.fetch"],
          supportedCapabilityKeys: ["reporting.read"],
        },
      ],
      supportedWorkflowTypes: ["sync"],
      supportedEvents: ["campaign.synced"],
      supportedCommands: ["campaign.fetch"],
      healthChecks: [],
      rateLimits: [],
      workflowTemplates: [],
    },
    {
      connectorId: "fake_commerce",
      displayName: "Fake Commerce",
      provider: { providerId: "fakeinc", displayName: "Fake Inc" },
      authenticationType: "api_key",
      version: "1.0.0",
      description: "Commerce connector",
      objects: [],
      capabilities: [
        { capabilityKey: "orders.read", displayName: "Orders Read", enabled: true },
        { capabilityKey: "reporting.read", displayName: "Reporting Read", enabled: false },
      ],
      operations: [
        {
          operationKey: "orders.pull",
          displayName: "Pull Orders",
          operationType: "read",
          supportedWorkflowTypes: ["sync"],
          supportedEvents: ["order.created"],
          supportedCommands: ["orders.pull"],
          supportedCapabilityKeys: ["orders.read"],
        },
      ],
      supportedWorkflowTypes: ["sync"],
      supportedEvents: ["order.created"],
      supportedCommands: ["orders.pull"],
      healthChecks: [],
      rateLimits: [],
      workflowTemplates: [],
    },
  ]
}

describe("phase 6 capability registry", () => {
  it("indexes capability support from metadata registry without provider branching", () => {
    const metadataRegistry = new MetadataRegistry()
    metadataRegistry.registerMany(connectorDefinitions())

    const capabilityRegistry = new CapabilityRegistry(metadataRegistry)

    expect(capabilityRegistry.supports("google_ads", "reporting.read")).toBe(true)
    expect(capabilityRegistry.supports("fake_commerce", "reporting.read")).toBe(false)
    expect(capabilityRegistry.supports("fake_commerce", "orders.read")).toBe(true)

    expect(capabilityRegistry.listConnectorsForCapability("reporting.read")).toEqual(["google_ads"])
  })

  it("resolves capability-linked operations from metadata", () => {
    const metadataRegistry = new MetadataRegistry()
    metadataRegistry.registerMany(connectorDefinitions())

    const capabilityRegistry = new CapabilityRegistry(metadataRegistry)

    expect(capabilityRegistry.resolveOperations("google_ads", "reporting.read")).toEqual([
      expect.objectContaining({ operationKey: "campaign.list" }),
    ])
    expect(capabilityRegistry.resolveOperations("fake_commerce", "orders.read")).toEqual([
      expect.objectContaining({ operationKey: "orders.pull" }),
    ])
  })
})
