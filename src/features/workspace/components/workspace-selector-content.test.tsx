import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Organization, Workspace } from "../types"
import { WorkspaceSelectorContent } from "./workspace-selector-content"

const mockUseWorkspace = vi.fn()
const mockUseWorkspaceSwitcher = vi.fn()
const switchWorkspace = vi.fn()
const createOrganization = vi.fn()
const createWorkspace = vi.fn()

vi.mock("../hooks", () => ({
  useWorkspace: () => mockUseWorkspace(),
  useWorkspaceSwitcher: () => mockUseWorkspaceSwitcher(),
}))

const organizations: Organization[] = [
  {
    id: "org-northstar",
    name: "Northstar Group",
    slug: "northstar-group",
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
    createWorkspace,
    workspaceStatus: "ready",
  })
}

describe("WorkspaceSelectorContent", () => {
  beforeEach(() => {
    switchWorkspace.mockReset()
    createOrganization.mockReset()
    createWorkspace.mockReset()
    mockUseWorkspace.mockReset()
    mockUseWorkspaceSwitcher.mockReset()
    setupWorkspaceMocks()
  })

  it("shows workspaces for the newly selected organization", () => {
    render(<WorkspaceSelectorContent />)

    expect(screen.getByText("Marketing Ops")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Select organization Orbit Holdings" }))

    expect(screen.getByText("London Growth Lab")).toBeTruthy()
    expect(screen.queryByText("Marketing Ops")).toBeNull()
  })

  it("filters organizations and workspaces from the shared search field", () => {
    setupWorkspaceMocks({
      currentOrganization: null,
      currentWorkspace: null,
    })

    render(<WorkspaceSelectorContent />)

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search organizations and workspaces" }),
      {
        target: { value: "london" },
      }
    )

    expect(screen.getByRole("button", { name: "Select organization Orbit Holdings" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Select organization Northstar Group" })).toBeNull()
    expect(
      screen.getByText("Choose an organization to view its available workspaces.")
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Select organization Orbit Holdings" }))

    expect(screen.getByText("London Growth Lab")).toBeTruthy()
    expect(screen.queryByText("Sales Hub")).toBeNull()
  })

  it("keeps keyboard selection active with arrow keys and Enter", async () => {
    render(<WorkspaceSelectorContent />)

    fireEvent.keyDown(
      screen.getByRole("searchbox", { name: "Search organizations and workspaces" }),
      {
        key: "ArrowDown",
      }
    )

    fireEvent.keyDown(
      screen.getByRole("searchbox", { name: "Search organizations and workspaces" }),
      {
        key: "Enter",
      }
    )

    expect(switchWorkspace).toHaveBeenCalledWith({
      organizationId: "org-northstar",
      workspaceId: "ws-sales-hub",
    })
  })
})
