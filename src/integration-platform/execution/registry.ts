import type {
  ExecutionEngine,
  ExecutionEngineManifest,
  ExecutionEngineHealthSnapshot,
} from "./contracts"

export interface ExecutionEngineRegistryEntry {
  engineId: string
  manifest: ExecutionEngineManifest
  engine: ExecutionEngine
}

export class ExecutionEngineRegistry {
  private readonly entries = new Map<string, ExecutionEngineRegistryEntry>()

  register(engine: ExecutionEngine, manifest: ExecutionEngineManifest) {
    engine.registerManifest(manifest)
    const entry = { engineId: engine.engineId, manifest, engine }
    this.entries.set(engine.engineId, entry)
    return entry
  }

  find(engineId: string) {
    return this.entries.get(engineId) ?? null
  }

  list() {
    return [...this.entries.values()]
  }

  async health(): Promise<ExecutionEngineHealthSnapshot[]> {
    const snapshots: ExecutionEngineHealthSnapshot[] = []
    for (const entry of this.entries.values()) {
      snapshots.push(await Promise.resolve(entry.engine.healthCheck()))
    }
    return snapshots
  }
}
