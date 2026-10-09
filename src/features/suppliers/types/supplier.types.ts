export type SupplierStatus = "active" | "inactive"
export type SupplierKind = "local" | "international"
export type BankAccountType = "savings" | "current" | "other"
export type PaymentTerms = "prepaid" | "cod" | "net15" | "net30" | "net45" | "net60"
// Mirrors settings/taxes's TaxRateType wording (ضريبة مبيعات/معفاة/نسبة صفرية) but is the
// supplier's own VAT registration status, not a tax-rate catalog entry -- a distinct concept
// (used for how invoices to/from this supplier are treated), so not reused directly.
export type SupplierVatType = "standard" | "zero_rated" | "exempt" | "not_registered"

export interface SupplierBankDetails {
  bankName: string
  accountName: string
  accountType: BankAccountType
  accountNumber: string
  swiftIban: string
  branchCode: string
  bankCity: string
}

export interface SupplierCompanyDetails {
  companyImageUrl: string | null
  companyName: string
  companyEmail: string
  companyPhone: string
  website: string
  address: string
  taxNumber: string
  vatType: SupplierVatType | null
  industryType: string
}

export interface Supplier {
  id: string
  // "#SUP-0001" -- a real, backend-issued sequential code (see
  // src/identity-platform/procurement/code-counter.ts), not derived client-side.
  code: string
  imageUrl: string | null
  name: string
  email: string
  phone: string
  kind: SupplierKind
  country: string
  city: string
  paymentTerms: PaymentTerms | null
  address: string
  status: SupplierStatus
  bankDetails: SupplierBankDetails
  companyDetails: SupplierCompanyDetails
  createdAt: string
}

export const EMPTY_BANK_DETAILS: SupplierBankDetails = {
  bankName: "",
  accountName: "",
  accountType: "savings",
  accountNumber: "",
  swiftIban: "",
  branchCode: "",
  bankCity: "",
}

export const EMPTY_COMPANY_DETAILS: SupplierCompanyDetails = {
  companyImageUrl: null,
  companyName: "",
  companyEmail: "",
  companyPhone: "",
  website: "",
  address: "",
  taxNumber: "",
  vatType: null,
  industryType: "",
}

// What the form collects -- everything about a Supplier except the fields the store itself owns
// (id/code/status/createdAt), since those aren't user-editable inputs.
export interface SupplierFormValues {
  imageUrl: string | null
  name: string
  email: string
  phone: string
  kind: SupplierKind
  country: string
  city: string
  paymentTerms: PaymentTerms | null
  address: string
  bankDetails: SupplierBankDetails
  companyDetails: SupplierCompanyDetails
}

export const EMPTY_SUPPLIER_FORM_VALUES: SupplierFormValues = {
  imageUrl: null,
  name: "",
  email: "",
  phone: "",
  kind: "local",
  country: "",
  city: "",
  paymentTerms: null,
  address: "",
  bankDetails: EMPTY_BANK_DETAILS,
  companyDetails: EMPTY_COMPANY_DETAILS,
}

// Manually-recorded money movement against a supplier's account (سند قبض / سند صرف) -- the other
// two event types on a supplier statement (purchase/return) are never created here, they're real
// records pulled live from the purchases module by supplierId.
export type SupplierVoucherType = "receipt" | "payment"
export type SupplierVoucherPaymentMethod = "cash" | "card" | "transfer"

export interface SupplierVoucher {
  id: string
  // "RV-0001" (سند قبض) / "PV-0001" (سند صرف), sequential per type -- a real, backend-issued code.
  reference: string
  supplierId: string
  // Resolved server-side (joined from suppliers/purchases) -- the create payload never sends
  // these, the backend returns them on every read.
  supplierName: string
  supplierImageUrl: string | null
  // Optional link to the specific purchase invoice this سند is settling/refunding -- picked from
  // that supplier's own invoices in the dialog. null when the voucher isn't tied to one (e.g. a
  // general account top-up).
  purchaseId: string | null
  purchaseCode: string | null
  type: SupplierVoucherType
  amount: number
  // Snapshotted server-side from the organization's currency at creation time, never resubmitted
  // or re-derived -- so a later change to the org's default currency doesn't retroactively
  // reinterpret what an already-recorded voucher's amount meant.
  currency: string
  taxInclusive: boolean
  taxAmount: number
  paymentMethod: SupplierVoucherPaymentMethod
  notes: string
  // The voucher's own recorded date -- defaults to today in the UI but stays editable, e.g. to
  // backdate a payment made earlier and only entered into the system now.
  transactionDate: string
  createdAt: string
}

export interface CreateSupplierVoucherInput {
  supplierId: string
  purchaseId: string | null
  type: SupplierVoucherType
  amount: number
  taxInclusive: boolean
  taxAmount: number
  paymentMethod: SupplierVoucherPaymentMethod
  notes: string
  transactionDate: string
}
