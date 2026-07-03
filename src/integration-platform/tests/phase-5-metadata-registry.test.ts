// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  MetadataRegistry,
  type ConnectorMetadataDefinition,
} from "../application"

function googleAdsMetadata(): ConnectorMetadataDefinition {
  return {
    connectorId: "google_ads",
    displayName: "Google Ads",
    description: "Ads campaign and reporting connector.",
    provider: {
      providerId: "google",
      displayName: "Google",
      region: "global",
    },
    authenticationType: "oauth2",
    version: "1.0.0",
    capabilities: [
      { capabilityKey: "reporting.read", displayName: "Reporting Read", enabled: true },
      { capabilityKey: "campaign.manage", displayName: "Campaign Manage", enabled: true },
    ],
    objects: [
      {
        objectKey: "campaign",
        displayName: "Campaign",
        fields: [
          { fieldKey: "id", displayName: "Campaign ID", dataType: "string", required: true },
          { fieldKey: "name", displayName: "Campaign Name", dataType: "string", required: true },
        ],
        relationships: [
          {
            relationshipKey: "campaign_to_ad_group",
            sourceObject: "campaign",
            targetObject: "ad_group",
            cardinality: "one-to-many",
          },
        ],
        metrics: [
          {
            metricKey: "clicks",
            displayName: "Clicks",
            dataType: "number",
            aggregation: "sum",
          },
        ],
        dimensions: [
          {
            dimensionKey: "date",
            displayName: "Date",
            dataType: "date",
          },
        ],
        operations: [
          {
            operationKey: "campaign.list",
            displayName: "List Campaigns",
            operationType: "read",
            objectKey: "campaign",
            supportedWorkflowTypes: ["sync"],
            supportedEvents: ["campaign.synced"],
            supportedCommands: ["campaign.fetch"],
            supportedCapabilityKeys: ["reporting.read"],
          },
        ],
      },
    ],
    operations: [
      {
        operationKey: "campaign.list",
        displayName: "List Campaigns",
        operationType: "read",
        objectKey: "campaign",
        supportedWorkflowTypes: ["sync"],
        supportedEvents: ["campaign.synced"],
        supportedCommands: ["campaign.fetch"],
        supportedCapabilityKeys: ["reporting.read"],
      },
    ],
    supportedWorkflowTypes: ["sync", "report"],
    supportedEvents: ["campaign.synced"],
    supportedCommands: ["campaign.fetch"],
    healthChecks: [
      {
        healthCheckKey: "oauth-token-health",
        displayName: "OAuth Token Health",
        intervalSeconds: 300,
        timeoutMs: 3000,
      },
    ],
    rateLimits: [
      {
        limitKey: "google-api-global",
        scope: "connection",
        maxRequests: 1000,
        intervalSeconds: 60,
      },
    ],
    workflowTemplates: [
      {
        templateKey: "daily-campaign-report",
        displayName: "Daily Campaign Report",
        workflowType: "report",
        operationKeys: ["campaign.list"],
        eventKeys: ["campaign.synced"],
        commandKeys: ["campaign.fetch"],
      },
    ],
  }
}

function fakeCommerceMetadata(): ConnectorMetadataDefinition {
  return {
    connectorId: "fake_commerce",
    displayName: "Fake Commerce",
    description: "Commerce orders and payment events connector.",
    provider: {
      providerId: "fakeinc",
      displayName: "Fake Inc",
      region: "regional",
    },
    authenticationType: "api_key",
    version: "2.5.0",
    capabilities: [
      { capabilityKey: "orders.read", displayName: "Orders Read", enabled: true },
      { capabilityKey: "payments.events", displayName: "Payments Events", enabled: true },
    ],
    objects: [
      {
        objectKey: "order",
        displayName: "Order",
        fields: [
          { fieldKey: "order_id", displayName: "Order ID", dataType: "string", required: true },
          { fieldKey: "total", displayName: "Total", dataType: "number", required: true },
        ],
        relationships: [],
        metrics: [
          {
            metricKey: "gross_revenue",
            displayName: "Gross Revenue",
            dataType: "number",
            aggregation: "sum",
          },
        ],
        dimensions: [
          {
            dimensionKey: "store_id",
            displayName: "Store",
            dataType: "string",
          },
        ],
        operations: [
          {
            operationKey: "orders.pull",
            displayName: "Pull Orders",
            operationType: "read",
            objectKey: "order",
            supportedWorkflowTypes: ["sync", "event-driven"],
            supportedEvents: ["order.created"],
            supportedCommands: ["orders.pull"],
            supportedCapabilityKeys: ["orders.read"],
          },
        ],
      },
    ],
    operations: [
      {
        operationKey: "orders.pull",
        displayName: "Pull Orders",
        operationType: "read",
        objectKey: "order",
        supportedWorkflowTypes: ["sync", "event-driven"],
        supportedEvents: ["order.created"],
        supportedCommands: ["orders.pull"],
        supportedCapabilityKeys: ["orders.read"],
      },
      {
        operationKey: "payments.subscribe",
        displayName: "Subscribe Payments",
        operationType: "action",
        supportedWorkflowTypes: ["event-driven"],
        supportedEvents: ["payment.succeeded"],
        supportedCommands: ["payments.subscribe"],
        supportedCapabilityKeys: ["payments.events"],
      },
    ],
    supportedWorkflowTypes: ["sync", "event-driven"],
    supportedEvents: ["order.created", "payment.succeeded"],
    supportedCommands: ["orders.pull", "payments.subscribe"],
    healthChecks: [
      {
        healthCheckKey: "api-key-health",
        displayName: "API Key Health",
        intervalSeconds: 120,
        timeoutMs: 2000,
      },
    ],
    rateLimits: [
      {
        limitKey: "fake-commerce-tenant",
        scope: "workspace",
        maxRequests: 120,
        intervalSeconds: 60,
      },
    ],
    workflowTemplates: [
      {
        templateKey: "order-delta-sync",
        displayName: "Order Delta Sync",
        workflowType: "sync",
        operationKeys: ["orders.pull"],
        eventKeys: ["order.created"],
        commandKeys: ["orders.pull"],
      },
    ],
  }
}

function describeUnknownConnector(registry: MetadataRegistry, connectorId: string) {
  const descriptor = registry.describe(connectorId)
  if (!descriptor) {
    return null
  }

  return {
    connectorId: descriptor.connector.connectorId,
    providerId: descriptor.provider.providerId,
    objectCount: descriptor.objects.length,
    capabilityKeys: descriptor.capabilities.map((capability) => capability.capabilityKey),
    operationKeys: descriptor.operations.map((operation) => operation.operationKey),
    workflowTemplateKeys: descriptor.workflowTemplates.map((template) => template.templateKey),
    authType: descriptor.authenticationType,
  }
}

describe("phase 5 metadata registry", () => {
  it("represents heterogeneous connectors with one provider-agnostic metadata model", () => {
    const registry = new MetadataRegistry()
    registry.registerMany([googleAdsMetadata(), fakeCommerceMetadata()])

    const googleDescriptor = describeUnknownConnector(registry, "google_ads")
    const fakeDescriptor = describeUnknownConnector(registry, "fake_commerce")

    expect(googleDescriptor).toEqual({
      connectorId: "google_ads",
      providerId: "google",
      objectCount: 1,
      capabilityKeys: ["reporting.read", "campaign.manage"],
      operationKeys: ["campaign.list"],
      workflowTemplateKeys: ["daily-campaign-report"],
      authType: "oauth2",
    })

    expect(fakeDescriptor).toEqual({
      connectorId: "fake_commerce",
      providerId: "fakeinc",
      objectCount: 1,
      capabilityKeys: ["orders.read", "payments.events"],
      operationKeys: ["orders.pull", "payments.subscribe"],
      workflowTemplateKeys: ["order-delta-sync"],
      authType: "api_key",
    })
  })

  it("answers capability, object, field, and operation lookups without provider-specific logic", () => {
    const registry = new MetadataRegistry()
    registry.registerMany([googleAdsMetadata(), fakeCommerceMetadata()])

    expect(registry.getCapabilities("google_ads").map((entry) => entry.capabilityKey)).toEqual([
      "reporting.read",
      "campaign.manage",
    ])
    expect(registry.getObjects("fake_commerce").map((entry) => entry.objectKey)).toEqual(["order"])
    expect(registry.getFields("fake_commerce", "order").map((entry) => entry.fieldKey)).toEqual([
      "order_id",
      "total",
    ])
    expect(registry.getOperations("google_ads", "campaign").map((entry) => entry.operationKey)).toEqual([
      "campaign.list",
    ])
  })
})
