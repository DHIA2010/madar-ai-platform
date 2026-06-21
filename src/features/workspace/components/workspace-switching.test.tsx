import { useEffect } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthContext,
  type AuthContextValue,
  PermissionProvider,
  usePermissions,
} from "@/features/authentication"

import { useWorkspace } from "../hooks"
import { WorkspaceProvider } from "../providers"
import { useWorkspaceStore } from "../state"

import { ApplicationProvider } from "@/application"

const mockUser: AuthContextValue["currentUser"] = {
  id: "user_1",
  email: "demo@madar.ai",
  fullName: "Demo User",
  emailVerified: true,
  roles: [],
  permissions: ["dashboard:view", "campaigns:manage"],
}

const authValue: AuthContextValue = {
  currentUser: mockUser,
  authStatus: "authenticated",
  login: vi.fn(),
  logout: vi.fn(),
}

function renderWorkspaceHarness(children: React.ReactNode) {
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
          <WorkspaceProvider>
            <PermissionProvider>{children}</PermissionProvider>
          </WorkspaceProvider>
        </AuthContext.Provider>
      </ApplicationProvider>
    </QueryClientProvider>
  )
}

function WorkspaceSwitchProbe({
  onSnapshot,
}: {
  onSnapshot: (snapshot: {
    workspaceId: string | null
    permissionWorkspaceId: string | undefined
  }) => void
}) {
  const { currentWorkspace, workspaceStatus, switchWorkspace } = useWorkspace()
  const { currentContext } = usePermissions()

  useEffect(() => {
    if (workspaceStatus === "ready" && currentWorkspace?.id !== "ws_atlas_growth") {
      void switchWorkspace({
        organizationId: "org_atlas",
        workspaceId: "ws_atlas_growth",
      })
    }
  }, [currentWorkspace, switchWorkspace, workspaceStatus])

  useEffect(() => {
    if (workspaceStatus === "ready" && currentWorkspace) {
      onSnapshot({
        workspaceId: currentWorkspace.id,
        permissionWorkspaceId: currentContext.workspaceId,
      })
    }
  }, [currentContext.workspaceId, currentWorkspace, onSnapshot, workspaceStatus])

  return null
}

describe("workspace switching", () => {
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

  it("updates permission context after switching workspace", async () => {
    const onSnapshot = vi.fn()

    renderWorkspaceHarness(<WorkspaceSwitchProbe onSnapshot={onSnapshot} />)

    await waitFor(() => {
      expect(onSnapshot).toHaveBeenCalledWith({
        workspaceId: "ws_atlas_growth",
        permissionWorkspaceId: "ws_atlas_growth",
      })
    })
  })
})
