export type CustomerStatus = "active" | "inactive" | "at_risk" | "churned" | "new"

export type CustomerSegmentLabel =
  | "VIP"
  | "Loyal"
  | "At Risk"
  | "Churned"
  | "New Customer"
  | "One Time"
  | string

export interface CustomerRecord {
  customerId: string
  name: string
  email: string
  phone?: string
  status: CustomerStatus
  segment: CustomerSegmentLabel
  source: string
  acquisitionChannel: string
  lifetimeValue: number
  totalOrders: number
  totalRevenue: number
  lastPurchaseAt?: string
  lastActivityAt?: string
  createdAt: string
  tags: string[]
  customFields: Record<string, string | number | boolean>
  notes: CustomerNote[]
}

export interface CustomerNote {
  noteId: string
  content: string
  createdAt: string
  createdBy: string
}

export interface CustomerOrder {
  orderId: string
  status: "completed" | "pending" | "refunded" | "cancelled"
  revenue: number
  currency: string
  itemCount: number
  createdAt: string
}

export interface CustomerSession {
  sessionId: string
  startedAt: string
  endedAt?: string
  entryPage: string
  exitPage: string
  pageViews: number
  source: string
  medium: string
  device: string
  browser: string
  country: string
}

export interface CustomerJourneyEvent {
  eventId: string
  timestamp: string
  eventName: string
  label: string
  page?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface CustomerAttribution {
  firstTouchSource: string
  firstTouchMedium: string
  firstTouchCampaign: string
  lastTouchSource: string
  lastTouchMedium: string
  lastTouchCampaign: string
  multiTouchModel: string
  acquisitionCampaign: string
  acquisitionSource: string
  acquisitionMedium: string
  acquisitionChannel: string
}

export interface CustomerWebsiteActivity {
  totalSessions: number
  totalPageViews: number
  topLandingPages: Array<{ page: string; visits: number }>
  topExitPages: Array<{ page: string; visits: number }>
  devices: Array<{ device: string; count: number }>
  browsers: Array<{ browser: string; count: number }>
}

export interface CustomerCommerceStats {
  totalOrders: number
  totalRevenue: number
  averageOrderValue: number
  lifetimeValue: number
  productsPurchased: string[]
  categoriesPurchased: string[]
}

export interface CustomerMarketingActivity {
  campaignsSeen: number
  adsClicked: number
  emailOpened: number
  emailClicked: number
  smsReceived: number
  pushReceived: number
}

export interface CustomerSegmentHistory {
  segmentId: string
  segmentName: string
  joinedAt: string
  leftAt?: string
  isCurrent: boolean
}

export interface CustomerFilterState {
  search: string
  status: CustomerStatus | "all"
  segment: string
  source: string
  channel: string
  sortBy: "name" | "ltv" | "orders" | "lastActivity" | "createdAt"
  sortDir: "asc" | "desc"
  page: number
  pageSize: number
}

export interface CustomerListViewModel {
  records: CustomerRecord[]
  total: number
  page: number
  pageSize: number
  hasNextPage: boolean
  hasPrevPage: boolean
}
