import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

// Same workaround the products service documents: the repo's lint rule forbids slash-prefixed
// string literals to stop page routes being hardcoded, and does not distinguish them from a
// backend API path.
const PATH_SEPARATOR = String.fromCharCode(47)
const DEVICE_SETTINGS_ENDPOINT = ["", "v1", "pos", "device-settings"].join(PATH_SEPARATOR)

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

export type PrinterConnection = "serial" | "usb" | "network" | "bluetooth"
export type PrintDirection = "vertical" | "horizontal"
export type PrintDensity = "light" | "normal" | "dark"
export type PrinterCharset = "utf8" | "cp1256" | "iso88596"
export type ScannerConnection = "usb" | "bluetooth" | "serial" | "hid"
export type ScannerInputMode = "keyboard_wedge" | "hid_device" | "serial_com" | "virtual_com"
export type ScannerCharset = "utf8" | "cp1256" | "ascii" | "iso88591"
export type ScannerLineEnding = "cr" | "tab" | "none" | "crlf"
export type DrawerConnection = "serial" | "usb" | "printer"
export type DrawerTrigger = "on_sale" | "manual"
export type DrawerOpenMethod = "printer_signal" | "direct_com" | "gpio"
export type PaperWidth = "58mm" | "80mm"
export type DisplayBrightness = "low" | "medium" | "high" | "auto"
export type DisplayTimeout = "10s" | "30s" | "1m" | "2m" | "5m" | "never"
export type DisplayLanguage = "ar" | "en" | "bilingual"
export type DisplayTextDirection = "normal" | "reversed" | "vertical"
export type CardReaderConnectionMethod = "com" | "usb" | "api"
export type CardReaderAuthType = "bearer" | "api_key" | "oauth2" | "basic"
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

export interface PosDeviceSettings {
  scale: {
    enabled: boolean
    name: string | null
    connection: DeviceConnection
    port: string | null
    baudRate: number
    defaultWeightUnit: WeightUnit
    trailingDigits: TrailingDigitMeaning
    indicatorStart: number
    decimals: number
    blockUnstableWeight: boolean
    autoZero: boolean
  }
  receiptPrinter: {
    enabled: boolean
    name: string | null
    model: string | null
    connection: PrinterConnection
    port: string | null
    baudRate: number
    networkAddress: string | null
    paperWidth: PaperWidth
    printDirection: PrintDirection
    printDensity: PrintDensity
    charset: PrinterCharset
    copies: number
    autoCut: boolean
    printLogo: boolean
    extraCopy: boolean
    footerText: string | null
  }
  barcodeScanner: {
    enabled: boolean
    name: string | null
    connection: ScannerConnection
    inputMode: ScannerInputMode
    charset: ScannerCharset
    lineEnding: ScannerLineEnding
    prefix: string | null
    suffix: string | null
    inputDelayMs: number
    allowRepeatScans: boolean
    beepOnScan: boolean
    uppercaseOutput: boolean
    hideControlChars: boolean
  }
  cashDrawer: {
    enabled: boolean
    name: string | null
    connection: DrawerConnection
    port: string | null
    openTimeMs: number
    openMethod: DrawerOpenMethod
    openTrigger: DrawerTrigger
    openOnCancel: boolean
  }
  customerDisplay: {
    enabled: boolean
    name: string | null
    connection: DeviceConnection
    port: string | null
    brightness: DisplayBrightness
    screenTimeout: DisplayTimeout
    language: DisplayLanguage
    textDirection: DisplayTextDirection
    welcomeMessage: string | null
    showStoreLogo: boolean
    showProductName: boolean
    showPrice: boolean
    showQuantity: boolean
    showTotal: boolean
    showPromoMessages: boolean
  }
  cardReader: {
    enabled: boolean
    name: string | null
    provider: string | null
    terminalId: string | null
    connectionMethod: CardReaderConnectionMethod
    port: string | null
    apiUrl: string | null
    authType: CardReaderAuthType
    apiKey: string | null
    requestTimeoutSeconds: number
    sendDigitalReceipt: boolean
    autoCompleteAfterSuccess: boolean
    sandboxMode: boolean
  }
}

export interface PosDeviceSettingsView {
  organizationId: string
  workspaceId: string | null
  settings: PosDeviceSettings
  updatedBy: string | null
  updatedAt: string | null
  configured: boolean
}

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
  settings: Partial<DeviceScaleSettings>
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

export interface PosDeviceInput {
  name: string
  deviceType: DeviceType
  model: string | null
  description: string | null
  connection: DeviceConnection
  port: string | null
  baudRate: number | null
  enabled: boolean
  settings: Partial<DeviceScaleSettings>
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

export const posDeviceSettingsService = {
  async get(): Promise<PosDeviceSettingsView> {
    return client.get<PosDeviceSettingsView>(DEVICE_SETTINGS_ENDPOINT)
  },

  // PATCH carrying the whole configuration: the screen always holds every field, and the API's
  // CORS allow-list does not include PUT.
  async save(settings: PosDeviceSettings): Promise<PosDeviceSettingsView> {
    return client.patch<PosDeviceSettings, PosDeviceSettingsView>(
      DEVICE_SETTINGS_ENDPOINT,
      settings
    )
  },
}
