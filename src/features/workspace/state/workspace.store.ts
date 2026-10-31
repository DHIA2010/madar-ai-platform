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
  // The user the persisted selection belongs to -- another account signing in on this browser
  // must never inherit it (see adoptUser).
  ownerUserId: string | null
  workspaceStatus: WorkspaceStatus
  setCurrentWorkspace: (workspace: Workspace | null) => void
  setCurrentOrganization: (organization: Organization | null) => void
  setAvailableWorkspaces: (workspaces: Workspace[]) => void
  setAvailableOrganizations: (organizations: Organization[]) => void
  addCustomWorkspace: (workspace: Workspace) => void
  addCustomOrganization: (organization: Organization) => void
  removeCustomOrganization: (organizationId: string) => void
  setWorkspaceStatus: (status: WorkspaceStatus) => void
  clearSelection: () => void
  // A different user signed in: forget the previous account's selection and its locally added
  // organizations/workspaces, so that account's own context is resolved fresh.
  adoptUser: (userId: string) => void
}

const initialState = {
  currentWorkspace: null,
  currentOrganization: null,
  availableWorkspaces: [],
  availableOrganizations: [],
  customWorkspaces: [],
  customOrganizations: [],
  ownerUserId: null as string | null,
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

      removeCustomOrganization: (organizationId) => {
        set((state) => ({
          customOrganizations: state.customOrganizations.filter(
            (entry) => entry.id !== organizationId
          ),
        }))
      },

      setWorkspaceStatus: (workspaceStatus) => {
        set({ workspaceStatus })
      },

      clearSelection: () => {
        set({ currentOrganization: null, currentWorkspace: null })
      },

      adoptUser: (userId) => {
        set({
          ownerUserId: userId,
          currentOrganization: null,
          currentWorkspace: null,
          availableOrganizations: [],
          availableWorkspaces: [],
          customOrganizations: [],
          customWorkspaces: [],
        })
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
        ownerUserId: state.ownerUserId,
      }),
    }
  )
)
