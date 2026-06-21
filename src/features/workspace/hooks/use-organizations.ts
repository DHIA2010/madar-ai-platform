"use client"

import { useWorkspace } from "./use-workspace"

export function useOrganizations() {
  const { availableOrganizations, currentOrganization, workspaceStatus } = useWorkspace()

  return {
    organizations: availableOrganizations,
    currentOrganization,
    workspaceStatus,
  }
}
