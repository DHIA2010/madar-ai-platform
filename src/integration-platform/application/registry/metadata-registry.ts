export interface ConnectorProviderMetadata {
  providerId: string
  displayName: string
  region?: string
}

export interface ConnectorFieldMetadata {
  fieldKey: string
  displayName: string
  dataType: string
  required: boolean
  filterable?: boolean
  sortable?: boolean
  description?: string
}

export interface ConnectorRelationshipMetadata {
  relationshipKey: string
  sourceObject: string
  targetObject: string
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many"
  description?: string
}

export interface ConnectorMetricMetadata {
  metricKey: string
  displayName: string
  dataType: string
  aggregation: "sum" | "avg" | "min" | "max" | "count" | "custom"
  description?: string
}

export interface ConnectorDimensionMetadata {
  dimensionKey: string
  displayName: string
  dataType: string
  description?: string
}

export interface ConnectorOperationMetadata {
  operationKey: string
  displayName: string
  operationType: "read" | "write" | "mutate" | "action"
  objectKey?: string
  supportedWorkflowTypes: string[]
  supportedEvents: string[]
  supportedCommands: string[]
  supportedCapabilityKeys?: string[]
  description?: string
}

export interface ConnectorCapabilityMetadata {
  capabilityKey: string
  displayName: string
  enabled: boolean
  description?: string
}

export interface ConnectorObjectMetadata {
  objectKey: string
  displayName: string
  fields: ConnectorFieldMetadata[]
  relationships: ConnectorRelationshipMetadata[]
  metrics: ConnectorMetricMetadata[]
  dimensions: ConnectorDimensionMetadata[]
  operations: ConnectorOperationMetadata[]
  description?: string
}

export interface ConnectorHealthCheckMetadata {
  healthCheckKey: string
  displayName: string
  intervalSeconds: number
  timeoutMs: number
  description?: string
}

export interface ConnectorRateLimitMetadata {
  limitKey: string
  scope: "global" | "organization" | "workspace" | "connection"
  maxRequests: number
  intervalSeconds: number
}

export interface ConnectorWorkflowTemplateMetadata {
  templateKey: string
  displayName: string
  workflowType: string
  operationKeys: string[]
  eventKeys: string[]
  commandKeys: string[]
  description?: string
}

export interface ConnectorMetadataDefinition {
  connectorId: string
  displayName: string
  provider: ConnectorProviderMetadata
  authenticationType: string
  version: string
  objects: ConnectorObjectMetadata[]
  capabilities: ConnectorCapabilityMetadata[]
  operations: ConnectorOperationMetadata[]
  supportedWorkflowTypes: string[]
  supportedEvents: string[]
  supportedCommands: string[]
  healthChecks: ConnectorHealthCheckMetadata[]
  rateLimits: ConnectorRateLimitMetadata[]
  workflowTemplates: ConnectorWorkflowTemplateMetadata[]
  description?: string
}

export class MetadataRegistry {
  private readonly definitions = new Map<string, ConnectorMetadataDefinition>()

  register(definition: ConnectorMetadataDefinition) {
    this.definitions.set(definition.connectorId, definition)
    return definition
  }

  registerMany(definitions: ConnectorMetadataDefinition[]) {
    return definitions.map((definition) => this.register(definition))
  }

  list() {
    return [...this.definitions.values()]
  }

  find(connectorId: string) {
    return this.definitions.get(connectorId) ?? null
  }

  has(connectorId: string) {
    return this.definitions.has(connectorId)
  }

  getCapabilities(connectorId: string) {
    return this.find(connectorId)?.capabilities ?? []
  }

  getObjects(connectorId: string) {
    return this.find(connectorId)?.objects ?? []
  }

  getFields(connectorId: string, objectKey: string) {
    return this.getObjects(connectorId).find((entry) => entry.objectKey === objectKey)?.fields ?? []
  }

  getOperations(connectorId: string, objectKey?: string) {
    const definition = this.find(connectorId)
    if (!definition) {
      return []
    }
    if (!objectKey) {
      return definition.operations
    }
    return definition.operations.filter((operation) => operation.objectKey === objectKey)
  }

  getWorkflowTemplates(connectorId: string) {
    return this.find(connectorId)?.workflowTemplates ?? []
  }

  describe(connectorId: string) {
    const definition = this.find(connectorId)
    if (!definition) {
      return null
    }
    return {
      connector: {
        connectorId: definition.connectorId,
        displayName: definition.displayName,
        description: definition.description ?? "",
        version: definition.version,
      },
      provider: definition.provider,
      authenticationType: definition.authenticationType,
      capabilities: definition.capabilities,
      objects: definition.objects,
      operations: definition.operations,
      workflowTemplates: definition.workflowTemplates,
      supportedWorkflowTypes: definition.supportedWorkflowTypes,
      supportedEvents: definition.supportedEvents,
      supportedCommands: definition.supportedCommands,
      healthChecks: definition.healthChecks,
      rateLimits: definition.rateLimits,
      version: definition.version,
    }
  }
}
