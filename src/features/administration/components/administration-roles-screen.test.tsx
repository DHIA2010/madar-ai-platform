import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationRolesScreen } from "./administration-roles-screen"

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

const mockCreateRoleMutateAsync = vi.fn().mockResolvedValue({})
const mockUpdateRoleMutateAsync = vi.fn().mockResolvedValue({})

const mockRoles = [
  {
    id: "owner",
    name: "Owner",
    description: "Full control across security, billing, and workspace governance.",
    userCount: 1,
    isDefault: true,
    editable: false,
    permissions: { dashboard: ["view", "export"], campaigns: ["view", "create"] },
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access across approved modules.",
    userCount: 13,
    isDefault: true,
    editable: false,
    permissions: { dashboard: ["view"], campaigns: ["view"] },
  },
  {
    id: "custom-revops",
    name: "RevOps",
    description: "Custom role for revenue operations",
    userCount: 0,
    isDefault: false,
    editable: true,
    permissions: { campaigns: ["view"], reports: ["view", "export"] },
  },
]

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

vi.mock("@/application", () => ({
  useApplicationServices: () => ({ administrationApplicationService: {} }),
}))

vi.mock("@/features/workspace", () => ({
  useWorkspace: () => ({
    currentOrganization: { id: "org-1", name: "Org", slug: "org" },
    availableWorkspaces: [],
  }),
}))

vi.mock("../queries/use-roles-query", () => ({
  useRolesQuery: () => ({
    data: mockRoles,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock("../queries/use-role-mutations", () => ({
  useRoleMutations: () => ({
    createRole: { mutateAsync: mockCreateRoleMutateAsync, isPending: false },
    updateRole: { mutateAsync: mockUpdateRoleMutateAsync, isPending: false },
  }),
}))

vi.mock("@/components/ui/select", async () => {
  const React = await import("react")

  const SelectContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
  } | null>(null)

  function Select({
    value,
    onValueChange,
    children,
  }: React.PropsWithChildren<{ value?: string; onValueChange?: (value: string) => void }>) {
    return (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    )
  }

  function SelectTrigger({ children, ...props }: React.ComponentProps<"button">) {
    return (
      <button
        type="button"
        role="combobox"
        aria-expanded="false"
        aria-controls="select-options"
        data-slot="select-trigger"
        {...props}
      >
        {children}
      </button>
    )
  }

  function SelectContent({ children, ...props }: React.ComponentProps<"div">) {
    return (
      <div data-slot="select-content" {...props}>
        {children}
      </div>
    )
  }

  function SelectItem({
    value,
    children,
    ...props
  }: React.ComponentProps<"button"> & { value: string }) {
    const context = React.useContext(SelectContext)
    return (
      <button
        type="button"
        role="option"
        aria-selected={context?.value === value}
        onClick={() => context?.onValueChange?.(value)}
        {...props}
      >
        {children}
      </button>
    )
  }

  function SelectGroup({ children }: React.PropsWithChildren) {
    return <div>{children}</div>
  }

  function SelectLabel({ children }: React.PropsWithChildren) {
    return <div>{children}</div>
  }

  function SelectSeparator() {
    return <hr />
  }

  function SelectValue({ children }: React.PropsWithChildren) {
    return <span>{children}</span>
  }

  return {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  }
})

vi.mock("./administration-module-nav", () => ({
  AdministrationModuleNav: () => <nav data-testid="administration-nav" />,
}))

describe("AdministrationRolesScreen", () => {
  beforeEach(() => {
    toastSuccess.mockReset()
    toastError.mockReset()
    mockCreateRoleMutateAsync.mockClear()
    mockUpdateRoleMutateAsync.mockClear()
  })

  it("only shows Edit for editable (custom) roles, and Clone for all roles", () => {
    render(<AdministrationRolesScreen />)

    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Clone" })).toHaveLength(mockRoles.length)
  })

  it("edits the custom role and calls updateRole with the current permission set", async () => {
    render(<AdministrationRolesScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("dialog", { name: "Edit Role" })).toBeTruthy()
    expect((screen.getByLabelText("Role name") as HTMLInputElement).value).toBe("RevOps")

    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "RevOps Updated" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await vi.waitFor(() => {
      expect(mockUpdateRoleMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: "custom-revops", name: "RevOps Updated" })
      )
    })
    expect(toastSuccess).toHaveBeenCalledWith('Role "RevOps Updated" updated')
  })

  it("clones a system role into a new custom role", async () => {
    render(<AdministrationRolesScreen />)

    const cloneButtons = screen.getAllByRole("button", { name: "Clone" })
    fireEvent.click(cloneButtons[0])

    expect(screen.getByRole("dialog", { name: "Create Role from Clone" })).toBeTruthy()
    expect((screen.getByLabelText("Role name") as HTMLInputElement).value).toBe("Owner Copy")

    fireEvent.click(screen.getByRole("button", { name: "Create role" }))

    await vi.waitFor(() => {
      expect(mockCreateRoleMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", name: "Owner Copy" })
      )
    })
    expect(toastSuccess).toHaveBeenCalledWith('Role "Owner Copy" created')
  })

  it("closes dialog on Escape", () => {
    render(<AdministrationRolesScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Create Custom Role" }))
    expect(screen.getByRole("dialog", { name: "Create Custom Role" })).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Create Custom Role" })).toBeNull()
  })
})
