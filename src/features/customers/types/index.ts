// Engagement recency, computed server-side from real order dates -- not a field any commerce
// platform syncs directly.
export type CustomerStatus = "new" | "active" | "at_risk" | "churned" | "inactive"

// Value tier, computed server-side from real lifetime value/order count.
export type CustomerSegment = "VIP" | "Loyal" | "One Time" | "New"

export type CustomerPlatform = "Salla" | "Shopify" | "Zid"

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
