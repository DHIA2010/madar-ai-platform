import { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthContext, type AuthContextValue } from "@/features/authentication"

import { useWorkspace } from "../hooks"
import { useWorkspaceStore } from "../state"
import type { Organization, Workspace } from "../types"
import { WorkspaceProvider } from "./workspace-provider"

import { ApplicationProvider } from "@/application"

const mockUser: AuthContextValue["currentUser"] = {
  id: "user_1",
  email: "demo@madar.ai",
  fullName: "Demo User",
  emailVerified: true,
  roles: [],
  permissions: ["dashboard:view"],
}

const authValue: AuthContextValue = {
  currentUser: mockUser,
  authStatus: "authenticated",
  login: vi.fn(),
  logout: vi.fn(),
}

const persistedOrganization: Organization = {
  id: "org_northstar",
  name: "Northstar Group",
  slug: "northstar-group",
  subscription: {
    id: "sub_northstar",
    status: "active",
    seats: 120,
    renewsAt: "2027-01-01T00:00:00.000Z",
    plan: {
      id: "plan_enterprise",
      code: "enterprise",
      name: "Enterprise",
      tier: "enterprise",
      workspaceLimit: 50,
      memberLimit: 500,
    },
  },
}

const persistedWorkspace: Workspace = {
  id: "ws_northstar_marketing",
  organizationId: "org_northstar",
  name: "Marketing Ops",
  slug: "marketing-ops",
  settings: {
    locale: "ar-SA",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    dateFormat: "dd/MM/yyyy",
  },
}

function renderWorkspaceProvider(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ApplicationProvider>
        <AuthContext.Provider value={authValue}>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </AuthContext.Provider>
      </ApplicationProvider>
    </QueryClientProvider>
  )
}

function WorkspaceProbe({
  onReady,
}: {
  onReady: (snapshot: {
    organizationCount: number
    workspaceCount: number
    currentOrganizationId: string | null
    currentWorkspaceId: string | null
  }) => void
}) {
  const {
    availableOrganizations,
    availableWorkspaces,
    currentOrganization,
    currentWorkspace,
    workspaceStatus,
  } = useWorkspace()

  useEffect(() => {
    if (workspaceStatus === "ready") {
      onReady({
        organizationCount: availableOrganizations.length,
        workspaceCount: availableWorkspaces.length,
        currentOrganizationId: currentOrganization?.id ?? null,
        currentWorkspaceId: currentWorkspace?.id ?? null,
      })
    }
  }, [
    availableOrganizations.length,
    availableWorkspaces.length,
    currentOrganization?.id,
    currentWorkspace?.id,
    onReady,
    workspaceStatus,
  ])

  return null
}

describe("WorkspaceProvider", () => {
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

  it("loads available organizations and workspaces", async () => {
    const onReady = vi.fn()

    renderWorkspaceProvider(<WorkspaceProbe onReady={onReady} />)

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled()
    })

    expect(onReady).toHaveBeenLastCalledWith({
      organizationCount: 2,
      workspaceCount: 3,
      currentOrganizationId: "org_northstar",
      currentWorkspaceId: "ws_northstar_marketing",
    })
  })

  it("restores the previously selected workspace context", async () => {
    useWorkspaceStore.setState({
      currentOrganization: persistedOrganization,
      currentWorkspace: persistedWorkspace,
      availableOrganizations: [],
      availableWorkspaces: [],
      workspaceStatus: "idle",
    })

    const onReady = vi.fn()

    renderWorkspaceProvider(<WorkspaceProbe onReady={onReady} />)

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled()
    })

    expect(onReady).toHaveBeenLastCalledWith({
      organizationCount: 2,
      workspaceCount: 3,
      currentOrganizationId: "org_northstar",
      currentWorkspaceId: "ws_northstar_marketing",
    })
  })
})
