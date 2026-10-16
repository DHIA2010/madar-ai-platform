import type { PaymentTerms, SupplierVatType } from "../types"

// Static reference list for the supplier form's country select -- no backend table backs this.
// Kept Arabic-only and untranslated on purpose: a supplier's `country` field stores this exact
// string as its value (the select is "creatable" -- see supplier-form.tsx), so translating the
// display label would also change what gets persisted for new suppliers and desync it from
// existing Arabic-language data already saved. This one list is data content, not UI chrome.
export const SUPPLIER_COUNTRIES = [
  "السعودية",
  "الإمارات",
  "قطر",
  "الكويت",
  "البحرين",
  "عُمان",
  "الأردن",
  "مصر",
  "العراق",
  "لبنان",
  "تركيا",
  "الصين",
  "الهند",
  "الولايات المتحدة",
  "ألمانيا",
]

// Display labels for these live in the "suppliers.paymentTerms"/"suppliers.vatType" i18n
// namespaces, resolved via useTranslations at the call site -- these plain modules can't call
// that hook themselves. VAT_TYPE_KEYS maps each value to the suffix the actual SupplierVatType
// union stores, mirroring EXPENSE_PAYMENT_METHOD_KEYS's convention.
export const PAYMENT_TERMS_VALUES: PaymentTerms[] = [
  "prepaid",
  "cod",
  "net15",
  "net30",
  "net45",
  "net60",
]

export const VAT_TYPE_VALUES: SupplierVatType[] = [
  "standard",
  "zero_rated",
  "exempt",
  "not_registered",
]

export const VAT_TYPE_KEYS: Record<SupplierVatType, string> = {
  standard: "standard",
  zero_rated: "zeroRated",
  exempt: "exempt",
  not_registered: "notRegistered",
}
