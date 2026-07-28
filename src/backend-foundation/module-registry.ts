import type { BackendModuleDefinition, ModuleHealth } from "./types"

export class ModuleRegistry {
  private readonly modules = new Map<string, BackendModuleDefinition>()

  register(moduleDefinition: BackendModuleDefinition) {
    const existing = this.modules.get(moduleDefinition.id)
    if (existing) {
      throw new Error(`Module '${moduleDefinition.id}' is already registered.`)
    }
    this.modules.set(moduleDefinition.id, moduleDefinition)
  }

  get(moduleId: string) {
    return this.modules.get(moduleId) ?? null
  }

  list() {
    return [...this.modules.values()]
  }

  async health(): Promise<Record<string, ModuleHealth>> {
    const entries = await Promise.all(this.list().map(async (moduleDefinition) => {
      if (!moduleDefinition.healthCheck) {
        return [moduleDefinition.id, { ok: true, status: "ok", details: { mode: "not-configured" } } satisfies ModuleHealth] as const
      }

      try {
        return [moduleDefinition.id, await moduleDefinition.healthCheck()] as const
      } catch (error) {
        return [
          moduleDefinition.id,
          {
            ok: false,
            status: "down",
            details: {
              message: error instanceof Error ? error.message : String(error),
            },
          } satisfies ModuleHealth,
        ] as const
      }
    }))

    return Object.fromEntries(entries)
  }
}

export function createModuleRegistry() {
  return new ModuleRegistry()
}
