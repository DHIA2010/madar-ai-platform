import { createContext } from "react"

import type { PermissionContext } from "@/lib/permissions"

export interface PermissionContextValue {
  currentContext: PermissionContext
  can: (permission: string, context?: PermissionContext) => boolean
  canAny: (permissions: string[], context?: PermissionContext) => boolean
  canAll: (permissions: string[], context?: PermissionContext) => boolean
}

export const PermissionContextStore = createContext<PermissionContextValue | null>(null)
