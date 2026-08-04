"use client"

import { useWorkspace } from "./use-workspace"

export function useWorkspaceSwitcher() {
  const {
    switchWorkspace,
    createOrganization,
    createWorkspace,
    updateOrganization,
    archiveOrganization,
    restoreOrganization,
    updateWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    workspaceStatus,
    availableOrganizations,
    availableWorkspaces,
  } = useWorkspace()

  return {
    switchWorkspace,
    createOrganization,
    createWorkspace,
    updateOrganization,
    archiveOrganization,
    restoreOrganization,
    updateWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    workspaceStatus,
    availableOrganizations,
    availableWorkspaces,
  }
}
