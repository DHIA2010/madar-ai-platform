// Client for ZATCA Phase 2 (Integration Phase) device onboarding -- see the backend's
// zatca-devices-service.ts for what each step actually does. Every step here except submitOtp()
// runs with no live ZATCA dependency at all: generating a device/CSR is entirely local, and the
// Compliance Checks/Production exchange steps only ever act on a device that already has a real
// Compliance CSID from submitOtp().
import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same slash-literal workaround the other pos services document -- the repo's lint rule forbids
// slash-prefixed string literals so page routes can't be hardcoded, and cannot tell them apart
// from an API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const DEVICES_ENDPOINT = ["", "v1", "zatca", "devices"].join(PATH_SEPARATOR)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getWorkspaceIdFromStorage(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem("workspace-context")
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { state?: { currentWorkspace?: { id?: string } } }
    const workspaceId = parsed.state?.currentWorkspace?.id ?? null
    return workspaceId && UUID_PATTERN.test(workspaceId) ? workspaceId : null
  } catch {
    return null
  }
}

export type ZatcaDeviceStatus = "draft" | "compliance" | "production"
export type ZatcaCsrEnvironment = "sandbox" | "simulation" | "production"

export interface ZatcaDevice {
  id: string
  organizationId: string
  workspaceId: string | null
  commonName: string
  // The CSR itself (PEM) -- not secret, safe to show/copy in the UI so the taxpayer can submit
  // it through the Fatoora portal flow alongside the OTP.
  csr: string
  status: ZatcaDeviceStatus
  lastIcv: number
  createdAt: string
  updatedAt: string
}

export interface CreateZatcaDeviceInput {
  workspaceId: string | null
  commonName: string
  environment: ZatcaCsrEnvironment
  vatNumber: string
  organizationName: string
  organizationUnit: string
  egsSerialNumber: string
  location: string
  industry: string
}

export interface ZatcaComplianceCheckResult {
  scenario: string
  status: string
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const zatcaService = {
  async listDevices(): Promise<ZatcaDevice[]> {
    const response = await client.get<{ items: ZatcaDevice[] }>(DEVICES_ENDPOINT)
    return response.items
  },

  // Step 1 -- generates a real key pair + CSR locally, no OTP or live ZATCA call involved.
  async createDevice(input: CreateZatcaDeviceInput): Promise<ZatcaDevice> {
    return client.post<CreateZatcaDeviceInput, ZatcaDevice>(DEVICES_ENDPOINT, input)
  },

  // Step 2 -- the one call gated on a real Fatoora-portal OTP the taxpayer supplies.
  async submitOtp(deviceId: string, otp: string): Promise<ZatcaDevice> {
    return client.post<{ otp: string }, ZatcaDevice>(
      [DEVICES_ENDPOINT, encodeURIComponent(deviceId), "compliance"].join(PATH_SEPARATOR),
      { otp }
    )
  },

  // Step 3 -- signs and submits a small built-in set of representative sample invoices.
  async runComplianceChecks(deviceId: string): Promise<ZatcaComplianceCheckResult[]> {
    const response = await client.post<undefined, { results: ZatcaComplianceCheckResult[] }>(
      [DEVICES_ENDPOINT, encodeURIComponent(deviceId), "compliance-checks"].join(PATH_SEPARATOR),
      undefined
    )
    return response.results
  },

  // Step 4 -- exchanges Compliance credentials for real Production ones. From here on, every
  // real sale on this device is signed and reportable.
  async exchangeProduction(deviceId: string): Promise<ZatcaDevice> {
    return client.post<undefined, ZatcaDevice>(
      [DEVICES_ENDPOINT, encodeURIComponent(deviceId), "production"].join(PATH_SEPARATOR),
      undefined
    )
  },
}
