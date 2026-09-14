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
  // Real running amount owed from deferred ("آجل") POS sales -- only ever set for a "Madar"
  // (native) customer, since only they have a real account to owe against. Always null for a
  // synced storefront customer.
  balanceDue: number | null
  // Real prepaid balance a sale can spend down via the "customer_wallet" payment method -- same
  // "Madar"-only scope as balanceDue.
  walletBalance: number | null
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
