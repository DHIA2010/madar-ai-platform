import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationRolesScreen } from "./administration-roles-screen"

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

const mockCreateRoleMutateAsync = vi.fn().mockResolvedValue({})
const mockUpdateRoleMutateAsync = vi.fn().mockResolvedValue({})
const mockDeleteRoleMutateAsync = vi.fn().mockResolvedValue({})

// Order matters: several assertions below pick a role by its index in this array (there's no
// longer a distinct "Edit" button text to target the editable one by name -- every role now
// shows the same "عرض التفاصيل" button, real vs. read-only mode is decided inside the dialog).
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
    deleteRole: { mutateAsync: mockDeleteRoleMutateAsync, isPending: false },
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

  it("shows 'عرض التفاصيل' and 'استنساخ' for every role, but delete only for editable (custom) roles", () => {
    render(<AdministrationRolesScreen />)

    expect(screen.getAllByRole("button", { name: "عرض التفاصيل" })).toHaveLength(mockRoles.length)
    expect(screen.getAllByRole("button", { name: "استنساخ" })).toHaveLength(mockRoles.length)
    expect(screen.queryByRole("button", { name: "حذف Owner" })).toBeNull()
    expect(screen.queryByRole("button", { name: "حذف Viewer" })).toBeNull()
    expect(screen.getByRole("button", { name: "حذف RevOps" })).toBeTruthy()
  })

  it("opens a default (non-editable) role read-only, with no editable fields or save path", () => {
    render(<AdministrationRolesScreen />)

    // mockRoles[0] is "Owner", a default/non-editable role.
    fireEvent.click(screen.getAllByRole("button", { name: "عرض التفاصيل" })[0])

    const dialog = screen.getByRole("dialog", { name: "تفاصيل الدور" })
    expect(within(dialog).getByText("Owner")).toBeTruthy()
    expect(screen.queryByLabelText("اسم الدور")).toBeNull()
    expect(within(dialog).queryByRole("button", { name: "حفظ التعديلات" })).toBeNull()
    expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeTruthy()
  })

  it("edits the custom role and calls updateRole with the current permission set", async () => {
    render(<AdministrationRolesScreen />)

    // mockRoles[2] is "RevOps", the one editable (custom) role.
    fireEvent.click(screen.getAllByRole("button", { name: "عرض التفاصيل" })[2])
    expect(screen.getByRole("dialog", { name: "تعديل الدور" })).toBeTruthy()
    expect((screen.getByLabelText("اسم الدور") as HTMLInputElement).value).toBe("RevOps")

    fireEvent.change(screen.getByLabelText("اسم الدور"), { target: { value: "RevOps Updated" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))

    await vi.waitFor(() => {
      expect(mockUpdateRoleMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ roleId: "custom-revops", name: "RevOps Updated" })
      )
    })
    expect(toastSuccess).toHaveBeenCalledWith('تم تحديث دور "RevOps Updated".')
  })

  it("clones a system role into a new custom role", async () => {
    render(<AdministrationRolesScreen />)

    const cloneButtons = screen.getAllByRole("button", { name: "استنساخ" })
    fireEvent.click(cloneButtons[0])

    expect(screen.getByRole("dialog", { name: "إنشاء دور من نسخة" })).toBeTruthy()
    expect((screen.getByLabelText("اسم الدور") as HTMLInputElement).value).toBe("Owner (نسخة)")

    fireEvent.click(screen.getByRole("button", { name: "إنشاء الدور" }))

    await vi.waitFor(() => {
      expect(mockCreateRoleMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", name: "Owner (نسخة)" })
      )
    })
    expect(toastSuccess).toHaveBeenCalledWith('تم إنشاء دور "Owner (نسخة)".')
  })

  it("deletes a custom role after confirming, but never offers delete for default roles", async () => {
    render(<AdministrationRolesScreen />)

    expect(screen.queryByRole("button", { name: "حذف Owner" })).toBeNull()
    expect(screen.queryByRole("button", { name: "حذف Viewer" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "حذف RevOps" }))
    expect(screen.getByRole("dialog", { name: "حذف الدور" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "حذف الدور" }))

    await vi.waitFor(() => {
      expect(mockDeleteRoleMutateAsync).toHaveBeenCalledWith({ roleId: "custom-revops" })
    })
    expect(toastSuccess).toHaveBeenCalledWith('تم حذف دور "RevOps".')
  })

  it("closes dialog on Escape", () => {
    render(<AdministrationRolesScreen />)

    fireEvent.click(screen.getByRole("button", { name: "إنشاء دور جديد" }))
    expect(screen.getByRole("dialog", { name: "إنشاء دور مخصص" })).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "إنشاء دور مخصص" })).toBeNull()
  })
})
