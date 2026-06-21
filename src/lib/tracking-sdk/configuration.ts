import type { TrackingAuthMode } from "./contracts"

export type StorageBackendType = "cookie" | "localStorage" | "sessionStorage" | "memory"

export interface TrackingSdkConfiguration {
  trackingKey?: string
  apiUrl: string
  tenantId: string
  workspaceId: string
  debugMode?: boolean
  autoTracking?: boolean
  retryCount?: number
  batchSize?: number
  flushIntervalMs?: number
  authMode?: TrackingAuthMode
  storageBackend?: StorageBackendType
  queueStorageKey?: string
  sessionStorageKey?: string
  visitorStorageKey?: string
  identityStorageKey?: string
  consentStorageKey?: string
  signatureProvider?: (body: string) => string | Promise<string>
}

export interface ResolvedTrackingSdkConfiguration extends TrackingSdkConfiguration {
  debugMode: boolean
  autoTracking: boolean
  retryCount: number
  batchSize: number
  flushIntervalMs: number
  authMode: TrackingAuthMode
  storageBackend: StorageBackendType
  queueStorageKey: string
  sessionStorageKey: string
  visitorStorageKey: string
  identityStorageKey: string
  consentStorageKey: string
}

export class Configuration {
  static resolve(config: TrackingSdkConfiguration): ResolvedTrackingSdkConfiguration {
    return {
      ...config,
      debugMode: config.debugMode ?? false,
      autoTracking: config.autoTracking ?? true,
      retryCount: config.retryCount ?? 3,
      batchSize: config.batchSize ?? 20,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      authMode: config.authMode ?? "public",
      storageBackend: config.storageBackend ?? "localStorage",
      queueStorageKey: config.queueStorageKey ?? "tracking_sdk_queue_v1",
      sessionStorageKey: config.sessionStorageKey ?? "tracking_sdk_session_v1",
      visitorStorageKey: config.visitorStorageKey ?? "tracking_sdk_visitor_v1",
      identityStorageKey: config.identityStorageKey ?? "tracking_sdk_identity_v1",
      consentStorageKey: config.consentStorageKey ?? "tracking_sdk_consent_v1",
    }
  }
}

export function resolveConfiguration(
  config: TrackingSdkConfiguration
): ResolvedTrackingSdkConfiguration {
  return Configuration.resolve(config)
}
