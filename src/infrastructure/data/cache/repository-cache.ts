interface CacheEntry<TValue> {
  value: TValue
  expiresAt: number
  tags: string[]
}

interface CacheSetOptions {
  ttlMs?: number
  tags?: string[]
}

export class RepositoryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>()

  constructor(private readonly defaultTtlMs = 60_000) {}

  get<TValue>(key: string): TValue | null {
    const entry = this.store.get(key)

    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value as TValue
  }

  set<TValue>(key: string, value: TValue, options?: CacheSetOptions): TValue {
    const ttlMs = options?.ttlMs ?? this.defaultTtlMs
    const expiresAt = Date.now() + Math.max(1, ttlMs)

    this.store.set(key, {
      value,
      expiresAt,
      tags: options?.tags ?? [],
    })

    return value
  }

  invalidateByTag(tag: string) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.includes(tag)) {
        this.store.delete(key)
      }
    }
  }

  invalidateWorkspace(workspaceId: string | null | undefined) {
    const workspaceTag = `workspace:${workspaceId ?? "global"}`
    this.invalidateByTag(workspaceTag)
  }

  clear() {
    this.store.clear()
  }
}

export function createWorkspaceCacheKey(
  namespace: string,
  workspaceId: string | null | undefined,
  scope: string
) {
  return `${namespace}:${workspaceId ?? "global"}:${scope}`
}
