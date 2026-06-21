export interface PermissionContext {
  organizationId?: string
  workspaceId?: string
  userId?: string
  resource?: string
  action?: string
}

export interface PermissionsService {
  can(permission: string, context?: PermissionContext): Promise<boolean> | boolean
  canAny(permissions: string[], context?: PermissionContext): Promise<boolean> | boolean
  canAll(permissions: string[], context?: PermissionContext): Promise<boolean> | boolean
}
