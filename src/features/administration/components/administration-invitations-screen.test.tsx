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

  it("opens invite dialog when clicking دعوة مستخدمين", () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة مستخدمين" }))

    expect(screen.getByRole("dialog", { name: "دعوة مستخدمين" })).toBeTruthy()
    expect(
      screen.getByText("الأعضاء الجدد يبدأون بلا صلاحيات -- أضفهم إلى فريق لاحقاً لمنحهم الوصول.")
    ).toBeTruthy()
  })

  it("defaults invited members to no role and supports a single workspace checkbox", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة مستخدمين" }))

    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.change(screen.getByLabelText("عناوين البريد الإلكتروني"), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "إرسال الدعوة" }))

    await waitFor(() => {
      expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        email: "new.user@madar.ai",
        roleId: "viewer",
        workspaceId: "ws-2",
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "دعوة مستخدمين" })).toBeNull()
    })

    expect(toastSuccess).toHaveBeenCalledWith("تم إرسال الدعوة إلى 1 مستلم.")
  })

  it("sends one invitation per selected workspace when multiple are checked", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة مستخدمين" }))

    fireEvent.click(screen.getByLabelText("Demo Workspace"))
    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.change(screen.getByLabelText("عناوين البريد الإلكتروني"), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "إرسال الدعوة" }))

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
      expect(toastSuccess).toHaveBeenCalledWith("تم إرسال الدعوة إلى 1 مستلم.")
    })
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
