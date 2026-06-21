"use client"

import { useWorkspace } from "./use-workspace"

export function useWorkspaceSwitcher() {
  const {
    switchWorkspace,
    createOrganization,
    createWorkspace,
    workspaceStatus,
    availableOrganizations,
    availableWorkspaces,
  } = useWorkspace()

  return {
    switchWorkspace,
    createOrganization,
    createWorkspace,
    workspaceStatus,
    availableOrganizations,
    availableWorkspaces,
  }
}
