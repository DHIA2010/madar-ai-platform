import type { ResolvedTrackingSdkConfiguration } from "./configuration"
import type { StorageAdapter } from "./storage"

export interface ConsentState {
  status: "granted" | "denied" | "partial"
  categories: {
    analytics: boolean
    marketing: boolean
    personalization: boolean
  }
  updatedAt: string
}

export class ConsentManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: ResolvedTrackingSdkConfiguration
  ) {}

  getConsent(): ConsentState | null {
    const raw = this.storage.getItem(this.config.consentStorageKey)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as ConsentState
    } catch {
      return null
    }
  }

  setConsent(consent: ConsentState): void {
    this.storage.setItem(this.config.consentStorageKey, JSON.stringify(consent))
  }
}
