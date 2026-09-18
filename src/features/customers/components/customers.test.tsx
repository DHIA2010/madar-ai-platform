import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/constants/routes"

import type { CustomerRecord } from "../types"
import { CustomersOverview } from "./customers-overview"

const mockRouterPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}))

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
    accountBalance: null,
    region: null,
    isBusinessCustomer: false,
    vatNumber: null,
    commercialRegistration: null,
    buildingNumber: null,
    secondaryNumber: null,
    street: null,
    city: null,
    district: null,
    postalCode: null,
    countryCode: null,
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
    accountBalance: null,
    region: null,
    isBusinessCustomer: false,
    vatNumber: null,
    commercialRegistration: null,
    buildingNumber: null,
    secondaryNumber: null,
    street: null,
    city: null,
    district: null,
    postalCode: null,
    countryCode: null,
  },
]

// customers-overview.tsx imports customerListService directly from
// "../services/customer-list.service" (for createCustomer/updateCustomer/deleteCustomer), while
// the useCustomers/useCustomer hooks import the same singleton via the "../services" barrel --
// both module specifiers need mocking so every real call site is actually intercepted. vi.mock
// factories are hoisted above the file, so the mock fns and the shared object built from them
// must be created via vi.hoisted rather than as plain top-level consts.
const {
  listCustomers,
  updateCustomer,
  deleteCustomer,
  bulkImportCustomers,
  customerListServiceMock,
} = vi.hoisted(() => {
  const listCustomers = vi.fn()
  const updateCustomer = vi.fn()
  const deleteCustomer = vi.fn()
  const bulkImportCustomers = vi.fn()
  return {
    listCustomers,
    updateCustomer,
    deleteCustomer,
    bulkImportCustomers,
    customerListServiceMock: {
      listCustomers: (...args: unknown[]) => listCustomers(...args),
      updateCustomer: (...args: unknown[]) => updateCustomer(...args),
      deleteCustomer: (...args: unknown[]) => deleteCustomer(...args),
      bulkImportCustomers: (...args: unknown[]) => bulkImportCustomers(...args),
    },
  }
})
vi.mock("../services", () => ({ customerListService: customerListServiceMock }))
vi.mock("../services/customer-list.service", () => ({
  customerListService: customerListServiceMock,
}))

const NATIVE_CUSTOMER: CustomerRecord = {
  ...MOCK_CUSTOMERS[0],
  id: "native-1",
  name: "عميل مدار",
  platform: "Madar",
}

beforeEach(() => {
  listCustomers.mockReset()
  updateCustomer.mockReset()
  deleteCustomer.mockReset()
  bulkImportCustomers.mockReset()
  mockRouterPush.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe("CustomersOverview", () => {
  it("renders the Arabic page header and real customer rows once loaded", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)

    render(<CustomersOverview />)
    expect(screen.getByText("العملاء")).toBeTruthy()
    expect(await screen.findByText("Sara Al-Amri")).toBeTruthy()
    expect(screen.getByRole("table")).toBeTruthy()
  })

  it("shows status filter options", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")
    expect(screen.getAllByText("الحالة").length).toBeGreaterThan(0)
  })

  it("filters by search query", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /البحث عن العملاء/ })
    fireEvent.change(input, { target: { value: "khalid" } })
    expect(screen.getByText("Khalid Al-Rashidi")).toBeTruthy()
    expect(screen.queryByText("Sara Al-Amri")).toBeNull()
  })

  it("does not navigate anywhere for a synced customer -- no page exists to show them", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    const row = (await screen.findByText("Sara Al-Amri")).closest("tr")
    expect(row?.querySelector("a")).toBeNull()
    fireEvent.click(row as HTMLElement)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it("opens a native customer's real wallet statement when the row is clicked", async () => {
    const nativeCustomer: CustomerRecord = {
      ...MOCK_CUSTOMERS[0],
      id: "native-1",
      name: "عميل مدار",
      platform: "Madar",
    }
    listCustomers.mockResolvedValue([nativeCustomer])
    render(<CustomersOverview />)
    const row = (await screen.findByText("عميل مدار")).closest("tr")
    fireEvent.click(row as HTMLElement)
    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.customerStatement("native-1"))
  })

  it("shows a clear-filters button once a filter is active", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /البحث عن العملاء/ })
    fireEvent.change(input, { target: { value: "khalid" } })
    expect(screen.getByRole("button", { name: /مسح الفلاتر/ })).toBeTruthy()
  })

  it("clears the search when the clear-filters button is clicked", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /البحث عن العملاء/ }) as HTMLInputElement
    fireEvent.change(input, { target: { value: "khalid" } })
    fireEvent.click(screen.getByRole("button", { name: /مسح الفلاتر/ }))
    expect(input.value).toBe("")
    expect(screen.getByText("Sara Al-Amri")).toBeTruthy()
  })

  it("shows an empty state when no customers have synced yet", async () => {
    listCustomers.mockResolvedValue([])
    render(<CustomersOverview />)
    expect(await screen.findByText(/لا يوجد عملاء متزامنون بعد/)).toBeTruthy()
  })

  it("shows empty state when no customers match filters", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    const input = screen.getByRole("textbox", { name: /البحث عن العملاء/ })
    fireEvent.change(input, { target: { value: "zzznomatch99999" } })
    expect(screen.getByText(/لا يوجد عملاء مطابقون للفلاتر/)).toBeTruthy()
  })

  it("shows a load error message when the request fails", async () => {
    listCustomers.mockRejectedValue(new Error("network down"))
    render(<CustomersOverview />)
    expect(await screen.findByText(/couldn't load customers/i)).toBeTruthy()
  })

  it("shows edit and delete icon buttons only for a native customer, never a synced one", async () => {
    listCustomers.mockResolvedValue([...MOCK_CUSTOMERS, NATIVE_CUSTOMER])
    render(<CustomersOverview />)
    await screen.findByText("عميل مدار")

    expect(screen.getByRole("button", { name: "تعديل عميل مدار" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "حذف عميل مدار" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /تعديل Sara Al-Amri/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /حذف Sara Al-Amri/ })).toBeNull()
  })

  it("edits a native customer's name and sends only the changed field", async () => {
    listCustomers.mockResolvedValue([NATIVE_CUSTOMER])
    updateCustomer.mockResolvedValue({ ...NATIVE_CUSTOMER, name: "اسم جديد" })
    render(<CustomersOverview />)
    await screen.findByText("عميل مدار")

    fireEvent.click(screen.getByRole("button", { name: "تعديل عميل مدار" }))
    const nameInput = await screen.findByDisplayValue("عميل مدار")
    fireEvent.change(nameInput, { target: { value: "اسم جديد" } })
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديلات" }))

    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith("native-1", { name: "اسم جديد" })
    })
  })

  it("deletes a native customer after confirming and refetches the list", async () => {
    listCustomers.mockResolvedValueOnce([NATIVE_CUSTOMER]).mockResolvedValueOnce([])
    deleteCustomer.mockResolvedValue(undefined)
    render(<CustomersOverview />)
    await screen.findByText("عميل مدار")

    fireEvent.click(screen.getByRole("button", { name: "حذف عميل مدار" }))
    fireEvent.click(await screen.findByRole("button", { name: "حذف" }))

    await waitFor(() => {
      expect(deleteCustomer).toHaveBeenCalledWith("native-1")
    })
    await waitFor(() => {
      expect(listCustomers).toHaveBeenCalledTimes(2)
    })
  })

  it("shows a real error explaining a non-zero balance blocked deletion", async () => {
    listCustomers.mockResolvedValue([NATIVE_CUSTOMER])
    deleteCustomer.mockRejectedValue({
      code: "CUSTOMER_HAS_NONZERO_BALANCE",
      details: { accountBalance: 75 },
    })
    render(<CustomersOverview />)
    await screen.findByText("عميل مدار")

    fireEvent.click(screen.getByRole("button", { name: "حذف عميل مدار" }))
    fireEvent.click(await screen.findByRole("button", { name: "حذف" }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining("75"))
    })
  })

  it("exports the currently filtered customers as a real CSV download", async () => {
    // jsdom doesn't implement the Blob-URL APIs at all -- patched directly on the real URL
    // constructor (rather than replacing the global) so anything else relying on `new URL()`
    // keeps working, and restored after the assertion either way.
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = vi.fn().mockReturnValue("blob:mock")
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    try {
      listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
      render(<CustomersOverview />)
      await screen.findByText("Sara Al-Amri")

      fireEvent.click(screen.getByRole("button", { name: "تصدير" }))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0][0] as Blob
      expect(blob.type).toContain("text/csv")
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })

  it("imports a real CSV, creates the valid rows, and shows what was skipped", async () => {
    listCustomers.mockResolvedValue(MOCK_CUSTOMERS)
    bulkImportCustomers.mockResolvedValue({
      created: 1,
      skipped: [{ row: 1, reason: "الاسم مطلوب" }],
    })
    render(<CustomersOverview />)
    await screen.findByText("Sara Al-Amri")

    fireEvent.click(screen.getByRole("button", { name: "استيراد" }))
    const fileInput = (await screen.findByText("اضغط لاختيار ملف CSV"))
      .closest("label")
      ?.querySelector("input[type=file]") as HTMLInputElement
    // The second row has no name but a real phone -- csvToImportRows only drops a line that is
    // entirely blank, so this one survives parsing and reaches the backend as a real
    // name-required row for it to skip.
    const csv = "name,phone,email,region\n,0500000000,,\nمحمد العنزي,0511111111,,جدة\n"
    const file = new File([csv], "customers.csv", { type: "text/csv" })
    // This project's jsdom version doesn't implement Blob.prototype.text() -- polyfilled on
    // just this instance rather than globally, since the component's real File.text() call is
    // a standard, widely-supported API that only this test environment is missing.
    Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await screen.findByText("تم العثور على 2 صف")
    fireEvent.click(screen.getByRole("button", { name: /استيراد \(2\)/ }))

    await waitFor(() => {
      expect(bulkImportCustomers).toHaveBeenCalledWith([
        { name: "", phone: "0500000000", email: null, region: null },
        { name: "محمد العنزي", phone: "0511111111", email: null, region: "جدة" },
      ])
    })
    expect(await screen.findByText(/تم إضافة 1 عميل.*وتخطي 1 صف/)).toBeTruthy()
    expect(toastSuccess).toHaveBeenCalledWith("تم إضافة 1 عميل.")
  })
})
