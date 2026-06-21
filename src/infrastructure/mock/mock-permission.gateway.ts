import type { PermissionContext } from "@/lib/permissions"

import type { PermissionGateway } from "@/application/contracts/infrastructure.contracts"

export class MockPermissionGateway implements PermissionGateway {
  can(permission: string, availablePermissions: string[], _context?: PermissionContext): boolean {
    return availablePermissions.includes(permission)
  }

  canAny(
    permissions: string[],
    availablePermissions: string[],
    _context?: PermissionContext
  ): boolean {
    return permissions.some((permission) => availablePermissions.includes(permission))
  }

  canAll(
    permissions: string[],
    availablePermissions: string[],
    _context?: PermissionContext
  ): boolean {
    return permissions.every((permission) => availablePermissions.includes(permission))
  }
}

export function createMockPermissionGateway(): PermissionGateway {
  return new MockPermissionGateway()
}
