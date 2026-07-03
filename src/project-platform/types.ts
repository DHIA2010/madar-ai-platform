export type ProjectStatus = "active" | "archived" | "deleted"
export type ProjectEnvironment = "development" | "staging" | "production" | "sandbox"
export type ProjectRole = "owner" | "admin" | "manager" | "analyst" | "viewer"

export type DataSourceType =
  | "google_ads"
  | "meta_ads"
  | "tiktok_ads"
  | "snapchat_ads"
  | "google_analytics_4"
  | "shopify"
  | "woocommerce"
  | "salla"
  | "zid"
  | "csv_import"
  | "rest_api"
  | "webhook"
  | "manual_upload"

export type DataSourceStatus = "draft" | "enabled" | "disabled" | "archived" | "deleted"
export type DataSourceHealth = "healthy" | "degraded" | "unhealthy" | "unknown"
export type DataSourceSyncStatus = "idle" | "syncing" | "failed" | "disabled" | "pending"
export type DataSourceConnectionStatus =
  | "connected"
  | "disconnected"
  | "pending"
  | "error"
  | "not_applicable"

export type ProjectMemberStatus = "invited" | "active" | "suspended" | "removed"
export type ProjectInvitationStatus = "pending" | "accepted" | "declined" | "canceled" | "expired"

export const SUPPORTED_DATA_SOURCE_TYPES: DataSourceType[] = [
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "snapchat_ads",
  "google_analytics_4",
  "shopify",
  "woocommerce",
  "salla",
  "zid",
  "csv_import",
  "rest_api",
  "webhook",
  "manual_upload",
]
