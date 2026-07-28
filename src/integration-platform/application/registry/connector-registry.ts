import {
  MetadataRegistry,
  type ConnectorCapabilityMetadata,
  type ConnectorMetadataDefinition,
} from "./metadata-registry"

export interface ConnectorDefinition {
  connectorId: string
  displayName: string
  description: string
  version: string
  capabilities: Array<{ key: string; name: string; enabled: boolean; description?: string }>
}

export class ConnectorRegistry {
  private readonly metadataRegistry: MetadataRegistry

  constructor(metadataRegistry = new MetadataRegistry()) {
    this.metadataRegistry = metadataRegistry
  }

  private fromMetadataCapabilities(
    capabilities: ConnectorCapabilityMetadata[]
  ): Array<{ key: string; name: string; enabled: boolean; description?: string }> {
    return capabilities.map((capability) => ({
      key: capability.capabilityKey,
      name: capability.displayName,
      enabled: capability.enabled,
      description: capability.description,
    }))
  }

  private toMetadataCapabilities(
    capabilities: Array<{ key: string; name: string; enabled: boolean; description?: string }>
  ): ConnectorCapabilityMetadata[] {
    return capabilities.map((capability) => ({
      capabilityKey: capability.key,
      displayName: capability.name,
      enabled: capability.enabled,
      description: capability.description,
    }))
  }

  register(definition: ConnectorDefinition) {
    this.metadataRegistry.register({
      connectorId: definition.connectorId,
      displayName: definition.displayName,
      description: definition.description,
      provider: {
        providerId: definition.connectorId,
        displayName: definition.displayName,
      },
      authenticationType: "unknown",
      version: definition.version,
      objects: [],
      capabilities: this.toMetadataCapabilities(definition.capabilities),
      operations: [],
      supportedWorkflowTypes: [],
      supportedEvents: [],
      supportedCommands: [],
      healthChecks: [],
      rateLimits: [],
      workflowTemplates: [],
    })
    return definition
  }

  registerMetadata(definition: ConnectorMetadataDefinition) {
    return this.metadataRegistry.register(definition)
  }

  list() {
    return this.metadataRegistry.list().map((definition) => ({
      connectorId: definition.connectorId,
      displayName: definition.displayName,
      description: definition.description ?? "",
      version: definition.version,
      capabilities: this.fromMetadataCapabilities(definition.capabilities),
    }))
  }

  find(connectorId: string) {
    const definition = this.metadataRegistry.find(connectorId)
    if (!definition) {
      return null
    }
    return {
      connectorId: definition.connectorId,
      displayName: definition.displayName,
      description: definition.description ?? "",
      version: definition.version,
      capabilities: this.fromMetadataCapabilities(definition.capabilities),
    }
  }

  findMetadata(connectorId: string) {
    return this.metadataRegistry.find(connectorId)
  }

  listMetadata() {
    return this.metadataRegistry.list()
  }

  describe(connectorId: string) {
    return this.metadataRegistry.describe(connectorId)
  }

  getCapabilities(connectorId: string) {
    return this.fromMetadataCapabilities(this.metadataRegistry.getCapabilities(connectorId))
  }

  getMetadataRegistry() {
    return this.metadataRegistry
  }
}

