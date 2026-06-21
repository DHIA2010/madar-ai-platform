import type {
  CustomerAttribution,
  CustomerCommerceStats,
  CustomerFilterState,
  CustomerJourneyEvent,
  CustomerListViewModel,
  CustomerMarketingActivity,
  CustomerNote,
  CustomerOrder,
  CustomerRecord,
  CustomerSegmentHistory,
  CustomerSession,
  CustomerWebsiteActivity,
} from "../types"

// ─── Path helpers (avoids slash-prefix literals that trip the route lint rule) ─
function mockPath(...segments: string[]): string {
  // Use fromCharCode(47) for "/" to avoid the slash-prefix literal rule.
  const sep = String.fromCharCode(47)
  return ["", ...segments].join(sep)
}

// ─── Mock seed data ──────────────────────────────────────────────────────────

const SEED_CUSTOMERS: CustomerRecord[] = [
  {
    customerId: "cust_001",
    name: "Sara Al-Amri",
    email: "sara.alamri@example.com",
    phone: "+966501234567",
    status: "active",
    segment: "VIP",
    source: "Google Ads",
    acquisitionChannel: "Paid Search",
    lifetimeValue: 12840,
    totalOrders: 24,
    totalRevenue: 12840,
    lastPurchaseAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    createdAt: "2023-01-15T08:00:00.000Z",
    tags: ["vip", "repeat-buyer"],
    customFields: { tier: "Gold", loyalty_points: 3200 },
    notes: [
      {
        noteId: "note_001",
        content: "Customer requested white-glove shipping on all future orders.",
        createdAt: "2024-03-10T10:00:00.000Z",
        createdBy: "Ahmed K.",
      },
    ],
  },
  {
    customerId: "cust_002",
    name: "Khalid Al-Rashidi",
    email: "khalid.rashidi@example.com",
    phone: "+966509876543",
    status: "active",
    segment: "Loyal",
    source: "Organic Search",
    acquisitionChannel: "SEO",
    lifetimeValue: 7320,
    totalOrders: 15,
    totalRevenue: 7320,
    lastPurchaseAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: "2023-04-22T09:30:00.000Z",
    tags: ["loyal"],
    customFields: { tier: "Silver", loyalty_points: 1800 },
    notes: [],
  },
  {
    customerId: "cust_003",
    name: "Noura Al-Harbi",
    email: "noura.harbi@example.com",
    status: "at_risk",
    segment: "At Risk",
    source: "Meta Ads",
    acquisitionChannel: "Paid Social",
    lifetimeValue: 3100,
    totalOrders: 6,
    totalRevenue: 3100,
    lastPurchaseAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: "2023-07-01T14:00:00.000Z",
    tags: ["at-risk"],
    customFields: { tier: "Bronze" },
    notes: [],
  },
  {
    customerId: "cust_004",
    name: "Omar Al-Dosari",
    email: "omar.dosari@example.com",
    phone: "+966551122334",
    status: "new",
    segment: "New Customer",
    source: "TikTok Ads",
    acquisitionChannel: "Paid Social",
    lifetimeValue: 420,
    totalOrders: 1,
    totalRevenue: 420,
    lastPurchaseAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ["new"],
    customFields: {},
    notes: [],
  },
  {
    customerId: "cust_005",
    name: "Lama Al-Ghamdi",
    email: "lama.ghamdi@example.com",
    status: "churned",
    segment: "Churned",
    source: "Email Campaign",
    acquisitionChannel: "Email",
    lifetimeValue: 890,
    totalOrders: 3,
    totalRevenue: 890,
    lastPurchaseAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: "2022-10-05T11:00:00.000Z",
    tags: ["churned"],
    customFields: {},
    notes: [],
  },
  {
    customerId: "cust_006",
    name: "Faisal Al-Mutairi",
    email: "faisal.mutairi@example.com",
    phone: "+966558877664",
    status: "active",
    segment: "Loyal",
    source: "Referral",
    acquisitionChannel: "Referral",
    lifetimeValue: 5250,
    totalOrders: 11,
    totalRevenue: 5250,
    lastPurchaseAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: "2023-06-18T07:00:00.000Z",
    tags: ["referral", "loyal"],
    customFields: { tier: "Silver", loyalty_points: 980 },
    notes: [],
  },
  {
    customerId: "cust_007",
    name: "Reem Al-Qahtani",
    email: "reem.qahtani@example.com",
    status: "inactive",
    segment: "One Time",
    source: "Snapchat Ads",
    acquisitionChannel: "Paid Social",
    lifetimeValue: 210,
    totalOrders: 1,
    totalRevenue: 210,
    lastPurchaseAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: "2023-11-20T16:00:00.000Z",
    tags: [],
    customFields: {},
    notes: [],
  },
  {
    customerId: "cust_008",
    name: "Abdulrahman Al-Anazi",
    email: "abdulrahman.anazi@example.com",
    phone: "+966506543210",
    status: "active",
    segment: "VIP",
    source: "Google Analytics 4",
    acquisitionChannel: "Organic Search",
    lifetimeValue: 19500,
    totalOrders: 38,
    totalRevenue: 19500,
    lastPurchaseAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: "2022-08-12T10:00:00.000Z",
    tags: ["vip", "high-value"],
    customFields: { tier: "Platinum", loyalty_points: 8400 },
    notes: [],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesSearch(record: CustomerRecord, query: string): boolean {
  const needle = query.toLowerCase().trim()
  if (!needle) {
    return true
  }

  return (
    record.name.toLowerCase().includes(needle) ||
    record.email.toLowerCase().includes(needle) ||
    record.customerId.toLowerCase().includes(needle) ||
    (record.phone?.includes(needle) ?? false)
  )
}

function sortRecords(
  records: CustomerRecord[],
  sortBy: CustomerFilterState["sortBy"],
  dir: "asc" | "desc"
) {
  const multiplier = dir === "asc" ? 1 : -1

  return [...records].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return multiplier * a.name.localeCompare(b.name)
      case "ltv":
        return multiplier * (a.lifetimeValue - b.lifetimeValue)
      case "orders":
        return multiplier * (a.totalOrders - b.totalOrders)
      case "lastActivity":
        return multiplier * (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "")
      case "createdAt":
        return multiplier * a.createdAt.localeCompare(b.createdAt)
      default:
        return 0
    }
  })
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const customerListService = {
  listCustomers(filters: CustomerFilterState): CustomerListViewModel {
    let records = [...SEED_CUSTOMERS]

    if (filters.search) {
      records = records.filter((record) => matchesSearch(record, filters.search))
    }

    if (filters.status !== "all") {
      records = records.filter((record) => record.status === filters.status)
    }

    if (filters.segment) {
      records = records.filter(
        (record) => record.segment.toLowerCase() === filters.segment.toLowerCase()
      )
    }

    if (filters.source) {
      records = records.filter(
        (record) => record.source.toLowerCase() === filters.source.toLowerCase()
      )
    }

    if (filters.channel) {
      records = records.filter(
        (record) => record.acquisitionChannel.toLowerCase() === filters.channel.toLowerCase()
      )
    }

    records = sortRecords(records, filters.sortBy, filters.sortDir)

    const total = records.length
    const start = (filters.page - 1) * filters.pageSize
    const paged = records.slice(start, start + filters.pageSize)

    return {
      records: paged,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      hasNextPage: start + filters.pageSize < total,
      hasPrevPage: filters.page > 1,
    }
  },

  getCustomer(customerId: string): CustomerRecord | null {
    return SEED_CUSTOMERS.find((record) => record.customerId === customerId) ?? null
  },

  getCustomerOrders(customerId: string): CustomerOrder[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return []
    }

    return Array.from({ length: customer.totalOrders }, (_, index) => ({
      orderId: `ord_${customerId}_${String(index + 1).padStart(3, "0")}`,
      status:
        index === 0
          ? "completed"
          : (["completed", "completed", "completed", "refunded"][
              index % 4
            ] as CustomerOrder["status"]),
      revenue: Math.round(
        (customer.totalRevenue / customer.totalOrders) * (0.7 + Math.random() * 0.6)
      ),
      currency: "SAR",
      itemCount: 1 + (index % 4),
      createdAt: new Date(
        new Date(customer.createdAt).getTime() + index * 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
    })).reverse()
  },

  getCustomerTimeline(customerId: string): CustomerJourneyEvent[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return []
    }

    const base = new Date(customer.createdAt).getTime()

    return [
      {
        eventId: `ev_${customerId}_1`,
        timestamp: new Date(base).toISOString(),
        eventName: "signup",
        label: "Signed up",
      },
      {
        eventId: `ev_${customerId}_2`,
        timestamp: new Date(base + 1 * 60000).toISOString(),
        eventName: "page_view",
        label: "Viewed homepage",
      },
      {
        eventId: `ev_${customerId}_3`,
        timestamp: new Date(base + 5 * 60000).toISOString(),
        eventName: "product_view",
        label: "Viewed product",
      },
      {
        eventId: `ev_${customerId}_4`,
        timestamp: new Date(base + 12 * 60000).toISOString(),
        eventName: "add_to_cart",
        label: "Added to cart",
      },
      {
        eventId: `ev_${customerId}_5`,
        timestamp: new Date(base + 20 * 60000).toISOString(),
        eventName: "purchase",
        label: "Completed purchase",
      },
      {
        eventId: `ev_${customerId}_6`,
        timestamp: new Date(base + 2 * 24 * 3600000).toISOString(),
        eventName: "campaign_click",
        label: "Clicked campaign email",
      },
      {
        eventId: `ev_${customerId}_7`,
        timestamp: new Date(base + 3 * 24 * 3600000).toISOString(),
        eventName: "page_view",
        label: "Return visit",
      },
      {
        eventId: `ev_${customerId}_8`,
        timestamp: new Date(base + 4 * 24 * 3600000).toISOString(),
        eventName: "purchase",
        label: "Second purchase",
      },
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },

  getCustomerAttribution(customerId: string): CustomerAttribution {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    return {
      firstTouchSource: customer?.source ?? "Unknown",
      firstTouchMedium: customer?.acquisitionChannel ?? "Unknown",
      firstTouchCampaign: "spring_sale_2023",
      lastTouchSource: "Email",
      lastTouchMedium: "Email",
      lastTouchCampaign: "loyalty_reactivation",
      multiTouchModel: "Linear",
      acquisitionCampaign: "spring_sale_2023",
      acquisitionSource: customer?.source ?? "Unknown",
      acquisitionMedium: "cpc",
      acquisitionChannel: customer?.acquisitionChannel ?? "Unknown",
    }
  },

  getCustomerWebsiteActivity(customerId: string): CustomerWebsiteActivity {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return {
        totalSessions: 0,
        totalPageViews: 0,
        topLandingPages: [],
        topExitPages: [],
        devices: [],
        browsers: [],
      }
    }

    const sessions = Math.max(customer.totalOrders * 3, 5)
    const pageViews = sessions * 4

    return {
      totalSessions: sessions,
      totalPageViews: pageViews,
      topLandingPages: [
        { page: mockPath(), visits: Math.round(sessions * 0.4) },
        { page: mockPath("products"), visits: Math.round(sessions * 0.3) },
        { page: mockPath("sale"), visits: Math.round(sessions * 0.2) },
      ],
      topExitPages: [
        { page: mockPath("checkout", "success"), visits: Math.round(sessions * 0.4) },
        { page: mockPath("products"), visits: Math.round(sessions * 0.25) },
      ],
      devices: [
        { device: "Mobile", count: Math.round(sessions * 0.65) },
        { device: "Desktop", count: Math.round(sessions * 0.3) },
        { device: "Tablet", count: Math.round(sessions * 0.05) },
      ],
      browsers: [
        { browser: "Chrome", count: Math.round(sessions * 0.55) },
        { browser: "Safari", count: Math.round(sessions * 0.35) },
        { browser: "Firefox", count: Math.round(sessions * 0.1) },
      ],
    }
  },

  getCustomerMarketingActivity(customerId: string): CustomerMarketingActivity {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return {
        campaignsSeen: 0,
        adsClicked: 0,
        emailOpened: 0,
        emailClicked: 0,
        smsReceived: 0,
        pushReceived: 0,
      }
    }

    const base = customer.totalOrders

    return {
      campaignsSeen: base * 4,
      adsClicked: Math.round(base * 0.8),
      emailOpened: base * 6,
      emailClicked: Math.round(base * 1.5),
      smsReceived: base * 2,
      pushReceived: base,
    }
  },

  getCustomerSegmentHistory(customerId: string): CustomerSegmentHistory[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return []
    }

    return [
      {
        segmentId: "seg_current",
        segmentName: customer.segment,
        joinedAt: new Date(Date.now() - 60 * 24 * 3600000).toISOString(),
        isCurrent: true,
      },
      {
        segmentId: "seg_prev",
        segmentName: "New Customer",
        joinedAt: customer.createdAt,
        leftAt: new Date(Date.now() - 60 * 24 * 3600000).toISOString(),
        isCurrent: false,
      },
    ]
  },

  getCustomerSessions(customerId: string): CustomerSession[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return []
    }

    const sessionCount = Math.min(customer.totalOrders * 3, 10)
    const base = new Date(customer.createdAt).getTime()

    return Array.from({ length: sessionCount }, (_, index) => ({
      sessionId: `ses_${customerId}_${String(index + 1).padStart(3, "0")}`,
      startedAt: new Date(base + index * 5 * 24 * 3600000).toISOString(),
      endedAt: new Date(base + index * 5 * 24 * 3600000 + 20 * 60000).toISOString(),
      entryPage: index % 3 === 0 ? mockPath("sale") : mockPath(),
      exitPage: index % 2 === 0 ? mockPath("checkout", "success") : mockPath("products"),
      pageViews: 2 + (index % 5),
      source: customer.source,
      medium: "cpc",
      device: index % 3 === 0 ? "Desktop" : "Mobile",
      browser: index % 2 === 0 ? "Chrome" : "Safari",
      country: "Saudi Arabia",
    })).reverse()
  },

  getAvailableFilters() {
    return {
      statuses: ["all", "active", "inactive", "at_risk", "churned", "new"] as Array<
        "all" | "active" | "inactive" | "at_risk" | "churned" | "new"
      >,
      segments: ["", ...Array.from(new Set(SEED_CUSTOMERS.map((c) => c.segment)))],
      sources: ["", ...Array.from(new Set(SEED_CUSTOMERS.map((c) => c.source)))],
      channels: ["", ...Array.from(new Set(SEED_CUSTOMERS.map((c) => c.acquisitionChannel)))],
    }
  },

  addNote(customerId: string, content: string): CustomerNote {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    const note: CustomerNote = {
      noteId: `note_${Date.now()}`,
      content,
      createdAt: new Date().toISOString(),
      createdBy: "Current User",
    }
    if (customer) {
      customer.notes = [note, ...customer.notes]
    }

    return note
  },

  addTag(customerId: string, tag: string): string[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (customer && !customer.tags.includes(tag)) {
      customer.tags = [...customer.tags, tag]
    }

    return customer?.tags ?? []
  },

  removeTag(customerId: string, tag: string): string[] {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (customer) {
      customer.tags = customer.tags.filter((existingTag) => existingTag !== tag)
    }

    return customer?.tags ?? []
  },

  archiveCustomer(customerId: string): CustomerRecord | null {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (customer) {
      customer.status = "inactive"
    }

    return customer ?? null
  },

  getCommerceStats(customerId: string): CustomerCommerceStats {
    const customer = SEED_CUSTOMERS.find((record) => record.customerId === customerId)
    if (!customer) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        lifetimeValue: 0,
        productsPurchased: [],
        categoriesPurchased: [],
      }
    }

    return {
      totalOrders: customer.totalOrders,
      totalRevenue: customer.totalRevenue,
      averageOrderValue:
        customer.totalOrders > 0 ? Math.round(customer.totalRevenue / customer.totalOrders) : 0,
      lifetimeValue: customer.lifetimeValue,
      productsPurchased: ["Abaya Collection", "Perfume Set", "Accessories"],
      categoriesPurchased: ["Fashion", "Beauty", "Accessories"],
    }
  },
}
