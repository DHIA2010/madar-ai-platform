import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ROUTES } from "@/constants/routes"

import { NewConnectionWizard } from "./new-connection-wizard"

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

  it("keeps Previous inside the wizard and disables it on step 1", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    const previousOnStepOne = screen.getByRole("button", { name: /Previous/i })
    expect(previousOnStepOne).toHaveProperty("disabled", true)

    fireEvent.click(screen.getByRole("button", { name: /Continue to Salla/i }))
    expect(screen.getAllByText("Connect").length).toBeGreaterThan(0)

    const previousOnStepTwo = screen.getByRole("button", { name: /Previous/i })
    expect(previousOnStepTwo).toHaveProperty("disabled", false)

    fireEvent.click(previousOnStepTwo)
    expect(screen.getAllByText("Platform").length).toBeGreaterThan(0)
    expect(mockRouterPush).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(mockRouterPush).toHaveBeenCalledWith(ROUTES.integrations)
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

    fireEvent.click(screen.getByRole("button", { name: /Continue to Salla/i }))
    fireEvent.click(screen.getByRole("button", { name: /Continue to OAuth/i }))

    await waitFor(() => {
      expect(mockCreateConnection).toHaveBeenCalled()
      expect(mockConnect).toHaveBeenCalled()
    })

    // The defining regression check: still waiting, not already on "Review Configuration".
    expect(screen.queryByRole("button", { name: /Review Configuration/i })).toBeNull()

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
      expect(screen.getByRole("button", { name: /Review Configuration/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /Review Configuration/i }))
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }))
    expect(screen.getAllByText("Import").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }))
    expect(screen.getAllByText("Connect").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }))
    expect(screen.getAllByText("Platform").length).toBeGreaterThan(0)

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
      expect(screen.getByText("Choose what MADAR should import")).toBeTruthy()
    })

    expect(screen.getByText("Import configuration")).toBeTruthy()
    for (const preset of ["Recommended", "Select All", "Custom"]) {
      expect(screen.getByRole("button", { name: preset })).toBeTruthy()
    }
    for (const tile of ["Estimated sync frequency", "Estimated duration", "Preset"]) {
      expect(screen.getByText(tile)).toBeTruthy()
    }

    // Objects are selectable, and switching preset is what drives that selection.
    fireEvent.click(screen.getByRole("button", { name: "Select All" }))
    await waitFor(() => {
      expect(screen.getByText("All objects")).toBeTruthy()
    })

    expect(screen.getByRole("button", { name: /Review Configuration/i })).toBeTruthy()
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
      expect(screen.getByRole("button", { name: /Review Configuration/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /Review Configuration/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Connection" })).toBeTruthy()
    })
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "Create Connection" }))

    await waitFor(() => {
      expect(mockScheduleSync).toHaveBeenCalled()
      expect(mockRefetch).toHaveBeenCalled()
      expect(screen.getByText("Salla Connected")).toBeTruthy()
    })

    // Confirms the discovered account is actually persisted to the backend before sync is
    // scheduled, rather than only living in local wizard state (previously never called at all).
    expect(mockSelectAccount).toHaveBeenCalledWith({
      connectionId: "conn_1",
      customerId: "998877",
    })

    fireEvent.click(screen.getByRole("button", { name: "Run First Sync" }))
    expect(mockRunSync).toHaveBeenCalled()
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

    fireEvent.click(screen.getByRole("button", { name: /Review Configuration/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Connection" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Create Connection" }))

    await waitFor(() => {
      expect(mockScheduleSync).toHaveBeenCalled()
    })

    expect(mockSelectAccount).toHaveBeenCalledWith({
      connectionId: "conn_2",
      customerId: "333",
    })
  })
})
