import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationInvitationsScreen } from "./administration-invitations-screen"

const { toastSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}))

const mockCancelInvitationMutateAsync = vi.fn().mockResolvedValue(undefined)
const mockResendInvitationMutateAsync = vi.fn().mockResolvedValue({})

const mockInvitations = [
  {
    id: "inv-1",
    email: "sara@madar.ai",
    fullName: "Sara Ahmed",
    roleId: "viewer",
    workspace: "Demo Workspace",
    status: "pending" as const,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    invitedAt: new Date().toISOString(),
  },
]

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: vi.fn(),
  },
}))

vi.mock("@/application", () => ({
  useApplicationServices: () => ({ administrationApplicationService: {} }),
}))

vi.mock("@/features/workspace", () => ({
  useWorkspace: () => ({
    currentOrganization: { id: "org-1", name: "Org", slug: "org" },
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
    cancelInvitation: { mutateAsync: mockCancelInvitationMutateAsync, isPending: false },
    resendInvitation: { mutateAsync: mockResendInvitationMutateAsync, isPending: false },
  }),
}))

vi.mock("./administration-module-nav", () => ({
  AdministrationModuleNav: () => <nav data-testid="administration-nav" />,
}))

vi.mock("./administration-add-user-dialog", () => ({
  AdministrationAddUserDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="add-user-dialog" /> : null,
}))

describe("AdministrationInvitationsScreen", () => {
  beforeEach(() => {
    toastSuccess.mockReset()
    mockCancelInvitationMutateAsync.mockClear()
    mockResendInvitationMutateAsync.mockClear()
  })

  it("opens the add-user dialog when clicking إضافة مستخدم", () => {
    render(<AdministrationInvitationsScreen />)

    expect(screen.queryByTestId("add-user-dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "إضافة مستخدم" }))
    expect(screen.getByTestId("add-user-dialog")).toBeTruthy()
  })

  it("renders the invitations table", () => {
    render(<AdministrationInvitationsScreen />)

    expect(screen.getByText("Sara Ahmed")).toBeTruthy()
    expect(screen.getByText("sara@madar.ai")).toBeTruthy()
    expect(screen.getByText("Demo Workspace")).toBeTruthy()
  })

  it("resends an invitation from row action", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "إعادة إرسال" }))

    await waitFor(() => {
      expect(mockResendInvitationMutateAsync).toHaveBeenCalledWith("inv-1")
    })
    expect(toastSuccess).toHaveBeenCalledWith("تمت إعادة إرسال الدعوة إلى sara@madar.ai.")
  })

  it("cancels an invitation from row action", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }))

    await waitFor(() => {
      expect(mockCancelInvitationMutateAsync).toHaveBeenCalledWith("inv-1")
    })
    expect(toastSuccess).toHaveBeenCalledWith("تم إلغاء الدعوة.")
  })
})
