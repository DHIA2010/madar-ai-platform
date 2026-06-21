export const DASHBOARD_PACKAGE_IDS = {
  marketing: "marketing-dashboard",
} as const

export const DASHBOARD_WIDGET_SLOTS = [
  "hero",
  "executive",
  "analytics",
  "diagnostics",
  "recommendations",
  "operations",
  "footer",
] as const

export const DASHBOARD_WIDGET_STATES = [
  "loading",
  "ready",
  "empty",
  "partial",
  "stale",
  "refreshing",
  "error",
] as const

export const DASHBOARD_REFRESH_REASONS = [
  "manual",
  "workspace-change",
  "route-enter",
  "query-invalidation",
] as const

export const DASHBOARD_SLOT_ORDER = {
  hero: 0,
  executive: 1,
  analytics: 2,
  diagnostics: 3,
  recommendations: 4,
  operations: 5,
  footer: 6,
} as const
