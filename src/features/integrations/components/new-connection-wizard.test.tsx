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
const mockRouterPush = vi.fn()

vi.mock("../hooks", () => ({
  useConnectionsCenter: () => ({
    refetch: mockRefetch,
  }),
}))

vi.mock("@/application/context", () => ({
  useApplicationServices: () => ({
    connectionManager: {
      createConnection: mockCreateConnection,
      connect: mockConnect,
      scheduleSync: mockScheduleSync,
      runSync: mockRunSync,
    },
  }),
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

  it("moves backward one wizard step at a time without leaving the wizard", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole("button", { name: /Continue to Salla/i }))
    fireEvent.click(screen.getByRole("button", { name: /Continue to OAuth/i }))

    await waitFor(
      () => {
        expect(mockConnect).toHaveBeenCalled()
        expect(screen.getByRole("button", { name: /Review Configuration/i })).toBeTruthy()
      },
      { timeout: 5000 }
    )

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

  it("moves through OAuth-first wizard flow and finalizes", async () => {
    mockCreateConnection.mockResolvedValue({ connectionId: "conn_1" })
    mockConnect.mockResolvedValue({ connectionId: "conn_1" })
    mockScheduleSync.mockResolvedValue({ scheduleId: "sched_1" })
    mockRunSync.mockResolvedValue({ syncRunId: "sync_1" })

    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NewConnectionWizard />
      </QueryClientProvider>
    )

    expect(screen.getAllByText("New Connection").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Step 1 of 4").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Continue to Salla/i })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Continue to Salla/i }))
    expect(screen.getAllByText("Connect").length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: /Continue to OAuth/i }))

    await waitFor(
      () => {
        expect(mockCreateConnection).toHaveBeenCalled()
        expect(mockConnect).toHaveBeenCalled()
        expect(screen.getByRole("button", { name: /Review Configuration/i })).toBeTruthy()
      },
      { timeout: 5000 }
    )

    fireEvent.click(screen.getByRole("button", { name: /Review Configuration/i }))
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Connection" })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Create Connection" }))

    await waitFor(() => {
      expect(mockScheduleSync).toHaveBeenCalled()
      expect(mockRefetch).toHaveBeenCalled()
      expect(screen.getByText("Salla Connected")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: "Run First Sync" }))
    expect(mockRunSync).toHaveBeenCalled()
  })
})
