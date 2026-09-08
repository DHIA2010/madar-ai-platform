import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/constants/routes"

import { NewConnectionWizard } from "./new-connection-wizard"

// next/font is a build-time transform with no runtime implementation under vitest.
vi.mock("@/components/design/fonts", () => ({
  tajawal: { className: "font-tajawal" },
}))

const mockRefetch = vi.fn()
const mockCreateConnection = vi.fn()
const mockConnect = vi.fn()
const mockScheduleSync = vi.fn()
const mockRunSync = vi.fn()
const mockSelectAccount = vi.fn()
const mockValidateConnection = vi.fn()
const mockRouterPush = vi.fn()

vi.mock("../hooks", () => ({
  useConnectionsCenter: () => ({
    refetch: mockRefetch,
  }),
}))

// A stable object, matching the real ApplicationServicesContext's useMemo'd value --
// a fresh literal per call would make effects that depend on these references (e.g. the
// wizard's OAuth-callback effect) re-run on every render and never settle.
const mockApplicationServices = {
  connectionManager: {
    createConnection: mockCreateConnection,
    connect: mockConnect,
    scheduleSync: mockScheduleSync,
    runSync: mockRunSync,
    selectAccount: mockSelectAccount,
  },
  integrationApplicationService: {
    validateConnection: mockValidateConnection,
  },
}

vi.mock("@/application/context", () => ({
  useApplicationServices: () => mockApplicationServices,
}))

vi.mock("@/features/workspace", () => ({
  useWorkspace: () => ({
    currentWorkspace: {
      id: "ws_marketing_ops",
      name: "Marketing Ops",
      organizationId: "org_1",
      slug: "marketing-ops",
      settings: {
        locale: "en-US",
        timezone: "Asia/Riyadh",
        currency: "SAR",
        dateFormat: "dd/MM/yyyy",
      },
    },
  }),
  WorkspaceSelector: () => null,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}))

describe("NewConnectionWizard", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    window.history.pushState({}, "", ROUTES.integrationsNew)
  })

  // The platform step is the screen the Figma export describes: Arabic category chips, a
  // search box, and a card grid whose selected card drives the footer's primary action.
  it("filters the platform grid by category and by search", async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    expect(screen.getByText("المنصات المتاحة")).toBeTruthy()
    expect(screen.getByText("Salla")).toBeTruthy()
    expect(screen.getByText("Google Ads")).toBeTruthy()

    // "متاجر إلكترونية" is both a chip and the tag on every store card, so scope the click
    // to the chip row by picking the button.
    fireEvent.click(screen.getByRole("button", { name: "متاجر إلكترونية" }))
    expect(screen.getByText("Salla")).toBeTruthy()
    expect(screen.queryByText("Google Ads")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "الكل" }))
    fireEvent.change(screen.getByLabelText("ابحث عن منصة"), { target: { value: "tiktok" } })
    expect(screen.getByText("TikTok Ads")).toBeTruthy()
    expect(screen.queryByText("Salla")).toBeNull()

    fireEvent.change(screen.getByLabelText("ابحث عن منصة"), { target: { value: "لا شيء" } })
    expect(screen.getByText("لا توجد منصة مطابقة لبحثك.")).toBeTruthy()
  })

  it("selects a platform from its card and carries it into the footer action", async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByText("Zid"))

    expect(screen.getByRole("button", { name: /المتابعة إلى Zid/ })).toBeTruthy()
    expect(screen.getByText("المنصة المختارة")).toBeTruthy()
  })

  it("keeps Previous inside the wizard and disables it on step 1", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    const previousOnStepOne = screen.getByRole("button", { name: /السابق/ })
    expect(previousOnStepOne).toHaveProperty("disabled", true)

    fireEvent.click(screen.getByRole("button", { name: /المتابعة إلى Salla/ }))
    expect(screen.getAllByText("تسجيل الدخول والتفويض").length).toBeGreaterThan(0)

    const previousOnStepTwo = screen.getByRole("button", { name: /السابق/ })
    expect(previousOnStepTwo).toHaveProperty("disabled", false)

    fireEvent.click(previousOnStepTwo)
    expect(screen.getAllByText("اختيار المنصة").length).toBeGreaterThan(0)
    expect(mockRouterPush).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /إلغاء/ }))
    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.integrations)
  })

  // The export gives step two its own "الاتصال بـ <platform>" button inside the card, next
  // to the footer's "المتابعة". Both start the same OAuth handoff, so the in-card one has
  // to be wired up rather than being decoration.
  it("starts the OAuth handoff from the card's own connect button", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: /المتابعة إلى Salla/ }))

    // The summary rail carries the real setup facts, not placeholders.
    expect(screen.getByText("ملخص الاتصال")).toBeTruthy()
    expect(screen.getByText("الطلبات، المنتجات، العملاء")).toBeTruthy()
    expect(screen.getAllByText("OAuth 2.0").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /الاتصال بـ Salla/ }))

    await waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalled()
    })
  })

  // Salla (the wizard's default-selected platform) is a real OAuth connector: clicking
  // "Continue to OAuth" must NOT synchronously jump ahead -- it has to wait for the actual
  // browser round trip to Salla and back, which only resolves once the wizard remounts with
  // ?salla_oauth=connected&... in the URL (exactly what a real redirect produces). A
  // fresh render with that URL already set is how that round trip is simulated here.
  it("waits for the OAuth callback instead of advancing immediately, then resumes correctly after it", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })

    const queryClient = new QueryClient()

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: /المتابعة إلى Salla/ }))
    fireEvent.click(screen.getByRole("button", { name: "المتابعة" }))

    await waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalled()
    })

    // The defining regression check: still waiting, not already on "Review Configuration".
    expect(screen.queryByRole("button", { name: /مراجعة الإعدادات/ })).toBeNull()

    unmount()

    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1&salla_account_name=Madar%20Test%20Store`
    )

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(mockValidateConnection).toHaveBeenCalledWith({ connectionId: "conn_1" })
      expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))
    expect(screen.getAllByText("مراجعة وإتمام").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /السابق/ }))
    expect(screen.getAllByText("اختيار بيانات الاستيراد").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /السابق/ }))
    expect(screen.getAllByText("تسجيل الدخول والتفويض").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /السابق/ }))
    expect(screen.getAllByText("اختيار المنصة").length).toBeGreaterThan(0)

    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  // Step 3 is only reachable after a completed OAuth handshake, so it cannot be opened in local
  // dev at all (no provider credentials are configured there). This renders it through the same
  // callback-resume path the wizard really uses, so the import step has coverage that does not
  // depend on being able to click through to it by hand.
  it("renders the import step's configuration, presets and summary once resumed", async () => {
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1`
    )

    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("اختر البيانات المراد استيرادها")).toBeTruthy()
    })

    expect(
      screen.getByText("يمكنك اختيار مجموعة مقترحة، أو تحديد البيانات حسب احتياجك.")
    ).toBeTruthy()
    for (const preset of ["الكل", "مقترح", "مخصص"]) {
      expect(screen.getByRole("button", { name: preset })).toBeTruthy()
    }
    for (const tile of ["تكرار المزامنة", "المدة المتوقعة", "الإعداد المسبق"]) {
      expect(screen.getByText(tile)).toBeTruthy()
    }

    // Objects render under their Arabic labels while the values stay the identifiers the
    // sync scheduler reads back.
    for (const label of ["العملاء", "الطلبات", "المنتجات", "المخزون", "التصنيفات"]) {
      expect(screen.getByText(label)).toBeTruthy()
    }

    // Objects are selectable, and switching preset is what drives that selection.
    fireEvent.click(screen.getByRole("button", { name: "الكل" }))
    await waitFor(() => {
      expect(screen.getByText("جميع البيانات المحددة")).toBeTruthy()
    })

    expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
  })

  // Step 4 is as unreachable in local dev as step 3, for the same reason, and it has two faces:
  // the review summary and the success panel the same step swaps to once the connection is
  // created. Both are covered here.
  it("renders the review step's summary, then the success panel after creating", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_1" })
    mockSelectAccount.mockResolvedValue(undefined)
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1`
    )

    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))

    await waitFor(() => {
      expect(screen.getByText("تفاصيل الربط")).toBeTruthy()
    })

    // The summary tiles carry the real choices made earlier in the wizard, not placeholders.
    for (const label of [
      "المنصة",
      "مساحة العمل",
      "الحساب",
      "نوع الربط",
      "طريقة المصادقة",
      "معدل المزامنة",
      "البيانات المحددة للاستيراد",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText("Madar Test Store").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "إنشاء التكامل" }))

    await waitFor(() => {
      expect(screen.getByText("تم ربط منصة Salla بنجاح")).toBeTruthy()
    })
    expect(screen.getAllByText("تم الربط بنجاح").length).toBeGreaterThan(0)
    for (const tile of ["مراقبة الصحة", "المزامنة التلقائية", "المزامنة الأولى المتوقعة"]) {
      expect(screen.getByText(tile)).toBeTruthy()
    }
    expect(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ })).toBeTruthy()
  })

  it("moves through the full OAuth-first wizard flow and finalizes, once resumed post-callback", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_1" })
    mockRunSync.mockResolvedValue({ syncRunId: "sync_1" })
    mockSelectAccount.mockResolvedValue(undefined)
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1&salla_account_name=Madar%20Test%20Store`
    )

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "إنشاء التكامل" })).toBeTruthy()
    })
    expect(screen.getAllByText("مراجعة وإتمام").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "إنشاء التكامل" }))

    await waitFor(() => {
      expect(mockScheduleSync).toHaveBeenCalled()
      expect(mockRefetch).toHaveBeenCalled()
      expect(screen.getByText("تم ربط منصة Salla بنجاح")).toBeTruthy()
    })

    // Confirms the discovered account is actually persisted to the backend before sync is
    // scheduled, rather than only living in local wizard state (previously never called at all).
    expect(mockSelectAccount).toHaveBeenCalledWith({
      connectionId: "conn_1",
      customerId: "998877",
    })

    // The sync screen reports what the run actually returns. runSync resolves once, at the
    // end -- there is no progress feed -- so the screen shows a real clock and the run's own
    // totals, and must never print a percentage or per-object counts it was not given.
    mockRunSync.mockResolvedValue({
      syncRunId: "sync_1",
      status: "completed",
      result: { recordsRead: 2000, recordsWritten: 1994, recordsFailed: 6, durationMs: 12000 },
    })

    fireEvent.click(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ }))
    expect(mockRunSync).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getAllByText(/اكتملت مزامنة بيانات Salla/).length).toBeGreaterThan(0)
    })

    expect(screen.getByText("سجلات مقروءة")).toBeTruthy()
    expect(screen.getByText("2,000")).toBeTruthy()
    expect(screen.getByText("1,994")).toBeTruthy()
    expect(screen.getByText("6")).toBeTruthy()
    expect(document.body.textContent).not.toContain("NaN")
    expect(document.body.textContent).not.toContain("undefined")
  })

  // A run that comes back with no result must not invent totals of zero.
  it("omits the record totals when the connector reports none", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_1" })
    mockSelectAccount.mockResolvedValue(undefined)
    mockRunSync.mockResolvedValue({ syncRunId: "sync_1", status: "completed" })
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1`
    )

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "إنشاء التكامل" })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التكامل" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ }))

    await waitFor(() => {
      expect(screen.getAllByText(/اكتملت مزامنة بيانات Salla/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText("سجلات مقروءة")).toBeNull()
  })

  // A failed run surfaces the provider's own message and offers a retry.
  it("surfaces a failed sync with the real error and a retry", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_1" })
    mockSelectAccount.mockResolvedValue(undefined)
    mockRunSync.mockRejectedValue(new Error("انتهت مهلة الاتصال بالمزود"))
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "998877", displayName: "Madar Test Store", isSelected: true },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_1`
    )

    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /مراجعة الإعدادات/ })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "إنشاء التكامل" })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: "إنشاء التكامل" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /تشغيل المزامنة الآن/ }))

    await waitFor(() => {
      expect(screen.getByText("انتهت مهلة الاتصال بالمزود")).toBeTruthy()
    })
    expect(screen.getByRole("button", { name: /إعادة المحاولة/ })).toBeTruthy()
  })

  it("lets the user pick a non-default account when multiple are discovered, and persists that choice", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_2" })
    mockConnect.mockResolvedValue({ connectionId: "conn_2" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_2" })
    mockRunSync.mockResolvedValue({ syncRunId: "sync_2" })
    mockSelectAccount.mockResolvedValue(undefined)
    mockValidateConnection.mockResolvedValue({
      payload: {
        connectorId: "salla",
        connectorDefinitionId: "connector_def_salla",
        metadata: {
          availableSallaCustomerAccounts: JSON.stringify([
            { customerId: "111", displayName: "First Store", isSelected: true },
            { customerId: "222", displayName: "Second Store", isSelected: false },
            { customerId: "333", displayName: "Third Store", isSelected: false },
          ]),
        },
      },
    })
    window.history.pushState(
      {},
      "",
      `${ROUTES.integrationsNew}?salla_oauth=connected&salla_connection_id=conn_2&salla_account_name=First%20Store`
    )

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText("Third Store")).toBeTruthy()
    })

    fireEvent.click(screen.getByText("Third Store"))

    fireEvent.click(screen.getByRole("button", { name: /مراجعة الإعدادات/ }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "إنشاء التكامل" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "إنشاء التكامل" }))

    await waitFor(() => {
      expect(mockScheduleSync).toHaveBeenCalled()
    })

    expect(mockSelectAccount).toHaveBeenCalledWith({
      connectionId: "conn_2",
      customerId: "333",
    })
  })
})
