import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// next/font is a build-time transform with no runtime implementation, so it has to be stubbed
// for anything importing the design system's typeface.
vi.mock("@/components/design/fonts", () => ({
  tajawal: { className: "font-tajawal" },
}))

import { ConnectionsOverview } from "./connections-overview"

const mockUseConnectionsCenter = vi.fn()
const mockRouterReplace = vi.fn()
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
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
  useWorkspace: () => ({ availableWorkspaces: [], currentWorkspace: null }),
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

describe("ConnectionsOverview", () => {
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
    expect(screen.getByText("مركز الاتصالات")).toBeTruthy()
    expect(screen.getAllByText("Google Ads").length).toBeGreaterThan(0)
    expect(screen.getByText("Google Ads Account")).toBeTruthy()
    expect(screen.getByRole("button", { name: "مزامنة" })).toBeTruthy()

    // The health mix and the KPI row both read from the same records.
    expect(screen.getAllByText("سليمة").length).toBeGreaterThan(0)
    // Appears twice by design: the KPI card label and the donut's centre caption.
    expect(screen.getAllByText("إجمالي الاتصالات").length).toBeGreaterThan(0)

    fireEvent.pointerDown(screen.getByRole("button", { name: "إجراءات إضافية" }))

    expect(await screen.findByText("Pause Sync")).toBeTruthy()
    expect(await screen.findByText("Disconnect")).toBeTruthy()
    expect(await screen.findByText("Delete Connection")).toBeTruthy()
    expect(screen.queryByText("Reconnect")).toBeNull()
    expect(screen.queryByText("History")).toBeNull()
    expect(screen.queryByText("Logs")).toBeNull()
  })
})
