import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationAddUserDialog } from "./administration-add-user-dialog"

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

const mockSendInvitationMutateAsync = vi.fn().mockResolvedValue({})
const mockCreateMemberDirectMutateAsync = vi.fn().mockResolvedValue({ userId: "new-user-1" })
const mockSendPasswordResetMutateAsync = vi.fn().mockResolvedValue({ accepted: true })

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

vi.mock("@/features/workspace", () => ({
  useWorkspace: () => ({
    availableWorkspaces: [
      { id: "ws-1", organizationId: "org-1", name: "Demo Workspace", slug: "demo-workspace" },
      { id: "ws-2", organizationId: "org-1", name: "Retail Expansion", slug: "retail-expansion" },
    ],
  }),
}))

vi.mock("../queries/use-invitation-mutations", () => ({
  useInvitationMutations: () => ({
    sendInvitation: { mutateAsync: mockSendInvitationMutateAsync, isPending: false },
    createMemberDirect: { mutateAsync: mockCreateMemberDirectMutateAsync, isPending: false },
  }),
}))

vi.mock("../queries/use-user-mutations", () => ({
  useUserMutations: () => ({
    sendPasswordReset: { mutateAsync: mockSendPasswordResetMutateAsync, isPending: false },
  }),
}))

describe("AdministrationAddUserDialog", () => {
  beforeEach(() => {
    toastSuccess.mockReset()
    toastError.mockReset()
    mockSendInvitationMutateAsync.mockClear()
    mockCreateMemberDirectMutateAsync.mockClear()
    mockCreateMemberDirectMutateAsync.mockResolvedValue({ userId: "new-user-1" })
    mockSendPasswordResetMutateAsync.mockClear()
  })

  it("opens on the direct-add mode by default", () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    expect(screen.getByRole("dialog", { name: "إضافة مستخدم" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "إضافة مباشرة" }).getAttribute("aria-pressed")).toBe(
      "true"
    )
    expect(screen.getByRole("button", { name: "إنشاء وإضافة" })).toBeTruthy()
  })

  it("disables the primary button until the email is valid (no name required to invite)", () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة عبر البريد" }))

    const submit = screen.getByRole("button", {
      name: "إرسال الدعوة",
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(screen.queryByLabelText(/^الاسم الكامل/)).toBeNull()

    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "sara@madar.ai" },
    })

    expect(submit.disabled).toBe(false)
  })

  it("sends a single-recipient invitation with just an email and the chosen workspace", async () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة عبر البريد" }))

    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "إرسال الدعوة" }))

    await waitFor(() => {
      expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        email: "new.user@madar.ai",
        roleId: "viewer",
        workspaceId: undefined,
      })
    })
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("تم إرسال الدعوة إلى new.user@madar.ai.")
    })
  })

  it("sends one invitation per selected workspace when multiple are checked", async () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "دعوة عبر البريد" }))

    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "multi.user@madar.ai" },
    })
    fireEvent.click(screen.getByRole("button", { name: "وصول على مستوى المنظمة" }))
    fireEvent.click(screen.getByLabelText("Demo Workspace"))
    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.click(screen.getByRole("button", { name: "إرسال الدعوة" }))

    await waitFor(() => {
      expect(mockSendInvitationMutateAsync).toHaveBeenCalledTimes(2)
    })
    expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      email: "multi.user@madar.ai",
      roleId: "viewer",
      workspaceId: "ws-1",
    })
    expect(mockSendInvitationMutateAsync).toHaveBeenCalledWith({
      organizationId: "org-1",
      email: "multi.user@madar.ai",
      roleId: "viewer",
      workspaceId: "ws-2",
    })
  })

  it("switches to direct-add mode, only then requiring a password, and notifies by email", async () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "إضافة مباشرة" }))

    expect(
      (screen.getByRole("button", { name: "إنشاء وإضافة" }) as HTMLButtonElement).disabled
    ).toBe(true)

    fireEvent.change(screen.getByLabelText(/^الاسم الكامل/), {
      target: { value: "Direct User" },
    })
    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "direct.user@madar.ai" },
    })
    fireEvent.change(screen.getByLabelText(/^كلمة المرور/), {
      target: { value: "TemporaryPass123" },
    })

    fireEvent.click(screen.getByRole("button", { name: "وصول على مستوى المنظمة" }))
    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.click(screen.getByRole("button", { name: "إنشاء وإضافة" }))

    await waitFor(() => {
      expect(mockCreateMemberDirectMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        email: "direct.user@madar.ai",
        fullName: "Direct User",
        workspaceIds: ["ws-2"],
        password: "TemporaryPass123",
      })
    })

    await waitFor(() => {
      expect(mockSendPasswordResetMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        memberUserId: "new-user-1",
      })
    })

    expect(toastSuccess).toHaveBeenCalledWith("تم إضافة Direct User مباشرةً.")
  })

  it("creates one member with a membership in each selected workspace when multiple are checked", async () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "إضافة مباشرة" }))

    fireEvent.change(screen.getByLabelText(/^الاسم الكامل/), {
      target: { value: "Multi Direct User" },
    })
    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "multi.direct@madar.ai" },
    })
    fireEvent.change(screen.getByLabelText(/^كلمة المرور/), {
      target: { value: "TemporaryPass123" },
    })

    fireEvent.click(screen.getByRole("button", { name: "وصول على مستوى المنظمة" }))
    fireEvent.click(screen.getByLabelText("Demo Workspace"))
    fireEvent.click(screen.getByLabelText("Retail Expansion"))

    fireEvent.click(screen.getByRole("button", { name: "إنشاء وإضافة" }))

    await waitFor(() => {
      expect(mockCreateMemberDirectMutateAsync).toHaveBeenCalledWith({
        organizationId: "org-1",
        email: "multi.direct@madar.ai",
        fullName: "Multi Direct User",
        workspaceIds: ["ws-1", "ws-2"],
        password: "TemporaryPass123",
      })
    })
  })

  it("keeps the direct-add submit button disabled for a password shorter than 12 characters", () => {
    render(<AdministrationAddUserDialog open onOpenChange={() => {}} organizationId="org-1" />)

    fireEvent.click(screen.getByRole("button", { name: "إضافة مباشرة" }))

    fireEvent.change(screen.getByLabelText(/^الاسم الكامل/), { target: { value: "Short Pass" } })
    fireEvent.change(screen.getByLabelText(/^البريد الإلكتروني/), {
      target: { value: "short@madar.ai" },
    })
    fireEvent.change(screen.getByLabelText(/^كلمة المرور/), { target: { value: "short" } })

    expect(
      (screen.getByRole("button", { name: "إنشاء وإضافة" }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(mockCreateMemberDirectMutateAsync).not.toHaveBeenCalled()
  })
})
