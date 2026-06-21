import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CustomerProfile } from "./customer-profile"
import { CustomersOverview } from "./customers-overview"

// CustomersOverview uses no context — it calls customerListService directly via hooks.

describe("CustomersOverview", () => {
  it("renders the page header and customer table", () => {
    render(<CustomersOverview />)
    expect(screen.getByText("Customers")).toBeTruthy()
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("renders seed customer rows", () => {
    render(<CustomersOverview />)
    expect(screen.getByText("Sara Al-Amri")).toBeTruthy()
  })

  it("shows status filter options", () => {
    render(<CustomersOverview />)
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0)
  })

  it("filters by search query", () => {
    render(<CustomersOverview />)
    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "khalid" } })
    expect(screen.getByText("Khalid Al-Rashidi")).toBeTruthy()
    expect(screen.queryByText("Sara Al-Amri")).toBeNull()
  })

  it("shows View 360 links for each customer row", () => {
    render(<CustomersOverview />)
    const links = screen.getAllByRole("link", { name: /view 360/i })
    expect(links.length).toBeGreaterThan(0)
  })

  it("shows clear filters button when filters are active", () => {
    render(<CustomersOverview />)
    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "omar" } })
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeTruthy()
  })

  it("clears search when clear button is clicked", () => {
    render(<CustomersOverview />)
    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "omar" } })
    const clearButton = screen.getByRole("button", { name: /clear search/i })
    fireEvent.click(clearButton)
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("shows pagination controls when there are results", () => {
    render(<CustomersOverview />)
    expect(screen.getByRole("button", { name: /previous page/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /next page/i })).toBeTruthy()
  })

  it("shows empty state when no customers match filters", () => {
    render(<CustomersOverview />)
    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "zzznomatch99999" } })
    expect(screen.getByText(/no customers matched/i)).toBeTruthy()
  })
})

describe("CustomerProfile", () => {
  it("renders the identity section for a known customer", () => {
    render(<CustomerProfile customerId="cust_001" />)
    expect(screen.getAllByText("Sara Al-Amri").length).toBeGreaterThan(0)
  })

  it("renders section headers", () => {
    render(<CustomerProfile customerId="cust_001" />)
    expect(screen.getByText("Identity")).toBeTruthy()
    expect(screen.getByText("Commerce")).toBeTruthy()
    expect(screen.getByText("Attribution")).toBeTruthy()
    expect(screen.getByText("Segments")).toBeTruthy()
  })

  it("renders back to customers link", () => {
    render(<CustomerProfile customerId="cust_001" />)
    expect(screen.getByRole("link", { name: /back to customers/i })).toBeTruthy()
  })

  it("shows not-found state for unknown customer", () => {
    render(<CustomerProfile customerId="cust_unknown_xyz" />)
    expect(screen.getByText(/customer not found/i)).toBeTruthy()
  })

  it("renders segment badges for the customer", () => {
    render(<CustomerProfile customerId="cust_001" />)
    expect(screen.getAllByText("VIP").length).toBeGreaterThan(0)
  })
})
