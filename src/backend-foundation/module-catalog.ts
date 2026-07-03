import type { BackendModuleDefinition } from "./types"

type ModuleLoader = () => Promise<BackendModuleDefinition>

const moduleCatalog: Record<string, ModuleLoader> = {
  identity: async () => (await import("../identity-platform/module")).createIdentityModuleDefinition(),
  project: async () => (await import("../project-platform/module")).createProjectModuleDefinition(),
}

export function listKnownModules() {
  return Object.keys(moduleCatalog)
}

export async function discoverBackendModules(moduleIds: string[]) {
  const definitions: BackendModuleDefinition[] = []

  for (const moduleId of moduleIds) {
    const loader = moduleCatalog[moduleId]
    if (!loader) {
      throw new Error(`Unknown module '${moduleId}'. Known modules: ${listKnownModules().join(", ")}`)
    }
    definitions.push(await loader())
  }

  return definitions
}
