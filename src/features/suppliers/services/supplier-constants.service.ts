import type { PaymentTerms, SupplierVatType } from "../types"

// Static reference lists for the supplier form's selects -- no backend table backs any of these,
// same rationale as purchases/services/warehouses.ts.
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

export const SUPPLIER_CURRENCIES: Array<{ value: string; label: string }> = [
  { value: "SAR", label: "ريال سعودي (SAR)" },
  { value: "USD", label: "دولار أمريكي (USD)" },
  { value: "AED", label: "درهم إماراتي (AED)" },
  { value: "EUR", label: "يورو (EUR)" },
  { value: "EGP", label: "جنيه مصري (EGP)" },
  { value: "GBP", label: "جنيه إسترليني (GBP)" },
  { value: "CNY", label: "يوان صيني (CNY)" },
]

export const PAYMENT_TERMS_OPTIONS: Array<{ value: PaymentTerms; label: string }> = [
  { value: "prepaid", label: "دفع مسبق" },
  { value: "cod", label: "الدفع عند الاستلام" },
  { value: "net15", label: "صافي 15 يومًا" },
  { value: "net30", label: "صافي 30 يومًا" },
  { value: "net45", label: "صافي 45 يومًا" },
  { value: "net60", label: "صافي 60 يومًا" },
]

export const VAT_TYPE_OPTIONS: Array<{ value: SupplierVatType; label: string }> = [
  { value: "standard", label: "ضريبة مبيعات" },
  { value: "zero_rated", label: "نسبة صفرية" },
  { value: "exempt", label: "معفاة" },
  { value: "not_registered", label: "غير مسجل ضريبيًا" },
]
