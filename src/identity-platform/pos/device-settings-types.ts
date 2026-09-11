// The point-of-sale hardware a branch sells through. Shared by the API, the settings screen and
// the till, so all three agree on what a "connection" or a paper width can be.

export const PRINTER_CONNECTIONS = ["serial", "usb", "network", "bluetooth"] as const
export type PrinterConnection = (typeof PRINTER_CONNECTIONS)[number]

export const PRINT_DIRECTIONS = ["vertical", "horizontal"] as const
export type PrintDirection = (typeof PRINT_DIRECTIONS)[number]

export const PRINT_DENSITIES = ["light", "normal", "dark"] as const
export type PrintDensity = (typeof PRINT_DENSITIES)[number]

export const PRINTER_CHARSETS = ["utf8", "cp1256", "iso88596"] as const
export type PrinterCharset = (typeof PRINTER_CHARSETS)[number]

export const SCANNER_CONNECTIONS = ["usb", "bluetooth", "serial", "hid"] as const
export type ScannerConnection = (typeof SCANNER_CONNECTIONS)[number]

// Whether the scanner presents itself to the till as a keyboard, a raw HID device, or a serial
// stream -- distinct from the physical connection above, since e.g. a USB scanner can speak any
// of the first three.
export const SCANNER_INPUT_MODES = [
  "keyboard_wedge",
  "hid_device",
  "serial_com",
  "virtual_com",
] as const
export type ScannerInputMode = (typeof SCANNER_INPUT_MODES)[number]

export const SCANNER_CHARSETS = ["utf8", "cp1256", "ascii", "iso88591"] as const
export type ScannerCharset = (typeof SCANNER_CHARSETS)[number]

export const SCANNER_LINE_ENDINGS = ["cr", "tab", "none", "crlf"] as const
export type ScannerLineEnding = (typeof SCANNER_LINE_ENDINGS)[number]

// A drawer is almost always wired through the printer's kick port rather than to the till
// directly, which is why it is a choice rather than an assumption.
export const DRAWER_CONNECTIONS = ["serial", "usb", "printer"] as const
export type DrawerConnection = (typeof DRAWER_CONNECTIONS)[number]

export const DRAWER_TRIGGERS = ["on_sale", "manual"] as const
export type DrawerTrigger = (typeof DRAWER_TRIGGERS)[number]

// The signal protocol the drawer actually opens on -- independent of the physical connection
// above, since e.g. a serial-wired drawer can still be triggered by the printer's own ESC/POS
// kick command rather than a direct COM signal.
export const DRAWER_OPEN_METHODS = ["printer_signal", "direct_com", "gpio"] as const
export type DrawerOpenMethod = (typeof DRAWER_OPEN_METHODS)[number]

// The two roll widths thermal receipt printers actually ship in.
export const PAPER_WIDTHS = ["58mm", "80mm"] as const
export type PaperWidth = (typeof PAPER_WIDTHS)[number]

export const DISPLAY_BRIGHTNESS_LEVELS = ["low", "medium", "high", "auto"] as const
export type DisplayBrightness = (typeof DISPLAY_BRIGHTNESS_LEVELS)[number]

export const DISPLAY_TIMEOUTS = ["10s", "30s", "1m", "2m", "5m", "never"] as const
export type DisplayTimeout = (typeof DISPLAY_TIMEOUTS)[number]

export const DISPLAY_LANGUAGES = ["ar", "en", "bilingual"] as const
export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number]

export const DISPLAY_TEXT_DIRECTIONS = ["normal", "reversed", "vertical"] as const
export type DisplayTextDirection = (typeof DISPLAY_TEXT_DIRECTIONS)[number]

// How the card reader is reached: a locally wired terminal (COM/USB, driven by the till's own
// integration) or a payment provider's HTTP API.
export const CARD_READER_CONNECTION_METHODS = ["com", "usb", "api"] as const
export type CardReaderConnectionMethod = (typeof CARD_READER_CONNECTION_METHODS)[number]

export const CARD_READER_AUTH_TYPES = ["bearer", "api_key", "oauth2", "basic"] as const
export type CardReaderAuthType = (typeof CARD_READER_AUTH_TYPES)[number]

// The device kinds a till talks to. Ordered as the summary tiles read on the settings screen.
export const DEVICE_TYPES = [
  "scale",
  "receipt_printer",
  "barcode_scanner",
  "cash_drawer",
  "customer_display",
  "card_reader",
] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const DEVICE_CONNECTIONS = ["usb", "network", "bluetooth", "serial"] as const
export type DeviceConnection = (typeof DEVICE_CONNECTIONS)[number]

// Serial speeds a retail scale or printer actually offers.
export const BAUD_RATES = [2400, 4800, 9600, 19200, 38400, 57600, 115200] as const
export type BaudRate = (typeof BAUD_RATES)[number]

export const WEIGHT_UNITS = ["kg", "g"] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

// Scales frame their reading differently: on some the trailing digits are the weight, on others
// the till is expected to read them as a price. Getting this wrong silently charges the wrong
// amount, so it is asked rather than assumed.
export const TRAILING_DIGIT_MEANINGS = ["weight", "price"] as const
export type TrailingDigitMeaning = (typeof TRAILING_DIGIT_MEANINGS)[number]

// What one physical scale is configured to do, as opposed to the branch-wide defaults in
// PosDeviceSettings. Connection, port and baud rate live on the device row itself.
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

export interface ScaleSettings {
  enabled: boolean
  name: string | null
  connection: DeviceConnection
  port: string | null
  baudRate: BaudRate
  defaultWeightUnit: WeightUnit
  // Whether the scale's trailing digits are the weight itself or a price-embedded barcode's
  // price -- getting this wrong silently charges the wrong amount, so it is a branch-wide default
  // the same way DeviceScaleSettings already asks per physical unit.
  trailingDigits: TrailingDigitMeaning
  // Where the weight begins in the scale's serial frame, and how many decimals it sends --
  // both are model-specific and have to be read off the device's manual.
  indicatorStart: number
  decimals: number
  // A reading taken while the platter is still moving is wrong, so the till can refuse it.
  blockUnstableWeight: boolean
  autoZero: boolean
}

export interface ReceiptPrinterSettings {
  enabled: boolean
  name: string | null
  model: string | null
  connection: PrinterConnection
  // Only meaningful for a serial/USB printer; kept when switching away so flipping back does not
  // lose a port that was already picked.
  port: string | null
  baudRate: BaudRate
  // Only meaningful for a network printer; kept when switching away so flipping back does not
  // lose an address that was already typed.
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

export interface BarcodeScannerSettings {
  enabled: boolean
  name: string | null
  connection: ScannerConnection
  inputMode: ScannerInputMode
  charset: ScannerCharset
  lineEnding: ScannerLineEnding
  // Most scanners are keyboard-wedge devices that frame the code with fixed characters; the
  // till has to know them to strip them back off.
  prefix: string | null
  suffix: string | null
  inputDelayMs: number
  allowRepeatScans: boolean
  beepOnScan: boolean
  uppercaseOutput: boolean
  hideControlChars: boolean
}

export interface CashDrawerSettings {
  enabled: boolean
  name: string | null
  connection: DrawerConnection
  port: string | null
  openTimeMs: number
  openMethod: DrawerOpenMethod
  openTrigger: DrawerTrigger
  openOnCancel: boolean
}

export interface CustomerDisplaySettings {
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

export interface CardReaderSettings {
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

export interface PosDeviceSettings {
  scale: ScaleSettings
  receiptPrinter: ReceiptPrinterSettings
  barcodeScanner: BarcodeScannerSettings
  cashDrawer: CashDrawerSettings
  customerDisplay: CustomerDisplaySettings
  cardReader: CardReaderSettings
}

// What a branch that has configured nothing yet behaves like: a printer on USB with an 80mm
// roll and a drawer kicked by it, which is the common counter setup. Everything optional is
// off, so nothing is claimed to exist that has not been set up.
export const DEFAULT_POS_DEVICE_SETTINGS: PosDeviceSettings = {
  scale: {
    enabled: false,
    name: null,
    connection: "serial",
    port: null,
    baudRate: 9600,
    defaultWeightUnit: "kg",
    trailingDigits: "weight",
    indicatorStart: 1,
    decimals: 3,
    blockUnstableWeight: true,
    autoZero: true,
  },
  receiptPrinter: {
    enabled: true,
    name: null,
    model: null,
    connection: "usb",
    port: null,
    baudRate: 9600,
    networkAddress: null,
    paperWidth: "80mm",
    printDirection: "vertical",
    printDensity: "normal",
    charset: "utf8",
    copies: 1,
    autoCut: true,
    printLogo: false,
    extraCopy: false,
    footerText: null,
  },
  barcodeScanner: {
    enabled: true,
    name: null,
    connection: "usb",
    inputMode: "keyboard_wedge",
    charset: "utf8",
    lineEnding: "cr",
    prefix: null,
    suffix: null,
    inputDelayMs: 0,
    allowRepeatScans: false,
    beepOnScan: true,
    uppercaseOutput: false,
    hideControlChars: true,
  },
  cashDrawer: {
    enabled: true,
    name: null,
    connection: "printer",
    port: null,
    openTimeMs: 500,
    openMethod: "printer_signal",
    openTrigger: "on_sale",
    openOnCancel: false,
  },
  customerDisplay: {
    enabled: false,
    name: null,
    connection: "usb",
    port: null,
    brightness: "medium",
    screenTimeout: "30s",
    language: "ar",
    textDirection: "normal",
    welcomeMessage: null,
    showStoreLogo: true,
    showProductName: true,
    showPrice: true,
    showQuantity: true,
    showTotal: true,
    showPromoMessages: false,
  },
  cardReader: {
    enabled: false,
    name: null,
    provider: null,
    terminalId: null,
    connectionMethod: "api",
    port: null,
    apiUrl: null,
    authType: "bearer",
    apiKey: null,
    requestTimeoutSeconds: 30,
    sendDigitalReceipt: true,
    autoCompleteAfterSuccess: true,
    sandboxMode: false,
  },
}

export interface PosDeviceSettingsView {
  organizationId: string
  workspaceId: string | null
  settings: PosDeviceSettings
  updatedBy: string | null
  updatedAt: string | null
  // False when nothing has been saved yet and the response is the default shape above, so the
  // screen can say so rather than implying a configuration exists.
  configured: boolean
}
