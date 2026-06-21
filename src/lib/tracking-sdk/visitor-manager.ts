import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type { StorageAdapter } from "./storage"

function createVisitorId() {
  return `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export class VisitorManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: ResolvedTrackingSdkConfiguration
  ) {}

  getVisitorId(): string {
    const existing = this.storage.getItem(this.config.visitorStorageKey)
    if (existing) {
      return existing
    }

    const visitorId = createVisitorId()
    this.storage.setItem(this.config.visitorStorageKey, visitorId)
    return visitorId
  }
}
