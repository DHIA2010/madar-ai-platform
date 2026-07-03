import { ConnectorManifestRegistry, type ConnectorManifest } from "../manifest"

export interface ConnectorPluginImplementation {
  setup(): Promise<void> | void
  teardown?(): Promise<void> | void
}

export interface ConnectorPluginRegistration {
  pluginId: string
  manifest: ConnectorManifest
  implementation: ConnectorPluginImplementation
}

export class PluginRegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PluginRegistryError"
  }
}

export interface PluginRegistryDependencies {
  platformVersion: string
  manifestRegistry?: ConnectorManifestRegistry
}

export class PluginRegistry {
  private readonly manifestRegistry: ConnectorManifestRegistry
  private readonly plugins = new Map<string, ConnectorPluginRegistration>()

  constructor(deps: PluginRegistryDependencies) {
    this.manifestRegistry =
      deps.manifestRegistry ?? new ConnectorManifestRegistry({ platformVersion: deps.platformVersion })
  }

  register(plugin: ConnectorPluginRegistration) {
    if (this.plugins.has(plugin.pluginId)) {
      throw new PluginRegistryError(`Plugin id '${plugin.pluginId}' is already registered.`)
    }

    const manifest = this.manifestRegistry.find(plugin.manifest.connectorId) ?? this.manifestRegistry.register(plugin.manifest)
    const registration = {
      ...plugin,
      manifest,
    }
    this.plugins.set(plugin.pluginId, registration)
    return registration
  }

  list() {
    return [...this.plugins.values()]
  }

  find(pluginId: string) {
    return this.plugins.get(pluginId) ?? null
  }

  findByConnector(connectorId: string) {
    for (const plugin of this.plugins.values()) {
      if (plugin.manifest.connectorId === connectorId) {
        return plugin
      }
    }
    return null
  }
}
