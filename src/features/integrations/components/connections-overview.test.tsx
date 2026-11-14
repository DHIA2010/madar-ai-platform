import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/font is a build-time transform with no runtime implementation, so it has to be stubbed
// for anything importing the design system's typeface.
vi.mock("@/components/design/fonts", () => ({
  cairo: { className: "font-cairo" },
}))

import { ConnectionsOverview } from "./connections-overview"

const mockUseConnectionsCenter = vi.fn()
const mockRouterReplace = vi.fn()
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
// The organization's activated applications; a test may swap them before rendering.
const organizationSettings = vi.hoisted(() => ({
  current: { advertisingEnabled: true, ecommerceEnabled: true } as Record<string, boolean>,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}))

vi.mock("../hooks", () => ({
  useConnectionsCenter: () => mockUseConnectionsCenter(),
}))

vi.mock("@/features/workspace", () => ({
  // Both connector-bearing applications active, so every category's connections are listed.
  useWorkspace: () => ({
    availableWorkspaces: [],
    currentWorkspace: null,
    currentOrganization: { settings: organizationSettings.current },
  }),
}))

vi.mock("@/features/authentication", () => ({
  Can: ({ children }: { children: React.ReactNode }) => children,
}))

const mockRecord = {
  connectorDefinitionId: "connector_def_google_ads",
  connectorId: "google_ads",
  platformName: "Google Ads",
  platformLogo: "GO",
  version: "1.0.0",
  capabilities: ["campaigns", "ads", "traffic"],
  workspaceName: "Madar Advertising",
  connectedAccount: "Google Ads Account",
  connectedAccounts: ["Google Ads Account", "UK Ads", "MCC Production"],
  connection: {
    connectionId: "conn_1",
    workspaceId: "ws_1",
    connectorId: "google_ads",
    connectorDefinitionId: "connector_def_google_ads",
    status: "connected",
    metadata: {},
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
  },
  integrationStatus: {
    connection: {
      connectionId: "conn_1",
      workspaceId: "ws_1",
      connectorId: "google_ads",
      connectorDefinitionId: "connector_def_google_ads",
      status: "connected",
      metadata: {},
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
    },
    recentEvents: [],
  },
  healthState: "Healthy",
  retryCount: 0,
  lastSyncAt: "2026-06-19T00:00:00.000Z",
  nextSyncAt: "2026-06-19T01:00:00.000Z",
}

const mockAnalyticsRecord = {
  ...mockRecord,
  connectorDefinitionId: "connector_def_google_analytics",
  connectorId: "google_analytics",
  platformName: "Google Analytics 4",
  connectedAccount: "madar.my",
  connectedAccounts: ["madar.my"],
  connection: { ...mockRecord.connection, connectionId: "conn_2" },
}

function connectionsCenter(records: Array<typeof mockRecord>) {
  return {
    isLoading: false,
    error: null,
    records,
    filteredRecords: records,
    filters: {
      search: "",
      status: "all",
      health: "all",
      platform: "all",
      workspace: "all",
      capability: "all",
    },
    availableFilters: {
      platforms: records.map((record) => record.platformName),
      workspaces: ["Madar Advertising"],
      capabilities: ["campaigns", "ads", "traffic"],
    },
    updateFilters: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    pauseSync: vi.fn(),
    resumeSync: vi.fn(),
    refreshToken: vi.fn(),
    retrySync: vi.fn(),
    runSync: vi.fn(),
    deleteConnection: vi.fn(),
  }
}

function renderOverview() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectionsOverview />
    </QueryClientProvider>
  )
}

describe("ConnectionsOverview", () => {
  afterEach(() => {
    organizationSettings.current = { advertisingEnabled: true, ecommerceEnabled: true }
  })

  // Google Analytics is grouped with the ad platforms, but an account with only e-commerce still
  // sees its Google Analytics connection -- and none of the ad platforms'.
  it("shows an e-commerce-only account its Google Analytics connection but no ad platform", () => {
    organizationSettings.current = { ecommerceEnabled: true }
    mockUseConnectionsCenter.mockReturnValue(connectionsCenter([mockRecord, mockAnalyticsRecord]))
    renderOverview()

    expect(screen.getAllByText("Google Analytics 4").length).toBeGreaterThan(0)
    expect(screen.queryByText("Google Ads")).toBeNull()
  })

  it("shows an ads account Google Analytics next to its ad platforms", () => {
    organizationSettings.current = { advertisingEnabled: true }
    mockUseConnectionsCenter.mockReturnValue(connectionsCenter([mockRecord, mockAnalyticsRecord]))
    renderOverview()

    expect(screen.getAllByText("Google Analytics 4").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Google Ads").length).toBeGreaterThan(0)
  })

  it("renders connection cards and supports search/filter interactions", async () => {
    const updateFilters = vi.fn()
    const connect = vi.fn()

    mockUseConnectionsCenter.mockReturnValue({
      isLoading: false,
      error: null,
      records: [mockRecord],
      filteredRecords: [mockRecord],
      filters: {
        search: "",
        status: "all",
        health: "all",
        platform: "all",
        workspace: "all",
        capability: "all",
      },
      availableFilters: {
        platforms: ["Google Ads"],
        workspaces: ["Madar Advertising"],
        capabilities: ["campaigns", "ads", "traffic"],
      },
      updateFilters,
      connect,
      disconnect: vi.fn(),
      pauseSync: vi.fn(),
      resumeSync: vi.fn(),
      refreshToken: vi.fn(),
      retrySync: vi.fn(),
      runSync: vi.fn(),
      deleteConnection: vi.fn(),
    })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ConnectionsOverview />
      </QueryClientProvider>
    )

    // The page is Arabic and renders connections as table rows rather than cards.
    expect(screen.getByText("مركز التكاملات")).toBeTruthy()
    expect(screen.getAllByText("Google Ads").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/حساب/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "مزامنة" })[0]).toBeTruthy()

    // The four KPI cards from the design, each with a derived hint underneath.
    expect(screen.getByText("إجمالي التكاملات")).toBeTruthy()
    expect(screen.getByText("التكاملات النشطة")).toBeTruthy()
    expect(screen.getByText("بحاجة إلى انتباه")).toBeTruthy()
    expect(screen.getByText("لا توجد مشاكل حالياً")).toBeTruthy()
    // A platform card and a table row for the same connection, as the design shows both.
    expect(screen.getAllByText("متصل").length).toBeGreaterThan(1)

    // Two menus per connection by design: one on its platform card, one on its table row.
    const actionMenus = screen.getAllByRole("button", { name: "إجراءات إضافية" })
    expect(actionMenus.length).toBeGreaterThan(1)
    fireEvent.pointerDown(actionMenus[0])

    expect(await screen.findByText("إيقاف المزامنة مؤقتًا")).toBeTruthy()
    expect(await screen.findByText("قطع الاتصال")).toBeTruthy()
    expect(await screen.findByText("حذف الاتصال")).toBeTruthy()
    expect(screen.queryByText("إعادة الاتصال")).toBeNull()
    expect(screen.queryByText("History")).toBeNull()
    expect(screen.queryByText("Logs")).toBeNull()
  })
})
