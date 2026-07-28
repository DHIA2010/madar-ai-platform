import type { BackendFoundationConfig } from "./types"
import type { ModuleRegistry } from "./module-registry"
import type { StartupLifecycle } from "./startup-lifecycle"

export async function createHealthSnapshot(
  config: BackendFoundationConfig,
  lifecycle: StartupLifecycle,
  modules: ModuleRegistry
) {
  const moduleHealth = await modules.health()
  const moduleValues = Object.values(moduleHealth)
  const modulesOk = moduleValues.every((item) => item.ok)

  return {
    status: modulesOk ? "ok" : "degraded",
    environment: config.environment,
    version: config.appVersion,
    buildSha: config.buildSha,
    lifecycle: lifecycle.getStatus(),
    modules: moduleHealth,
    timestamp: new Date().toISOString(),
  }
}
