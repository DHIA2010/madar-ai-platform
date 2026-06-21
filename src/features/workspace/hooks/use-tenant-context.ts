"use client"

import { useWorkspace } from "./use-workspace"

export function useTenantContext() {
  return useWorkspace().tenantContext
}
