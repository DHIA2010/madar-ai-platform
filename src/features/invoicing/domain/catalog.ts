// The fixed choices the invoicing screens offer: units per sector, ZATCA's VAT exemption codes,
// payment means, buyer identification schemes and the standard terms each sector starts with.
import type {
  AdjustmentReason,
  BuyerIdScheme,
  DocumentLine,
  Party,
  PaymentMeans,
  Sector,
  TaxCategory,
} from "../types/invoicing.types"

export const SECTORS: Sector[] = ["general", "services", "contracting"]

// Unit keys (translated under invoicing.units).
export const UNITS: Record<Sector, string[]> = {
  general: ["piece", "box", "carton", "kg", "ton", "liter", "meter", "set", "service"],
  services: ["hour", "day", "month", "visit", "project", "service", "user", "piece"],
  contracting: ["sqm", "cbm", "lm", "lumpsum", "ton", "piece", "day", "month", "trip"],
}

// ZATCA VATEX codes per category (the exemption reason is required for Z, E and O).
export const EXEMPTION_CODES: Record<Exclude<TaxCategory, "S">, string[]> = {
  Z: [
    "VATEX-SA-32",
    "VATEX-SA-33",
    "VATEX-SA-34-1",
    "VATEX-SA-34-2",
    "VATEX-SA-34-3",
    "VATEX-SA-34-4",
    "VATEX-SA-34-5",
    "VATEX-SA-35",
    "VATEX-SA-36",
    "VATEX-SA-EDU",
    "VATEX-SA-HEA",
    "VATEX-SA-MLTRY",
  ],
  E: ["VATEX-SA-29", "VATEX-SA-29-7", "VATEX-SA-30"],
  O: ["VATEX-SA-OOS"],
}

export const PAYMENT_MEANS: PaymentMeans[] = ["30", "42", "10", "48", "1"]

export const BUYER_ID_SCHEMES: BuyerIdScheme[] = [
  "CRN",
  "MOM",
  "MLS",
  "700",
  "SAG",
  "NAT",
  "GCC",
  "IQA",
  "PAS",
  "OTH",
]

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  "price_amendment",
  "refund",
  "cancellation",
  "essential_change",
  "party_change",
]

export const PAYMENT_METHODS = ["bank_transfer", "cash", "card", "cheque", "other"] as const

export const emptyParty = (): Party => ({
  name: "",
  vatNumber: null,
  idScheme: null,
  idValue: null,
  contactName: null,
  email: null,
  phone: null,
  address: {
    street: null,
    buildingNumber: null,
    secondaryNumber: null,
    district: null,
    city: null,
    postalCode: null,
    countryCode: "SA",
  },
})

export const emptyLine = (overrides: Partial<DocumentLine> = {}): DocumentLine => ({
  lineType: "item",
  productId: null,
  quotationLineId: null,
  description: "",
  details: null,
  unit: null,
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxCategory: "S",
  taxRate: 15,
  exemptionCode: null,
  exemptionReason: null,
  progressPrevious: null,
  progressCurrent: null,
  ...overrides,
})

// What ZATCA needs of a business buyer -- the same check the server runs before issuing.
export function missingBuyerFields(party: Party): string[] {
  const missing: string[] = []
  const digits = (value: string | null, length: number) =>
    !!value && new RegExp(`^\\d{${length}}$`).test(value)
  if (!party.name.trim()) missing.push("name")
  if (party.vatNumber) {
    if (!/^3\d{13}3$/.test(party.vatNumber)) missing.push("vatNumber")
  } else if (!party.idScheme || !party.idValue) {
    missing.push("vatNumberOrId")
  }
  if (!party.address.street) missing.push("street")
  if (!party.address.city) missing.push("city")
  if ((party.address.countryCode || "SA") === "SA") {
    if (!digits(party.address.buildingNumber, 4)) missing.push("buildingNumber")
    if (!party.address.district) missing.push("district")
    if (!digits(party.address.postalCode, 5)) missing.push("postalCode")
  }
  return missing
}
