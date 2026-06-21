import type { PermissionContext } from "@/lib/permissions"

import type { PermissionGateway } from "../contracts"

export class PermissionApplicationService {
  constructor(private readonly gateway: PermissionGateway) {}

  can(permission: string, availablePermissions: string[], context?: PermissionContext) {
    return this.gateway.can(permission, availablePermissions, context)
  }

  canAny(permissions: string[], availablePermissions: string[], context?: PermissionContext) {
    return this.gateway.canAny(permissions, availablePermissions, context)
  }

  canAll(permissions: string[], availablePermissions: string[], context?: PermissionContext) {
    return this.gateway.canAll(permissions, availablePermissions, context)
  }
}
