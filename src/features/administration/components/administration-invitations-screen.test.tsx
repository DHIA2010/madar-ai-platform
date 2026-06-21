import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AdministrationInvitationsScreen } from "./administration-invitations-screen"

const { toastSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
  },
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
      <button type="button" role="combobox" data-slot="select-trigger" {...props}>
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
  })

  it("opens invite dialog when clicking Invite Users", () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Invite Users" }))

    expect(screen.getByRole("dialog", { name: "Invite Users" })).toBeTruthy()
    expect(
      screen.getByText("Send one or many invitations with workspace, role, and department context.")
    ).toBeTruthy()
  })

  it("supports role and workspace dropdown selection when sending an invitation", async () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Invite Users" }))

    const triggers = screen.getAllByRole("combobox")
    const roleTrigger = triggers[0]
    const workspaceTrigger = triggers[1]

    expect(roleTrigger).toBeTruthy()
    expect(workspaceTrigger).toBeTruthy()

    fireEvent.click(roleTrigger)
    fireEvent.click(await screen.findByRole("option", { name: "Viewer" }))

    fireEvent.click(workspaceTrigger)
    fireEvent.click(await screen.findByRole("option", { name: "Retail Expansion" }))

    fireEvent.change(screen.getByLabelText("Email addresses"), {
      target: { value: "new.user@madar.ai" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite Users" })).toBeNull()
    })

    const newInvitationRow = screen.getByText("new.user@madar.ai").closest("tr")
    expect(newInvitationRow).toBeTruthy()
    expect(newInvitationRow?.textContent).toContain("Viewer")
    expect(newInvitationRow?.textContent).toContain("Retail Expansion")
    expect(toastSuccess).toHaveBeenCalledWith("Invitation sent to 1 recipient(s)")
  })

  it("updates invitation status to canceled from row action", () => {
    render(<AdministrationInvitationsScreen />)

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0])

    expect(screen.getAllByText("canceled").length).toBeGreaterThan(0)
    expect(toastSuccess).toHaveBeenCalledWith("Invitation canceled")
  })
})
