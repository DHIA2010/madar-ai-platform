// Mirrors the frontend's Supplier/Purchase/PurchaseReturn/SupplierVoucher shapes (src/features/
// suppliers, src/features/purchases) field-for-field, so the frontend rewrite from Zustand mock
// data to this real backend needs almost no reshaping -- just a different data source.

export type SupplierKind = "local" | "international"
export type SupplierPaymentTerms = "prepaid" | "cod" | "net15" | "net30" | "net45" | "net60"
export type SupplierStatus = "active" | "inactive"
export type BankAccountType = "savings" | "current" | "other"
export type SupplierVatType = "standard" | "zero_rated" | "exempt" | "not_registered"

export interface SupplierBankDetails {
  bankName: string
  accountName: string
  accountType: BankAccountType
  accountNumber: string
  currency: string
  swiftIban: string
  branchCode: string
  bankCity: string
  isPrimaryAccount: boolean
  isDefaultForPayments: boolean
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

export interface SupplierDto {
  id: string
  organizationId: string
  code: string
  imageUrl: string | null
  name: string
  email: string
  phone: string
  kind: SupplierKind
  country: string
  city: string
  paymentTerms: SupplierPaymentTerms | null
  address: string
  status: SupplierStatus
  bankDetails: SupplierBankDetails
  companyDetails: SupplierCompanyDetails
  createdAt: string
  updatedAt: string
}

export interface SaveSupplierInput {
  imageUrl: string | null
  name: string
  email: string
  phone: string
  kind: SupplierKind
  country: string
  city: string
  paymentTerms: SupplierPaymentTerms | null
  address: string
  bankDetails: SupplierBankDetails
  companyDetails: SupplierCompanyDetails
}

export type PurchaseStatus = "received" | "pending"
export type PurchasePaymentMethod = "cash" | "bank_transfer" | "card" | "cheque"

export interface PurchaseLineItemDto {
  id: string
  productId: string
  productName: string
  sku: string
  netUnitCost: number
  qty: number
  discount: number
  taxPercent: number
}

export interface PurchaseDto {
  id: string
  organizationId: string
  code: string
  supplierId: string
  supplierName: string
  supplierImageUrl: string | null
  warehouseId: string
  date: string
  dueDate: string | null
  deliveryDate: string | null
  status: PurchaseStatus
  items: PurchaseLineItemDto[]
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
  currency: string
  paymentMethod: PurchasePaymentMethod | null
  referenceNumber: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface SavePurchaseLineItemInput {
  productId: string
  netUnitCost: number
  qty: number
  discount: number
  taxPercent: number
}

export interface SavePurchaseInput {
  supplierId: string
  warehouseId: string
  date: string
  dueDate: string | null
  deliveryDate: string | null
  status: PurchaseStatus
  items: SavePurchaseLineItemInput[]
  orderTaxPercent: number
  discountAmount: number
  shippingAmount: number
  otherCosts: number
  currency: string
  paymentMethod: PurchasePaymentMethod | null
  referenceNumber: string
  note: string
}

// Fixed and server-computed at creation, never client-set or changed afterward (see
// ReturnsRepository.create()): 'full' if the return covers every purchase line at its full
// originally-purchased qty, 'partial' otherwise.
export type ReturnStatus = "full" | "partial"

export interface ReturnLineItemDto {
  productId: string
  productName: string
  sku: string
  qty: number
  unitCost: number
}

export interface PurchaseReturnDto {
  id: string
  organizationId: string
  code: string
  purchaseId: string
  purchaseCode: string
  supplierId: string
  supplierName: string
  supplierImageUrl: string | null
  warehouseId: string
  items: ReturnLineItemDto[]
  returnQty: number
  returnAmount: number
  status: ReturnStatus
  returnDate: string
  notes: string
  createdAt: string
}

// Unlike a purchase line, qty is all a return item gives -- unitCost is always resolved
// server-side from the original purchase_line_items row for the same product (see
// returns-repository.ts), never trusted from the client, so a return's valuation can never drift
// from what was actually paid for that unit.
export interface CreateReturnLineItemInput {
  productId: string
  qty: number
}

export interface CreatePurchaseReturnInput {
  purchaseId: string
  warehouseId: string
  items: CreateReturnLineItemInput[]
  returnDate: string
  notes: string
}

export type SupplierVoucherType = "receipt" | "payment"
export type SupplierVoucherPaymentMethod = "cash" | "card" | "transfer"

export interface SupplierVoucherDto {
  id: string
  organizationId: string
  reference: string
  supplierId: string
  supplierName: string
  supplierImageUrl: string | null
  purchaseId: string | null
  purchaseCode: string | null
  type: SupplierVoucherType
  amount: number
  taxInclusive: boolean
  taxAmount: number
  paymentMethod: SupplierVoucherPaymentMethod
  notes: string
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
