// The point-of-sale hardware a branch sells through -- the shapes behind each named device's own
// pos_devices.settings row. Shared by the API and the till, so both agree on what a "connection"
// or a paper width can be.

export const PRINT_DIRECTIONS = ["vertical", "horizontal"] as const
export type PrintDirection = (typeof PRINT_DIRECTIONS)[number]

export const PRINT_DENSITIES = ["light", "normal", "dark"] as const
export type PrintDensity = (typeof PRINT_DENSITIES)[number]

export const PRINTER_CHARSETS = ["utf8", "cp1256", "iso88596"] as const
export type PrinterCharset = (typeof PRINTER_CHARSETS)[number]

// The two roll widths thermal receipt printers actually ship in.
export const PAPER_WIDTHS = ["58mm", "80mm"] as const
export type PaperWidth = (typeof PAPER_WIDTHS)[number]

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

// What one physical scale is configured to do. Connection, port and baud rate live on the device
// row itself.
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
// than one printer (a customer receipt with prices, a kitchen ticket without them), and the
// printers involved are rarely configured the same way (a kitchen ticket has no reason to carry
// the store logo, for one). Nothing in this platform actually sends a print job to a printer yet
// (see DEFAULT_DEVICE_PRINTER_SETTINGS's own note) -- this is the labeling that a real dispatch
// step would need once it exists, not a claim that dispatch exists today.
export const PRINTER_ROLES = ["receipt", "kitchen", "bar"] as const
export type PrinterRole = (typeof PRINTER_ROLES)[number]

// What one physical printer is configured to do. Connection, port and baud rate live on the
// device row itself.
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
