import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomerDetail, CustomerRecord } from "../types"
import { CustomerProfile } from "./customer-profile"
import { CustomersOverview } from "./customers-overview"

const MOCK_CUSTOMERS: CustomerRecord[] = [
  {
    id: "salla:1",
    name: "Sara Al-Amri",
    email: "sara@example.com",
    phone: "+966501234567",
    platform: "Salla",
    createdAt: "2026-01-15T08:00:00.000Z",
    totalOrders: 24,
    totalRevenue: 12840,
    lifetimeValue: 12840,
    lastPurchaseAt: "2026-08-18T00:00:00.000Z",
    status: "active",
    segment: "VIP",
  },
  {
    id: "salla:2",
    name: "Khalid Al-Rashidi",
    email: "khalid@example.com",
    phone: null,
    platform: "Salla",
    createdAt: "2026-04-22T09:30:00.000Z",
    totalOrders: 1,
    totalRevenue: 210,
    lifetimeValue: 210,
    lastPurchaseAt: "2026-08-01T00:00:00.000Z",
    status: "active",
    segment: "One Time",
  },
]

const MOCK_DETAIL: CustomerDetail = {
  ...MOCK_CUSTOMERS[0],
  orders: [
    {
      orderId: "ord_1",
      status: "completed",
      revenue: 349,
      currency: "SAR",
      itemCount: 2,
      createdAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  productsPurchased: ["Abaya"],
  averageOrderValue: 349,
}

const listCustomers = vi.fn()
const getCustomer = vi.fn()

vi.mock("../services", () => ({
  customerListService: {
    listCustomers: (...args: unknown[]) => listCustomers(...args),
    getCustomer: (...args: unknown[]) => getCustomer(...args),
  },
}))

beforeEach(() => {
  listCustomers.mockReset()
  getCustomer.mockReset()
})

describe("CustomersOverview", () => {
  it("renders the page header and real customer rows once loaded", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)

    render(<CustomersOverview />)
    expect(screen.getByText("Customers")).toBeTruthy()
    expect(await screen.findByText("Sara Al-Amri")).toBeTruthy()
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("shows status filter options", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0)
  })

  it("filters by search query", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "khalid" } })
    expect(screen.getByText("Khalid Al-Rashidi")).toBeTruthy()
    expect(screen.queryByText("Sara Al-Amri")).toBeNull()
  })

  it("shows View 360 links for each customer row", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")
    const links = screen.getAllByRole("link", { name: /view 360/i })
    expect(links.length).toBeGreaterThan(0)
  })

  it("shows clear filters button when filters are active", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "khalid" } })
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeTruthy()
  })

  it("clears search when clear button is clicked", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "khalid" } })
    const clearButton = screen.getByRole("button", { name: /clear search/i })
    fireEvent.click(clearButton)
    expect((input as HTMLInputElement).value).toBe("")
  })

  it("shows an empty state when no customers have synced yet", async () => {
    listCustomers.mockResolvedValue([])
    render(<CustomersOverview />)
    expect(await screen.findByText(/no customers synced yet/i)).toBeTruthy()
  })

  it("shows empty state when no customers match filters", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /search customers/i })
    fireEvent.change(input, { target: { value: "zzznomatch99999" } })
    expect(screen.getByText(/no customers matched/i)).toBeTruthy()
  })

  it("shows a load error message when the request fails", async () => {
    listCustomers.mockRejectedValue(new Error("network down"))
    render(<CustomersOverview />)
    expect(await screen.findByText(/couldn't load customers/i)).toBeTruthy()
  })
})

describe("CustomerProfile", () => {
  it("renders the identity section for a real customer", async () => {
    getCustomer.mockResolvedValue(MOCK_DETAIL)
    render(<CustomerProfile customerId="salla:1" />)
    expect((await screen.findAllByText("Sara Al-Amri")).length).toBeGreaterThan(0)
  })

  it("renders section headers for real-data-only sections", async () => {
    getCustomer.mockResolvedValue(MOCK_DETAIL)
    render(<CustomerProfile customerId="salla:1" />)
    await screen.findAllByText("Sara Al-Amri")
    expect(screen.getByText("Identity")).toBeTruthy()
    expect(screen.getByText("Commerce")).toBeTruthy()
    expect(screen.queryByText("Attribution")).toBeNull()
    expect(screen.queryByText("Website Activity")).toBeNull()
    expect(screen.queryByText("Marketing Activity")).toBeNull()
  })

  it("renders back to customers link", async () => {
    getCustomer.mockResolvedValue(MOCK_DETAIL)
    render(<CustomerProfile customerId="salla:1" />)
    await screen.findAllByText("Sara Al-Amri")
    expect(screen.getByRole("link", { name: /back to customers/i })).toBeTruthy()
  })

  it("shows not-found state for unknown customer", async () => {
    getCustomer.mockResolvedValue(null)
    render(<CustomerProfile customerId="salla:unknown" />)
    expect(await screen.findByText(/customer not found/i)).toBeTruthy()
  })

  it("renders the segment badge for the customer", async () => {
    getCustomer.mockResolvedValue(MOCK_DETAIL)
    render(<CustomerProfile customerId="salla:1" />)
    expect((await screen.findAllByText("VIP")).length).toBeGreaterThan(0)
  })

  it("renders real order rows in the Commerce section", async () => {
    getCustomer.mockResolvedValue(MOCK_DETAIL)
    render(<CustomerProfile customerId="salla:1" />)
    expect(await screen.findByText("ord_1")).toBeTruthy()
  })
})
