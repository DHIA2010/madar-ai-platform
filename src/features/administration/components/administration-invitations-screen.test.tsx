import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationInvitationsScreen } from "./administration-invitations-screen"

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

const mockSendInvitationMutateAsync = vi.fn().mockResolvedValue({})
const mockCancelInvitationMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockResendInvitationMutateAsync = vi.fn().mockResolvedValue({})

const mockInvitations = [
  {
    id: "inv-1",
    email: "sara@madar.ai",
    roleId: "viewer",
    workspace: "Demo Workspace",
    department: "",
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    invitedAt: new Date().toISOString(),
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
    availableWorkspaces: [
      { id: "ws-1", organizationId: "org-1", name: "Demo Workspace", slug: "demo-workspace" },
      { id: "ws-2", organizationId: "org-1", name: "Retail Expansion", slug: "retail-expansion" },
    ],
  }),
}))

vi.mock("../queries/use-invitations-query", () => ({
  useInvitationsQuery: () => ({
    data: mockInvitations,
    isLoading: false,
    isError: false,
  }),
}))

vi.mock("../queries/use-invitation-mutations", () => ({
  useInvitationMutations: () => ({
    sendInvitation: { mutateAsync: mockSendInvitationMutateAsync, isPending: false },
    cancelInvitation: { mutateAsync: mockCancelInvitationMutateAsync, isPending: false },
    resendInvitation: { mutateAsync: mockResendInvitationMutateAsync, isPending: false },
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

describe("AdministrationInvitationsScreen", () => {
  beforeEach(() => {
    toastSuccess.mockReset()
    toastError.mockReset()
    mockSendInvitationMutateAsync.mockClear()
    mockCancelInvitationMutateAsync.mockClear()
    mockResendInvitationMutateAsync.mockClear()
  })

  it("opens invite dialog when clicking Invite Users", () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Invite Users" }))

    expect(screen.getByRole("dialog", { name: "Invite Users" })).toBeTruthy()
    expect(
      screen.getByText("Send one or many invitations with workspace and role context.")
    ).toBeTruthy()
  })

  it("supports role selection and a single workspace checkbox when sending an invitation", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Invite Users" }))

    const roleTrigger = screen.getByRole("combobox")
    fireEvent.click(roleTrigger)
    fireEvent.click(await screen.findByRole("option", { name: "Viewer" }))

    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.change(screen.getByLabelText("Email addresses"), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }))

    await waitFor(() => {
      expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        email: "new.user@madar.ai",
        roleId: "viewer",
        workspaceId: "ws-2",
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Users" })).toBeNull()
    })

    expect(toastSuccess).toHaveBeenCalledWith("Invitation sent to 1 recipient(s)")
  })

  it("sends one invitation per selected workspace when multiple are checked", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Invite Users" }))

    fireEvent.click(screen.getByLabelText("Demo Workspace"))
    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.change(screen.getByLabelText("Email addresses"), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }))

    await waitFor(() => {
      expect(mockSendInvitationMutateAsync).toHaveBeenCalledTimes(2)
    })

    expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      email: "new.user@madar.ai",
      roleId: "viewer",
      workspaceId: "ws-1",
    })
    expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      email: "new.user@madar.ai",
      roleId: "viewer",
      workspaceId: "ws-2",
    })

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        "Invitation sent to 1 recipient(s) across 2 workspaces"
      )
    })
  })

  it("cancels an invitation from row action", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() => {
      expect(mockCancelInvitationMutateAsync).toHaveBeenCalledWith("inv-1")
    })
    expect(toastSuccess).toHaveBeenCalledWith("Invitation canceled")
  })
})
