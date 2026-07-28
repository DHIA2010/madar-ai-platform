import { useEffect, useMemo } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthContext,
  type AuthContextValue,
  PermissionContextStore,
  type PermissionContextValue,
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

function TestPermissionProvider({ children }: { children: React.ReactNode }) {
  const { currentWorkspace, currentOrganization } = useWorkspace()

  const availablePermissions = useMemo(() => {
    if (!mockUser) {
      return []
    }

    const rolePermissions = mockUser.roles.flatMap((role) => role.permissions)
    return Array.from(new Set([...mockUser.permissions, ...rolePermissions]))
  }, [])

  const value = useMemo<PermissionContextValue>(
    () => ({
      currentContext: {
        organizationId: currentOrganization?.id,
        workspaceId: currentWorkspace?.id,
        userId: mockUser?.id,
      },
      can: (permission) => availablePermissions.includes(permission),
      canAny: (permissions) =>
        permissions.some((permission) => availablePermissions.includes(permission)),
      canAll: (permissions) =>
        permissions.every((permission) => availablePermissions.includes(permission)),
    }),
    [availablePermissions, currentOrganization?.id, currentWorkspace?.id]
  )

  return <PermissionContextStore.Provider value={value}>{children}</PermissionContextStore.Provider>
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
            <TestPermissionProvider>{children}</TestPermissionProvider>
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
