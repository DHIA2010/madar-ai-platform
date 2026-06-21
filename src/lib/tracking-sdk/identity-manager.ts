import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type { StorageAdapter } from "./storage"

export class IdentityManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: ResolvedTrackingSdkConfiguration
  ) {}

  getCustomerId(): string | null {
    return this.storage.getItem(this.config.identityStorageKey)
  }

  setCustomerId(customerId: string): void {
    this.storage.setItem(this.config.identityStorageKey, customerId)
  }
}
