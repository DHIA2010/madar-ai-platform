"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { createLocalZustandStorage } from "@/lib/browser-storage"

import type { Organization, Workspace, WorkspaceStatus } from "../types"

interface WorkspaceStoreState {
  currentWorkspace: Workspace | null
  currentOrganization: Organization | null
  availableWorkspaces: Workspace[]
  availableOrganizations: Organization[]
  customWorkspaces: Workspace[]
  customOrganizations: Organization[]
  workspaceStatus: WorkspaceStatus
  setCurrentWorkspace: (workspace: Workspace | null) => void
  setCurrentOrganization: (organization: Organization | null) => void
  setAvailableWorkspaces: (workspaces: Workspace[]) => void
  setAvailableOrganizations: (organizations: Organization[]) => void
  addCustomWorkspace: (workspace: Workspace) => void
  addCustomOrganization: (organization: Organization) => void
  setWorkspaceStatus: (status: WorkspaceStatus) => void
  clearSelection: () => void
}

const initialState = {
  currentWorkspace: null,
  currentOrganization: null,
  availableWorkspaces: [],
  availableOrganizations: [],
  customWorkspaces: [],
  customOrganizations: [],
  workspaceStatus: "idle" as WorkspaceStatus,
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentWorkspace: (currentWorkspace) => {
        set({ currentWorkspace })
      },

      setCurrentOrganization: (currentOrganization) => {
        set({ currentOrganization })
      },

      setAvailableWorkspaces: (availableWorkspaces) => {
        set({ availableWorkspaces })
      },

      setAvailableOrganizations: (availableOrganizations) => {
        set({ availableOrganizations })
      },

      addCustomWorkspace: (workspace) => {
        set((state) => ({
          customWorkspaces: [
            ...state.customWorkspaces.filter((entry) => entry.id !== workspace.id),
            workspace,
          ],
        }))
      },

      addCustomOrganization: (organization) => {
        set((state) => ({
          customOrganizations: [
            ...state.customOrganizations.filter((entry) => entry.id !== organization.id),
            organization,
          ],
        }))
      },

      setWorkspaceStatus: (workspaceStatus) => {
        set({ workspaceStatus })
      },

      clearSelection: () => {
        set({ currentOrganization: null, currentWorkspace: null })
      },
    }),
    {
      name: "workspace-context",
      storage: createJSONStorage(() => createLocalZustandStorage()),
      partialize: (state) => ({
        currentWorkspace: state.currentWorkspace,
        currentOrganization: state.currentOrganization,
        customWorkspaces: state.customWorkspaces,
        customOrganizations: state.customOrganizations,
      }),
    }
  )
)
