import { loadBackendFoundationConfig } from "../configuration"
import { discoverBackendModules } from "../module-catalog"
import { createModuleRegistry } from "../module-registry"
import { createHealthSnapshot } from "../health-observability"
import { ConsoleFoundationLogger } from "../infrastructure-layer"
import { StartupLifecycle } from "../startup-lifecycle"

export async function createBackendFoundation(moduleIds = ["identity", "project"]) {
  const config = loadBackendFoundationConfig()
  const logger = new ConsoleFoundationLogger()
  const lifecycle = new StartupLifecycle(logger)
  const registry = createModuleRegistry()

  const modules = await discoverBackendModules(moduleIds)
  for (const moduleDefinition of modules) {
    registry.register(moduleDefinition)
  }

  return {
    config,
    logger,
    lifecycle,
    registry,
    health: () => createHealthSnapshot(config, lifecycle, registry),
  }
}
