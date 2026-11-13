// Mirrors the backend's invoicing/ views (quotations-service.ts, invoices-service.ts).

export type Sector = "general" | "services" | "contracting"
export type LineType = "item" | "section" | "note"
export type TaxCategory = "S" | "Z" | "E" | "O"
export type DiscountType = "amount" | "percent"
export type BuyerIdScheme =
  | "CRN"
  | "MOM"
  | "MLS"
  | "700"
  | "SAG"
  | "NAT"
  | "GCC"
  | "IQA"
  | "PAS"
  | "TIN"
  | "OTH"

export interface Address {
  street: string | null
  buildingNumber: string | null
  secondaryNumber: string | null
  district: string | null
  city: string | null
  postalCode: string | null
  countryCode: string
}

export interface Party {
  name: string
  vatNumber: string | null
  idScheme: BuyerIdScheme | null
  idValue: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  address: Address
}

export interface Seller {
  name: string
  vatNumber: string | null
  commercialRegistration: string | null
  phone: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  address: Address
}

export interface DocumentLine {
  id?: string
  lineType: LineType
  productId: string | null
  quotationLineId: string | null
  description: string
  details: string | null
  unit: string | null
  quantity: number
  unitPrice: number
  discountPercent: number
  taxCategory: TaxCategory
  taxRate: number
  exemptionCode: string | null
  exemptionReason: string | null
  netAmount?: number
  taxAmount?: number
  progressPrevious: number | null
  progressCurrent: number | null
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "superseded"
export type QuotationDisplayStatus = QuotationStatus | "expired"

export interface Quotation {
  id: string
  number: string
  revision: number
  revisionOf: string | null
  status: QuotationStatus
  displayStatus: QuotationDisplayStatus
  sector: Sector
  customerId: string | null
  customer: Party
  title: string | null
  reference: string | null
  issueDate: string
  validUntil: string | null
  currency: string
  discountType: DiscountType
  discountValue: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  advancePercent: number
  retentionPercent: number
  paymentTerms: string | null
  terms: string | null
  notes: string | null
  publicToken: string
  sentAt: string | null
  respondedAt: string | null
  respondedBy: string | null
  declineReason: string | null
  createdAt: string
  updatedAt: string
  billedAmount: number
  billedPercent: number
  billingStatus: "none" | "partial" | "full"
  advanceBilledAmount: number
  invoiceCount: number
}

export interface QuotationLine extends DocumentLine {
  id: string
  netAmount: number
  taxAmount: number
  billedQuantity: number
  billedPercent: number
}

export interface QuotationDetail extends Quotation {
  lines: QuotationLine[]
  invoices: Array<{
    id: string
    number: string | null
    invoiceKind: InvoiceKind
    status: InvoiceStatus
    claimNumber: number | null
    issueDate: string
    totalAmount: number
    zatcaStatus: ZatcaState
  }>
  revisions: Array<{ id: string; revision: number; status: QuotationStatus; createdAt: string }>
  seller: Seller
  canRespond?: boolean
}

export interface QuotationSummary {
  openCount: number
  openAmount: number
  acceptedAmount: number
  acceptanceRate: number
  expiringSoon: number
  draftCount: number
}

export type DocumentType = "invoice" | "credit_note" | "debit_note"
export type TaxType = "standard" | "simplified"
export type InvoiceKind = "regular" | "advance" | "progress"
export type InvoiceStatus = "draft" | "pending_clearance" | "issued" | "void"
export type ZatcaState = "pending" | "cleared" | "reported" | "rejected" | null
export type PaymentStatus = "unpaid" | "partial" | "paid" | "not_applicable"
export type PaymentMeans = "10" | "30" | "42" | "48" | "1"

export interface SalesInvoice {
  id: string
  number: string | null
  documentType: DocumentType
  taxType: TaxType
  invoiceKind: InvoiceKind
  status: InvoiceStatus
  sector: Sector
  quotationId: string | null
  quotationNumber: string | null
  originalInvoiceId: string | null
  originalInvoiceNumber: string | null
  adjustmentReasonCode: string | null
  adjustmentReason: string | null
  claimNumber: number | null
  customerId: string | null
  customer: Party
  seller: Seller
  title: string | null
  reference: string | null
  issueDate: string
  supplyDate: string | null
  supplyEndDate: string | null
  dueDate: string | null
  paymentTerms: string | null
  paymentMeans: PaymentMeans
  currency: string
  discountType: DiscountType
  discountValue: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  totalAmount: number
  prepaidAmount: number
  retentionPercent: number
  retentionAmount: number
  amountDue: number
  paidAmount: number
  creditedAmount: number
  debitedAmount: number
  balance: number
  paymentStatus: PaymentStatus
  overdue: boolean
  terms: string | null
  notes: string | null
  publicToken: string
  issuedAt: string | null
  zatca: {
    status: ZatcaState
    signed: boolean
    uuid: string | null
    icv: number | null
    invoiceHash: string | null
    qrCode: string | null
    submittedAt: string | null
    warnings: string[]
    lastError: string | null
    lastErrorAr: string | null
    attempts: number
  }
  createdAt: string
  updatedAt: string
}

export interface InvoicePayment {
  id: string
  amount: number
  paidOn: string
  method: string
  reference: string | null
  notes: string | null
  createdAt: string
}

export interface SalesInvoiceDetail extends SalesInvoice {
  lines: Array<DocumentLine & { id: string; netAmount: number; taxAmount: number }>
  payments: InvoicePayment[]
  prepayments: Array<{
    id: string
    advanceInvoiceId: string
    advanceInvoiceNumber: string | null
    netAmount: number
    taxAmount: number
    taxRate: number
  }>
  adjustments: Array<{
    id: string
    number: string | null
    documentType: DocumentType
    status: InvoiceStatus
    issueDate: string
    totalAmount: number
    zatcaStatus: ZatcaState
  }>
  advanceRemaining: number | null
}

export interface InvoiceSummary {
  outstanding: number
  overdue: number
  overdueCount: number
  paidThisMonth: number
  draftCount: number
  issuedThisMonth: number
  zatcaAttention: number
}

export interface AdvanceOption {
  id: string
  number: string
  issueDate: string
  quotationId: string | null
  netAmount: number
  taxRate: number
  remainingNet: number
}

export interface ZatcaReadiness {
  hasDevice: boolean
  supportsStandard: boolean
  supportsSimplified: boolean
  environment: string | null
  sellerMissing: string[]
  seller: Seller
}

// What the editors send.
export interface DocumentInputBase {
  sector: Sector
  customerId: string | null
  customer: Party
  title: string | null
  reference: string | null
  issueDate: string
  discountType: DiscountType
  discountValue: number
  retentionPercent: number
  paymentTerms: string | null
  terms: string | null
  notes: string | null
  lines: DocumentLine[]
}

export interface QuotationInput extends DocumentInputBase {
  validUntil: string | null
  advancePercent: number
}

export interface InvoiceInput extends DocumentInputBase {
  taxType: TaxType
  invoiceKind: InvoiceKind
  quotationId: string | null
  supplyDate: string | null
  supplyEndDate: string | null
  dueDate: string | null
  paymentMeans: PaymentMeans
  claimNumber: number | null
  prepayments: Array<{ advanceInvoiceId: string; netAmount: number }>
}

export type AdjustmentReason =
  | "cancellation"
  | "essential_change"
  | "price_amendment"
  | "refund"
  | "party_change"

export interface NoteInput {
  documentType: "credit_note" | "debit_note"
  reasonCode: AdjustmentReason
  reason: string | null
  notes: string | null
  lines: DocumentLine[]
}

export interface PaymentInput {
  amount: number
  paidOn: string
  method: "cash" | "bank_transfer" | "card" | "cheque" | "other"
  reference: string | null
  notes: string | null
}
