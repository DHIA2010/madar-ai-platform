export type StorageScope = "local" | "session"

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
}

export class MemoryStorageAdapter implements KeyValueStorage {
  private readonly store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

function getWebStorage(scope: StorageScope): Storage | null {
  if (typeof window === "undefined") {
    return null
  }

  if (scope === "session") {
    return typeof window.sessionStorage === "undefined" ? null : window.sessionStorage
  }

  return typeof window.localStorage === "undefined" ? null : window.localStorage
}

export function createStorageAdapter(
  scope: StorageScope = "local",
  fallback: KeyValueStorage = new MemoryStorageAdapter()
): KeyValueStorage {
  return getWebStorage(scope) ?? fallback
}

export function clearStorageScope(scope: StorageScope = "local") {
  createStorageAdapter(scope).clear()
}
