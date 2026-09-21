import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/constants/routes"

import type { Organization, Workspace } from "../types"
import { WorkspaceSelectorContent } from "./workspace-selector-content"

const mockUseWorkspace = vi.fn()
const mockUseWorkspaceSwitcher = vi.fn()
const switchWorkspace = vi.fn()
const createOrganization = vi.fn()
const updateOrganization = vi.fn()
const archiveWorkspace = vi.fn()
const restoreWorkspace = vi.fn()
const routerPush = vi.fn()
const getUsers = vi.fn().mockResolvedValue([])

vi.mock("../hooks", () => ({
  useWorkspace: () => mockUseWorkspace(),
  useWorkspaceSwitcher: () => mockUseWorkspaceSwitcher(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

vi.mock("@/application/context", () => ({
  useApplicationServices: () => ({ administrationApplicationService: { getUsers } }),
}))

const organizations: Organization[] = [
  {
    id: "org-northstar",
    name: "Northstar Group",
    slug: "northstar-group",
    logoUrl: null,
    currency: "SAR",
    settings: {},
    subscription: {
      id: "sub-1",
      status: "active",
      seats: 12,
      renewsAt: null,
      plan: {
        id: "plan-growth",
        code: "growth",
        name: "Growth",
        tier: "growth",
        workspaceLimit: 10,
        memberLimit: 50,
      },
    },
  },
  {
    id: "org-orbit",
    name: "Orbit Holdings",
    slug: "orbit-holdings",
    logoUrl: null,
    currency: "SAR",
    settings: {},
    subscription: {
      id: "sub-2",
      status: "active",
      seats: 20,
      renewsAt: null,
      plan: {
        id: "plan-enterprise",
        code: "enterprise",
        name: "Enterprise",
        tier: "enterprise",
        workspaceLimit: 30,
        memberLimit: 200,
      },
    },
  },
]

const workspaces: Workspace[] = [
  {
    id: "ws-marketing-ops",
    organizationId: "org-northstar",
    name: "Marketing Ops",
    slug: "marketing-ops",
    settings: {
      locale: "en-US",
      timezone: "America/New_York",
      currency: "USD",
      dateFormat: "MM/dd/yyyy",
    },
  },
  {
    id: "ws-sales-hub",
    organizationId: "org-northstar",
    name: "Sales Hub",
    slug: "sales-hub",
    settings: {
      locale: "en-US",
      timezone: "America/Chicago",
      currency: "USD",
      dateFormat: "MM/dd/yyyy",
    },
  },
  {
    id: "ws-london-lab",
    organizationId: "org-orbit",
    name: "London Growth Lab",
    slug: "london-growth-lab",
    settings: {
      locale: "en-GB",
      timezone: "Europe/London",
      currency: "GBP",
      dateFormat: "dd/MM/yyyy",
    },
  },
]

function setupWorkspaceMocks(
  overrides: Partial<{
    currentOrganization: Organization | null
    currentWorkspace: Workspace | null
  }> = {}
) {
  mockUseWorkspace.mockReturnValue({
    currentOrganization: organizations[0],
    currentWorkspace: workspaces[0],
    ...overrides,
  })

  mockUseWorkspaceSwitcher.mockReturnValue({
    availableOrganizations: organizations,
    availableWorkspaces: workspaces,
    switchWorkspace,
    createOrganization,
    updateOrganization,
    archiveWorkspace,
    restoreWorkspace,
    workspaceStatus: "ready",
  })
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe("WorkspaceSelectorContent", () => {
  beforeEach(() => {
    switchWorkspace.mockReset()
    createOrganization.mockReset()
    updateOrganization.mockReset()
    archiveWorkspace.mockReset()
    restoreWorkspace.mockReset()
    routerPush.mockReset()
    getUsers.mockReset().mockResolvedValue([])
    mockUseWorkspace.mockReset()
    mockUseWorkspaceSwitcher.mockReset()
    setupWorkspaceMocks()
  })

  it("shows every workspace across every organization by default", () => {
    renderWithQueryClient(<WorkspaceSelectorContent />)

    expect(screen.getByText("Marketing Ops")).toBeTruthy()
    expect(screen.getByText("Sales Hub")).toBeTruthy()
    expect(screen.getByText("London Growth Lab")).toBeTruthy()
  })

  it("narrows to one organization's workspaces when it is selected", () => {
    renderWithQueryClient(<WorkspaceSelectorContent />)

    fireEvent.click(screen.getByText("Orbit Holdings"))

    expect(screen.getByText("London Growth Lab")).toBeTruthy()
    expect(screen.queryByText("Marketing Ops")).toBeNull()
    expect(screen.queryByText("Sales Hub")).toBeNull()
  })

  it("filters workspaces from the workspace search field", () => {
    renderWithQueryClient(<WorkspaceSelectorContent />)

    fireEvent.change(screen.getByRole("searchbox", { name: "البحث في مساحات العمل" }), {
      target: { value: "sales" },
    })

    expect(screen.getByText("Sales Hub")).toBeTruthy()
    expect(screen.queryByText("Marketing Ops")).toBeNull()
    expect(screen.queryByText("London Growth Lab")).toBeNull()
  })

  it("switches workspace when a card is clicked", () => {
    renderWithQueryClient(<WorkspaceSelectorContent />)

    fireEvent.click(screen.getByText("Sales Hub"))

    expect(switchWorkspace).toHaveBeenCalledWith({
      organizationId: "org-northstar",
      workspaceId: "ws-sales-hub",
    })
  })

  it("navigates to the real create-workspace page instead of showing an inline form", () => {
    const onComplete = vi.fn()
    renderWithQueryClient(<WorkspaceSelectorContent onComplete={onComplete} />)

    fireEvent.click(screen.getByRole("button", { name: "إنشاء مساحة عمل جديدة" }))

    expect(routerPush).toHaveBeenCalledWith(`${ROUTES.settingsWorkspaces}?new=1`)
    expect(onComplete).toHaveBeenCalled()
  })

  it("shows real member avatars only once a single organization is selected", async () => {
    getUsers.mockResolvedValue([
      {
        id: "user-1",
        fullName: "سارة أحمد",
        email: "sara@example.com",
        avatarUrl: null,
        department: "",
        departments: [],
        roleId: "viewer",
        customRoleId: null,
        moduleAccessRevoked: false,
        workspaces: ["Sales Hub"],
        workspaceIds: ["ws-sales-hub"],
        status: "active",
        lastLogin: "",
        teams: [],
      },
    ])

    renderWithQueryClient(<WorkspaceSelectorContent />)

    // "all organizations" view: no fetch yet, no member count shown.
    expect(getUsers).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText("Northstar Group"))

    await waitFor(() => expect(getUsers).toHaveBeenCalledWith({ organizationId: "org-northstar" }))
    expect(await screen.findByText("عضو واحد")).toBeTruthy()
  })
})
