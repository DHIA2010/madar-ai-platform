import { createHttpDataClient } from "@/infrastructure/data/api/http-data-client"
import { createSessionManager } from "@/infrastructure/identity"

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

export interface PosSettings {
  allowBelowCostSale: boolean
  allowOutOfStockSale: boolean
  confirmSale: boolean
  autoOpenCashDrawer: boolean
  allowManualPriceEdit: boolean
  applyDiscounts: boolean

  defaultPrinterDeviceId: string | null
  paperWidth: "58mm" | "80mm"
  autoPrintInvoice: boolean
  printKitchenCopy: boolean
  copiesCount: number

  showQuickPaymentScreen: boolean
  allowSplitPayment: boolean
  rememberLastPaymentMethod: boolean
  requirePaymentMethodSelection: boolean

  showProductImages: boolean
  useCompactMode: boolean
  showCategoryPanel: boolean
  showGridView: boolean
  showListView: boolean

  enableBarcodeScanner: boolean
  playScanSound: boolean

  updatedAt: string
}

export type PosSettingsUpdateInput = Omit<PosSettings, "updatedAt">

// Mirrors DEFAULT_POS_SETTINGS in identity-platform/pos/pos-settings-service.ts exactly -- used
// here purely as the initial React state before the real GET resolves (and as a fallback if it
// fails), so the cashier screen's behavior never differs from what the backend would return for
// an organization that has never saved a settings row.
export const DEFAULT_POS_SETTINGS: PosSettings = {
  allowBelowCostSale: true,
  allowOutOfStockSale: true,
  confirmSale: false,
  autoOpenCashDrawer: false,
  allowManualPriceEdit: true,
  applyDiscounts: true,
  defaultPrinterDeviceId: null,
  paperWidth: "80mm",
  autoPrintInvoice: true,
  printKitchenCopy: false,
  copiesCount: 1,
  showQuickPaymentScreen: false,
  allowSplitPayment: true,
  rememberLastPaymentMethod: false,
  requirePaymentMethodSelection: true,
  showProductImages: true,
  useCompactMode: false,
  showCategoryPanel: true,
  showGridView: true,
  showListView: true,
  enableBarcodeScanner: true,
  playScanSound: false,
  updatedAt: new Date(0).toISOString(),
}

const sessionManager = createSessionManager()
const client = createHttpDataClient({
  getSession: () => sessionManager.restore(),
  getWorkspaceId: getWorkspaceIdFromStorage,
})

const POS_SETTINGS_ENDPOINT = ["", "v1", "pos", "settings"].join(PATH_SEPARATOR)

export const posSettingsService = {
  async get(): Promise<PosSettings> {
    return client.get<PosSettings>(POS_SETTINGS_ENDPOINT)
  },

  async update(input: PosSettingsUpdateInput): Promise<PosSettings> {
    return client.put<PosSettingsUpdateInput, PosSettings>(POS_SETTINGS_ENDPOINT, input)
  },
}
