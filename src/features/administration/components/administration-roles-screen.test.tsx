import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { IAM_ROLES } from "../services"
import { AdministrationRolesScreen } from "./administration-roles-screen"

vi.mock("./administration-module-nav", () => ({
  AdministrationModuleNav: () => <nav data-testid="administration-nav" />,
}))

describe("AdministrationRolesScreen", () => {
  it("opens Edit dialog for every role card with prefilled data", () => {
    render(<AdministrationRolesScreen />)

    const editButtons = screen.getAllByRole("button", { name: "Edit" })

    for (const [index, role] of IAM_ROLES.entries()) {
      fireEvent.click(editButtons[index])

      expect(screen.getByRole("dialog", { name: "Edit Role" })).toBeTruthy()
      expect((screen.getByLabelText("Role name") as HTMLInputElement).value).toBe(role.name)
      expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
        role.description
      )
      expect(screen.getByText(new RegExp(`from ${role.name}`))).toBeTruthy()

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
      expect(screen.queryByRole("dialog", { name: "Edit Role" })).toBeNull()
    }
  })

  it("opens Clone dialog for every role card and pre-fills cloned values", () => {
    render(<AdministrationRolesScreen />)

    const cloneButtons = screen.getAllByRole("button", { name: "Clone" })

    for (const [index, role] of IAM_ROLES.entries()) {
      fireEvent.click(cloneButtons[index])

      expect(screen.getByRole("dialog", { name: "Create Role from Clone" })).toBeTruthy()
      expect((screen.getByLabelText("Role name") as HTMLInputElement).value).toBe(
        `${role.name} Copy`
      )
      expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
        role.description
      )
      expect(screen.getByText(new RegExp(`from ${role.name}`))).toBeTruthy()

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
      expect(screen.queryByRole("dialog", { name: "Create Role from Clone" })).toBeNull()
    }
  })

  it("saves edit updates and clone creation", () => {
    render(<AdministrationRolesScreen />)

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0])
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Owner Updated" } })
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Updated owner role" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(screen.getByText("Owner Updated")).toBeTruthy()

    fireEvent.click(screen.getAllByRole("button", { name: "Clone" })[IAM_ROLES.length - 1])
    fireEvent.change(screen.getByLabelText("Role name"), {
      target: { value: "Custom Role Copy QA" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create role" }))

    expect(screen.getByText("Custom Role Copy QA")).toBeTruthy()
  })

  it("closes dialog on Escape", () => {
    render(<AdministrationRolesScreen />)

    fireEvent.click(screen.getByRole("button", { name: "Create Custom Role" }))
    expect(screen.getByRole("dialog", { name: "Create Custom Role" })).toBeTruthy()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Create Custom Role" })).toBeNull()
  })
})
