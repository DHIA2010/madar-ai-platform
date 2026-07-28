import type { Permission, Role } from "../../types"

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "org:read",
    "org:write",
    "org:invite",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "session:revoke",
    "identity:read",
    "identity:write",
  ],
  admin: [
    "org:read",
    "org:invite",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "session:revoke",
    "identity:read",
    "identity:write",
  ],
  manager: [
    "org:read",
    "workspace:read",
    "workspace:write",
    "workspace:switch",
    "membership:write",
    "session:read",
    "identity:read",
    "identity:write",
  ],
  analyst: ["org:read", "workspace:read", "workspace:switch", "session:read", "identity:read"],
  viewer: ["org:read", "workspace:read", "workspace:switch", "identity:read"],
}

export function resolvePermissions(roles: Role[]): Permission[] {
  const dedup = new Set<Permission>()
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      dedup.add(permission)
    }
  }
  return [...dedup]
}

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return resolvePermissions(roles).includes(permission)
}
