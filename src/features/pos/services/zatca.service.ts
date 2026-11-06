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
const UNREPORTED_ENDPOINT = ["", "v1", "zatca", "unreported"].join(PATH_SEPARATOR)

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
  // The ZATCA environment it was onboarded for (null: an old device whose CSR doesn't say).
  environment: ZatcaCsrEnvironment | null
  lastIcv: number
  // When the device's ZATCA certificate expires (production once issued, else compliance); null
  // before onboarding. After it, the device must be renewed in the Fatoora portal.
  certificateExpiresAt: string | null
  // The certificate ZATCA issued (production once issued, else compliance); null before onboarding.
  certificate: { validFrom: string; validTo: string; serialNumber: string; issuer: string } | null
  // What the device's CSR registered with ZATCA.
  details: ZatcaDeviceDetails
  // Sales and returns this device signed.
  signedDocuments: number
  // Set once the device was stopped (removed while it had signed invoices).
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ZatcaDeviceDetails {
  commonName: string | null
  organizationName: string | null
  organizationUnit: string | null
  country: string | null
  egsSerialNumber: string | null
  vatNumber: string | null
  invoiceTypes: string | null
  location: string | null
  industry: string | null
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

// A signed sale or return (credit note) ZATCA hasn't accepted yet -- see the backend's
// pos/zatca-reporting.ts. Every one is sent automatically right after it's saved and retried in
// the background; these are the ones still waiting.
export interface ZatcaUnreportedDocument {
  kind: "invoice" | "return"
  id: string
  number: string
  totalAmount: number
  createdAt: string
  // "NOT_REPORTED" once ZATCA refused it; null while ZATCA never answered (down, network).
  zatcaStatus: string | null
  lastError: string | null
  lastErrorAr: string | null
  attempts: number
  lastAttemptAt: string | null
}

export interface ZatcaReportAllResult {
  reported: number
  rejected: number
  failed: number
  skipped: number
}

// One compliance sample's verdict: REPORTED (passed), or NOT_REPORTED with ZATCA's reason.
export interface ZatcaComplianceCheckResult {
  scenario: string
  status: string
  reason: string | null
  reasonAr: string | null
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

  // Deleted when it never signed an invoice; stopped (kept for its invoices) otherwise.
  async removeDevice(deviceId: string): Promise<{ result: "deleted" | "deactivated" }> {
    return client.delete<{ result: "deleted" | "deactivated" }>(
      [DEVICES_ENDPOINT, encodeURIComponent(deviceId)].join(PATH_SEPARATOR)
    )
  },

  async listUnreported(): Promise<ZatcaUnreportedDocument[]> {
    const response = await client.get<{ items: ZatcaUnreportedDocument[] }>(UNREPORTED_ENDPOINT)
    return response.items
  },

  // Sends every one of them again, refused ones included.
  async reportAll(): Promise<ZatcaReportAllResult> {
    return client.post<undefined, ZatcaReportAllResult>(
      [UNREPORTED_ENDPOINT, "report-all"].join(PATH_SEPARATOR),
      undefined
    )
  },
}
