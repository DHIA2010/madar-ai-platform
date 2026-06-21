import type { StorageBackendType } from "./configuration"

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class Storage {
  constructor(private readonly adapter: StorageAdapter) {}

  get(key: string): string | null {
    return this.adapter.getItem(key)
  }

  set(key: string, value: string): void {
    this.adapter.setItem(key, value)
  }

  remove(key: string): void {
    this.adapter.removeItem(key)
  }
}

class MemoryStorageAdapter implements StorageAdapter {
  private readonly data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

class LocalStorageAdapter implements StorageAdapter {
  private readonly fallback = new MemoryStorageAdapter()

  getItem(key: string): string | null {
    if (typeof window === "undefined") {
      return this.fallback.getItem(key)
    }

    try {
      return window.localStorage.getItem(key)
    } catch {
      return this.fallback.getItem(key)
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      this.fallback.setItem(key, value)
      return
    }

    try {
      window.localStorage.setItem(key, value)
    } catch {
      this.fallback.setItem(key, value)
    }
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      this.fallback.removeItem(key)
      return
    }

    try {
      window.localStorage.removeItem(key)
    } catch {
      this.fallback.removeItem(key)
    }
  }
}

class SessionStorageAdapter implements StorageAdapter {
  private readonly fallback = new MemoryStorageAdapter()

  getItem(key: string): string | null {
    if (typeof window === "undefined") {
      return this.fallback.getItem(key)
    }

    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return this.fallback.getItem(key)
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      this.fallback.setItem(key, value)
      return
    }

    try {
      window.sessionStorage.setItem(key, value)
    } catch {
      this.fallback.setItem(key, value)
    }
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      this.fallback.removeItem(key)
      return
    }

    try {
      window.sessionStorage.removeItem(key)
    } catch {
      this.fallback.removeItem(key)
    }
  }
}

class CookieStorageAdapter implements StorageAdapter {
  private readonly fallback = new MemoryStorageAdapter()

  getItem(key: string): string | null {
    if (typeof document === "undefined") {
      return this.fallback.getItem(key)
    }

    const encodedKey = encodeURIComponent(key)
    const entries = document.cookie.split(";")

    for (const entry of entries) {
      const [rawName, ...rest] = entry.trim().split("=")
      if (rawName === encodedKey) {
        return decodeURIComponent(rest.join("="))
      }
    }

    return null
  }

  setItem(key: string, value: string): void {
    if (typeof document === "undefined") {
      this.fallback.setItem(key, value)
      return
    }

    const encodedKey = encodeURIComponent(key)
    const encodedValue = encodeURIComponent(value)
    document.cookie = `${encodedKey}=${encodedValue}; path=/; SameSite=Lax`
  }

  removeItem(key: string): void {
    if (typeof document === "undefined") {
      this.fallback.removeItem(key)
      return
    }

    const encodedKey = encodeURIComponent(key)
    document.cookie = `${encodedKey}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  }
}

export function createStorageAdapter(storageBackend: StorageBackendType): StorageAdapter {
  switch (storageBackend) {
    case "cookie":
      return new CookieStorageAdapter()
    case "sessionStorage":
      return new SessionStorageAdapter()
    case "memory":
      return new MemoryStorageAdapter()
    case "localStorage":
    default:
      return new LocalStorageAdapter()
  }
}
