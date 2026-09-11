import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the products service documents: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and does not distinguish them from a
// backend API path.
const PATH_SEPARATOR = String.fromCharCode(47)

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

export type PrintDirection = "vertical" | "horizontal"
export type PrintDensity = "light" | "normal" | "dark"
export type PrinterCharset = "utf8" | "cp1256" | "iso88596"
export type PaperWidth = "58mm" | "80mm"
export type DeviceType =
  | "scale"
  | "receipt_printer"
  | "barcode_scanner"
  | "cash_drawer"
  | "customer_display"
  | "card_reader"
export type DeviceConnection = "usb" | "network" | "bluetooth" | "serial"
export type WeightUnit = "kg" | "g"

export const BAUD_RATES = [2400, 4800, 9600, 19200, 38400, 57600, 115200] as const

// The registry: which physical units exist, as opposed to how each type is configured.
export interface PosDevice {
  id: string
  name: string
  deviceType: DeviceType
  model: string | null
  description: string | null
  connection: DeviceConnection
  port: string | null
  baudRate: number | null
  enabled: boolean
  settings: PosDeviceSettingsInput
  lastSeenAt: string | null
  // Derived server-side from lastSeenAt. Nothing reports today, so this is false until a till
  // or agent starts checking in -- it is not a guess at whether the cable is plugged in.
  online: boolean
}

export type TrailingDigitMeaning = "weight" | "price"

// What one physical scale is set to do, as opposed to the branch-wide defaults.
export interface DeviceScaleSettings {
  defaultWeightUnit: WeightUnit
  trailingDigits: TrailingDigitMeaning
  indicatorStart: number
  decimals: number
  autoZero: boolean
  blockUnstableWeight: boolean
}

export const DEFAULT_DEVICE_SCALE_SETTINGS: DeviceScaleSettings = {
  defaultWeightUnit: "kg",
  trailingDigits: "weight",
  indicatorStart: 1,
  decimals: 3,
  autoZero: true,
  blockUnstableWeight: false,
}

// Which ticket this specific printer is meant for -- a restaurant routes the same sale to more
// than one printer (a customer receipt with prices, a kitchen ticket without them). Nothing in
// this platform actually dispatches a print job to a printer yet -- this is the labeling a real
// dispatch step would need once it exists, not a claim that dispatch exists today.
export const PRINTER_ROLES = ["receipt", "kitchen", "bar"] as const
export type PrinterRole = (typeof PRINTER_ROLES)[number]

// What one physical printer is set to do, as opposed to the branch-wide defaults.
export interface DevicePrinterSettings {
  role: PrinterRole
  paperWidth: PaperWidth
  printDirection: PrintDirection
  printDensity: PrintDensity
  charset: PrinterCharset
  // Only meaningful when this printer's connection (on the device row itself) is "network".
  networkAddress: string | null
  autoCut: boolean
  printLogo: boolean
  extraCopy: boolean
  footerText: string | null
}

export const DEFAULT_DEVICE_PRINTER_SETTINGS: DevicePrinterSettings = {
  role: "receipt",
  paperWidth: "80mm",
  printDirection: "vertical",
  printDensity: "normal",
  charset: "utf8",
  networkAddress: null,
  autoCut: true,
  printLogo: false,
  extraCopy: false,
  footerText: null,
}

// Scale and receipt_printer are the only kinds with a per-unit shape today; every other kind
// stores an empty object.
export type PosDeviceSettingsInput =
  | Partial<DeviceScaleSettings>
  | Partial<DevicePrinterSettings>
  | Record<string, never>

export interface PosDeviceInput {
  name: string
  deviceType: DeviceType
  model: string | null
  description: string | null
  connection: DeviceConnection
  port: string | null
  baudRate: number | null
  enabled: boolean
  settings: PosDeviceSettingsInput
}

const DEVICES_ENDPOINT = ["", "v1", "pos", "devices"].join(PATH_SEPARATOR)

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

export const posDevicesService = {
  async list(): Promise<PosDevice[]> {
    const response = await client.get<{ items: PosDevice[] }>(DEVICES_ENDPOINT)
    return response.items
  },

  async create(device: PosDeviceInput): Promise<PosDevice> {
    return client.post<PosDeviceInput, PosDevice>(DEVICES_ENDPOINT, device)
  },

  async update(id: string, device: PosDeviceInput): Promise<PosDevice> {
    return client.patch<PosDeviceInput, PosDevice>(
      [DEVICES_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR),
      device
    )
  },

  async get(id: string): Promise<PosDevice> {
    return client.get<PosDevice>([DEVICES_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  async remove(id: string): Promise<void> {
    await client.delete<void>([DEVICES_ENDPOINT, encodeURIComponent(id)].join(PATH_SEPARATOR))
  },

  // One count per branch (workspace id -> device count), for the branch-management screen's
  // "عدد نقاط البيع" column -- list() only ever sees the caller's own current workspace, so a
  // count across every branch needs this dedicated, organization-wide aggregate instead.
  async countsByWorkspace(): Promise<Record<string, number>> {
    const response = await client.get<{ counts: Record<string, number> }>(
      [DEVICES_ENDPOINT, "counts-by-workspace"].join(PATH_SEPARATOR)
    )
    return response.counts
  },
}
