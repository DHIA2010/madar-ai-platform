import type { ConnectorOperationMetadata, MetadataRegistry } from "./metadata-registry"

export class CapabilityRegistry {
  constructor(private readonly metadataRegistry: MetadataRegistry) {}

  list(connectorId: string) {
    return this.metadataRegistry.getCapabilities(connectorId)
  }

  supports(connectorId: string, capabilityKey: string) {
    return this.list(connectorId).some(
      (capability) => capability.capabilityKey === capabilityKey && capability.enabled
    )
  }

  findCapability(connectorId: string, capabilityKey: string) {
    return (
      this.list(connectorId).find((capability) => capability.capabilityKey === capabilityKey) ??
      null
    )
  }

  listConnectorsForCapability(capabilityKey: string) {
    return this.metadataRegistry
      .list()
      .filter((definition) =>
        definition.capabilities.some(
          (capability) => capability.capabilityKey === capabilityKey && capability.enabled
        )
      )
      .map((definition) => definition.connectorId)
  }

  resolveOperations(connectorId: string, capabilityKey: string): ConnectorOperationMetadata[] {
    const operations = this.metadataRegistry.getOperations(connectorId)
    return operations.filter(
      (operation) => operation.supportedCapabilityKeys?.includes(capabilityKey) ?? false
    )
  }
}
