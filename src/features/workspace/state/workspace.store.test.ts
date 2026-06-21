import { beforeEach, describe, expect, it } from "vitest"

import type { Organization, Workspace } from "../types"
import { useWorkspaceStore } from "./workspace.store"

const mockOrganization: Organization = {
  id: "org_test",
  name: "Test Organization",
  slug: "test-organization",
  subscription: {
    id: "sub_test",
    status: "active",
    seats: 10,
    renewsAt: null,
    plan: {
      id: "plan_test",
      code: "growth",
      name: "Growth",
      tier: "growth",
      workspaceLimit: 5,
      memberLimit: 25,
    },
  },
}

const mockWorkspace: Workspace = {
  id: "ws_test",
  organizationId: "org_test",
  name: "Test Workspace",
  slug: "test-workspace",
  settings: {
    locale: "ar-SA",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    dateFormat: "dd/MM/yyyy",
  },
}

describe("useWorkspaceStore", () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspaceStore.setState({
      currentWorkspace: null,
      currentOrganization: null,
      availableWorkspaces: [],
      availableOrganizations: [],
      workspaceStatus: "idle",
    })
  })

  it("stores current workspace and organization state", () => {
    useWorkspaceStore.getState().setCurrentOrganization(mockOrganization)
    useWorkspaceStore.getState().setCurrentWorkspace(mockWorkspace)
    useWorkspaceStore.getState().setWorkspaceStatus("ready")

    const state = useWorkspaceStore.getState()

    expect(state.currentOrganization).toEqual(mockOrganization)
    expect(state.currentWorkspace).toEqual(mockWorkspace)
    expect(state.workspaceStatus).toBe("ready")
  })

  it("clears only persisted selection fields", () => {
    useWorkspaceStore.setState({
      currentOrganization: mockOrganization,
      currentWorkspace: mockWorkspace,
      availableOrganizations: [mockOrganization],
      availableWorkspaces: [mockWorkspace],
      workspaceStatus: "ready",
    })

    useWorkspaceStore.getState().clearSelection()

    const state = useWorkspaceStore.getState()
    expect(state.currentOrganization).toBeNull()
    expect(state.currentWorkspace).toBeNull()
    expect(state.availableOrganizations).toEqual([mockOrganization])
    expect(state.availableWorkspaces).toEqual([mockWorkspace])
  })
})
