"use client"

import { useMemo } from "react"

import type { PermissionContext } from "@/lib/permissions"

import { useTenantContext } from "@/features/workspace"

import { useAuth } from "../hooks"
import { PermissionContextStore } from "../state/permission.context"

import { useApplicationServices } from "@/application"

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth()
  const tenantContext = useTenantContext()
  const { permissionApplicationService } = useApplicationServices()

  const availablePermissions = useMemo(() => {
    if (!currentUser) {
      return []
    }

    const rolePermissions = currentUser.roles.flatMap((role) => role.permissions)
    return Array.from(new Set([...currentUser.permissions, ...rolePermissions]))
  }, [currentUser])

  const defaultContext = useMemo<PermissionContext>(
    () => ({
      organizationId: tenantContext.organizationId ?? undefined,
      workspaceId: tenantContext.workspaceId ?? undefined,
      userId: currentUser?.id,
    }),
    [currentUser?.id, tenantContext.organizationId, tenantContext.workspaceId]
  )

  const value = useMemo(
    () => ({
      currentContext: defaultContext,
      can: (permission: string, context?: PermissionContext) =>
        Boolean(
          permissionApplicationService.can(
            permission,
            availablePermissions,
            context ?? defaultContext
          )
        ),
      canAny: (permissions: string[], context?: PermissionContext) =>
        Boolean(
          permissionApplicationService.canAny(
            permissions,
            availablePermissions,
            context ?? defaultContext
          )
        ),
      canAll: (permissions: string[], context?: PermissionContext) =>
        Boolean(
          permissionApplicationService.canAll(
            permissions,
            availablePermissions,
            context ?? defaultContext
          )
        ),
    }),
    [availablePermissions, defaultContext, permissionApplicationService]
  )

  return <PermissionContextStore.Provider value={value}>{children}</PermissionContextStore.Provider>
}
