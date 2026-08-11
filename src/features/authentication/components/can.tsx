"use client"

import { usePermissions } from "../hooks/use-permissions"

export interface CanProps {
  permission: string
  fallback?: React.ReactNode
  children: React.ReactNode
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const { can } = usePermissions()
  return can(permission) ? <>{children}</> : <>{fallback}</>
}
