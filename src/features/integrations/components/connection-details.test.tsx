import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/constants/routes"

import { ConnectionDetails } from "./connection-details"

const mockUseConnectionsCenter = vi.fn()
const mockRouterPush = vi.fn()
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
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

vi.mock("./connection-actions-menu", () => ({
  ConnectionActionsMenu: ({
    actions,
    menuLabel,
    onActionSelect,
  }: {
    actions: Array<{ id: string; label: string; enabled: boolean }>
    menuLabel: string
    onActionSelect: (action: { id: string; label: string; enabled: boolean }) => void
  }) => (
    <div aria-label={menuLabel}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={!action.enabled}
          onClick={() => {
            onActionSelect(action)
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}))

const record = {
  connectorDefinitionId: "connector_def_google_ads",
  connectorId: "google_ads",
  platformName: "Google Ads",
  platformLogo: "GO",
  version: "1.0.0",
  capabilities: ["campaigns", "ads", "traffic"],
  workspaceName: "Madar Advertising",
  connectedAccount: "Google Ads Account",
  connectedAccounts: ["Google Ads Account"],
  connection: {
    connectionId: "conn_delete_1",
    workspaceId: "ws_1",
    connectorId: "google_ads",
    connectorDefinitionId: "connector_def_google_ads",
    status: "connected",
    metadata: {},
    createdAt: "2026-06-19T00:00:00.000Z",
    updatedAt: "2026-06-19T00:00:00.000Z",
  },
  integrationStatus: {
    latestJob: undefined,
    latestRun: undefined,
    recentEvents: [],
  },
  healthState: "Healthy",
  retryCount: 0,
}

describe("ConnectionDetails", () => {
  it("deletes connection after confirmation and navigates back to overview", async () => {
    const deleteConnection = vi.fn().mockResolvedValue(undefined)

    mockUseConnectionsCenter.mockReturnValue({
      getConnectionById: () => record,
      deleteConnection,
    })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ConnectionDetails connectionId="conn_delete_1" />
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole("button", { name: "Delete Connection" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(deleteConnection).toHaveBeenCalledWith("conn_delete_1")
      expect(toastSuccess).toHaveBeenCalledWith("Connection deleted successfully.")
      expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.integrations)
    })
  })
})
