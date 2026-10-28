// Madar Admin's fixed staff roles and what each may do. Every /v1/platform-admin/* route requires
// one of these permissions (see interfaces/rest/platform-admin-routes.ts).

export const PLATFORM_PERMISSIONS = [
  "customers:view",
  "subscriptions:manage",
  "requests:manage",
  "pricing:manage",
  "coupons:manage",
  "billing:view",
  "operations:view",
  "flags:manage",
  "settings:manage",
  "staff:manage",
] as const
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number]

export const PLATFORM_ROLES = ["super_admin", "operations", "finance", "support"] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  // Everything, including staff, settings, and pricing.
  super_admin: PLATFORM_PERMISSIONS,
  // Runs the platform day to day: customers, subscriptions, requests, and operational views.
  operations: [
    "customers:view",
    "subscriptions:manage",
    "requests:manage",
    "operations:view",
    "flags:manage",
  ],
  // Money: subscriptions, requests, pricing, coupons, payments and receipts.
  finance: [
    "customers:view",
    "subscriptions:manage",
    "requests:manage",
    "pricing:manage",
    "coupons:manage",
    "billing:view",
  ],
  // Helps customers: read-only customers and operational views.
  support: ["customers:view", "operations:view"],
}

export function permissionsForRole(role: PlatformRole | null | undefined): PlatformPermission[] {
  return role ? [...PLATFORM_ROLE_PERMISSIONS[role]] : []
}

export interface PlatformStaffEntry {
  userId: string
  role: PlatformRole
  status: "active" | "disabled"
  addedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformStaffRepository {
  findByUserId(userId: string): Promise<PlatformStaffEntry | null>
  list(): Promise<PlatformStaffEntry[]>
  save(entry: PlatformStaffEntry): Promise<void>
}
