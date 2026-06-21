import type { StateStorage } from "zustand/middleware"

import type { KeyValueStorage, StorageScope } from "./storage-adapter"
import { createStorageAdapter } from "./storage-adapter"

export function createZustandStorageAdapter(storage: KeyValueStorage): StateStorage {
  return {
    getItem: (name) => storage.getItem(name),
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: (name) => storage.removeItem(name),
  }
}

export function createScopedZustandStorage(scope: StorageScope = "local"): StateStorage {
  return createZustandStorageAdapter(createStorageAdapter(scope))
}
