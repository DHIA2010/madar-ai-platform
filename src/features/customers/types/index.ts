// Engagement recency, computed server-side from real order dates -- not a field any commerce
// platform syncs directly.
export type CustomerStatus = "new" | "active" | "at_risk" | "churned" | "inactive"

// Value tier, computed server-side from real lifetime value/order count.
export type CustomerSegment = "VIP" | "Loyal" | "One Time" | "New"

// "Madar" is a customer authored natively in this platform rather than synced from a storefront
// -- every consumer of CustomerRecord has to expect it, the same way ProductPlatform includes
// "Madar" for native products.
export type CustomerPlatform = "Salla" | "Shopify" | "Zid" | "Madar"

export interface CustomerRecord {
  id: string
  name: string
  email: string
  phone: string | null
  platform: CustomerPlatform
  createdAt: string
  totalOrders: number
  totalRevenue: number
  lifetimeValue: number
  lastPurchaseAt: string | null
  status: CustomerStatus
  segment: CustomerSegment
  // Real unified account balance -- only ever set for a "Madar" (native) customer, since only
  // they have a real account. Positive means the store owes the customer (prepaid credit);
  // negative means the customer owes the store (deferred debt). Always null for a synced
  // storefront customer.
  accountBalance: number | null
  // Real region/city entered at creation -- same "Madar"-only scope as accountBalance.
  region: string | null
  // B2B identity + Saudi National Address -- same "Madar"-only scope as accountBalance/region:
  // isBusinessCustomer is always false and every other field always null for a synced storefront
  // customer.
  isBusinessCustomer: boolean
  vatNumber: string | null
  commercialRegistration: string | null
  buildingNumber: string | null
  secondaryNumber: string | null
  street: string | null
  city: string | null
  district: string | null
  postalCode: string | null
  countryCode: string | null
}

export type AccountTransactionType = "receipt" | "payment" | "sale" | "return"

export interface AccountTransaction {
  id: string
  reference: string
  type: AccountTransactionType
  // Always a positive magnitude -- direction is derived from type.
  amount: number
  // Only ever set for a "receipt" or "payment" -- a "sale"/"return" pulls its payment method(s)
  // from the invoice itself, which can be a split across several methods.
  paymentMethodCode: string | null
  taxInclusive: boolean
  taxAmount: number
  notes: string | null
  attachmentUrls: string[]
  // Only ever set for a "sale" or "return".
  invoiceId: string | null
  invoiceNumber: string | null
  balanceAfter: number
  createdAt: string
}

export interface AccountStatement {
  transactions: AccountTransaction[]
  totalCredits: number
  totalDebits: number
  transactionCount: number
}

export interface AccountTransactionFilter {
  from?: string
  to?: string
  type?: AccountTransactionType
}

export interface CreateAccountTransactionInput {
  amount: number
  taxInclusive: boolean
  taxAmount: number
  paymentMethodCode: string
  notes: string | null
  attachments: Array<{ contentType: string; dataBase64: string }>
  // The voucher's own recorded date -- defaults to today in the UI, but stays editable (e.g. to
  // backdate a receipt collected earlier and only entered now).
  transactionDate?: string
}

export interface BulkImportRow {
  name: string
  phone: string | null
  email: string | null
  region: string | null
}

export interface BulkImportResult {
  created: number
  skipped: Array<{ row: number; reason: string }>
}

export interface CustomerOrder {
  orderId: string
  status: string
  revenue: number
  currency: string
  itemCount: number
  createdAt: string
}

export interface CustomerDetail extends CustomerRecord {
  orders: CustomerOrder[]
  productsPurchased: string[]
  averageOrderValue: number
}
