import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ConnectionsOverview } from "./connections-overview"

const mockUseConnectionsCenter = vi.fn()

vi.mock("../hooks", () => ({
  useConnectionsCenter: () => mockUseConnectionsCenter(),
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
  it("renders connection cards and supports search/filter interactions", () => {
    const updateFilters = vi.fn()

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
      connect: vi.fn(),
      disconnect: vi.fn(),
      pauseSync: vi.fn(),
      resumeSync: vi.fn(),
      refreshToken: vi.fn(),
      retrySync: vi.fn(),
      runSync: vi.fn(),
    })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ConnectionsOverview />
      </QueryClientProvider>
    )

    expect(screen.getByText("Connections Overview")).toBeTruthy()
    expect(screen.getAllByText("3 Accounts Connected").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Run Sync" })).toBeTruthy()
  })
})
