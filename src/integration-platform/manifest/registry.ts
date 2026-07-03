import type { ConnectorManifest, ManifestValidationIssue } from "./contracts"
import { validateConnectorManifest } from "./validation"

export class ConnectorManifestRegistryError extends Error {
  readonly issues: ManifestValidationIssue[]

  constructor(message: string, issues: ManifestValidationIssue[]) {
    super(message)
    this.name = "ConnectorManifestRegistryError"
    this.issues = issues
  }
}

export interface ConnectorManifestRegistryDependencies {
  platformVersion: string
}

export class ConnectorManifestRegistry {
  private readonly manifests = new Map<string, ConnectorManifest>()

  constructor(private readonly deps: ConnectorManifestRegistryDependencies) {}

  register(input: unknown) {
    const result = validateConnectorManifest(input, {
      currentPlatformVersion: this.deps.platformVersion,
      existingConnectorIds: [...this.manifests.keys()],
    })

    if (!result.ok || !result.manifest) {
      throw new ConnectorManifestRegistryError("Connector manifest validation failed.", result.issues)
    }

    this.manifests.set(result.manifest.connectorId, result.manifest)
    return result.manifest
  }

  list() {
    return [...this.manifests.values()]
  }

  find(connectorId: string) {
    return this.manifests.get(connectorId) ?? null
  }

  has(connectorId: string) {
    return this.manifests.has(connectorId)
  }
}
