import { BarChart3, Crown, Star, Zap } from "lucide-react"

import type {
  Coupon,
  MadarAdminCustomer,
  MadarPlan,
  PlanTier,
  PlatformKey,
  SubscriptionStatus,
} from "../types"

// Deterministic PRNG (mulberry32) so the generated dataset below is identical on the server and
// the client render -- Math.random() here would cause a hydration mismatch the first time this
// page loads. Everything downstream (rows, KPIs, chart data) is derived from this ONE seeded
// dataset so every page's numbers agree with each other, matching how a real backend response
// would behave.
function mulberry32(seed: number) {
  let state = seed
  return function random() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260815)

function pick<T>(pool: T[]): T {
  return pool[Math.floor(rand() * pool.length)]
}

export const PLAN_META: Record<PlanTier, Omit<MadarPlan, "customerCount">> = {
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    icon: Crown,
    badgeLabel: "مخصصة",
    priceLabel: "تواصل معنا",
    monthlyPrice: null,
    billingSuffix: "سعر مخصص",
    isActive: true,
    features: [
      { label: "متاجر غير محدودة" },
      { label: "زوار غير محدود" },
      { label: "جميع المميزات" },
      { label: "دعم مخصص" },
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    icon: Star,
    priceLabel: "SAR 499",
    monthlyPrice: 499,
    billingSuffix: "شهرياً",
    isActive: true,
    features: [
      { label: "10 متاجر" },
      { label: "500,000 زائر شهرياً" },
      { label: "تحليلات متقدمة" },
      { label: "تقارير مخصصة" },
    ],
  },
  growth: {
    tier: "growth",
    name: "Growth",
    icon: BarChart3,
    priceLabel: "SAR 299",
    monthlyPrice: 299,
    billingSuffix: "شهرياً",
    isActive: true,
    features: [
      { label: "3 متاجر" },
      { label: "100,000 زائر شهرياً" },
      { label: "مصادر الإعلانات" },
      { label: "تقارير أساسية" },
    ],
  },
  starter: {
    tier: "starter",
    name: "Starter",
    icon: Zap,
    priceLabel: "SAR 99",
    monthlyPrice: 99,
    billingSuffix: "شهرياً",
    isActive: true,
    features: [
      { label: "متجر واحد" },
      { label: "10,000 زائر شهرياً" },
      { label: "تقارير أساسية" },
      { label: "دعم عبر البريد" },
    ],
  },
}

export const PLAN_ORDER: PlanTier[] = ["enterprise", "pro", "growth", "starter"]

// Every page's KPI/chart numbers are built from these same totals so nothing drifts between the
// overview, customers, subscriptions and packages screens.
export const PLAN_COUNTS: Record<PlanTier, number> = {
  starter: 145,
  growth: 180,
  pro: 77,
  enterprise: 26,
}

export const STATUS_COUNTS: Record<SubscriptionStatus, number> = {
  active: 356,
  trial: 42,
  overdue: 18,
  cancelled: 9,
  expired: 3,
}

export const PLATFORM_COUNTS: Record<PlatformKey, number> = {
  Salla: 173,
  Shopify: 109,
  Zid: 99,
  WooCommerce: 29,
  Other: 18,
}

export const TOTAL_CUSTOMERS = 428
export const TOTAL_STORES = 612
export const TOTAL_ACTIVE_SUBSCRIPTIONS = STATUS_COUNTS.active
export const MRR_SAR = 152430
export const LIVE_VISITORS_NOW = 1284

export const STORE_PLATFORM_COUNTS: Record<Exclude<PlatformKey, "Other">, number> & {
  Other: number
} = {
  Salla: 248,
  Shopify: 156,
  Zid: 142,
  WooCommerce: 42,
  Other: 24,
}

function buildBucketedList<T>(counts: Record<string, number>): T[] {
  const list: T[] = []
  for (const [key, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) list.push(key as T)
  }
  return list
}

// Two independent shuffled bags (plan, status) of the exact target size -- zipping them
// one-to-one keeps the marginal distributions exact while still looking randomly assigned per row.
function shuffle<T>(list: T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const STORE_NAME_ROOTS = [
  "متجر لمة",
  "متجر نواة",
  "بيت العود",
  "Rimal Store",
  "متجر الصحة",
  "Taj Store",
  "Aura Store",
  "Zid Test Store",
  "Coffee.sa",
  "Matjar Plus",
  "متجر الأصالة",
  "دار العطور",
  "متجر النخبة",
  "بازار الرياض",
  "متجر الواحة",
  "سوق الحرفيين",
  "متجر الإبداع",
  "بوتيك لمسة",
  "متجر الأناقة",
  "دكان البيت",
  "متجر التقنية",
  "سوق الأثاث",
  "متجر الأطفال",
  "بيت الهدايا",
  "متجر الرياضة",
]

const OWNER_NAMES = [
  "أحمد",
  "محمد",
  "فاطمة",
  "علي",
  "سارة",
  "عبدالله",
  "نورة",
  "خالد",
  "منيرة",
  "فيصل",
  "هند",
  "عمر",
  "لمى",
  "سلطان",
  "ريم",
]

const PAYMENT_METHODS: MadarAdminCustomer["paymentMethod"][] = ["visa", "mastercard", "mada"]

const LAST_ACTIVITY_LABELS = [
  "منذ 5 دقائق",
  "منذ ساعة",
  "منذ 3 ساعات",
  "منذ يوم",
  "منذ يومين",
  "منذ أسبوع",
]

function isoDaysAgo(days: number): string {
  const date = new Date(2026, 7, 15)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function isoDaysFromNow(days: number): string {
  const date = new Date(2026, 7, 15)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildCustomers(): MadarAdminCustomer[] {
  const plans = shuffle(buildBucketedList<PlanTier>(PLAN_COUNTS))
  const statuses = shuffle(buildBucketedList<SubscriptionStatus>(STATUS_COUNTS))
  const platforms = shuffle(buildBucketedList<PlatformKey>(PLATFORM_COUNTS))

  const customers: MadarAdminCustomer[] = []

  for (let i = 0; i < TOTAL_CUSTOMERS; i += 1) {
    const plan = plans[i]
    const status = statuses[i]
    const platform = platforms[i]
    const storeRoot = STORE_NAME_ROOTS[i % STORE_NAME_ROOTS.length]
    const owner = OWNER_NAMES[i % OWNER_NAMES.length]
    const storeName =
      i < STORE_NAME_ROOTS.length
        ? storeRoot
        : `${storeRoot} ${Math.floor(i / STORE_NAME_ROOTS.length) + 1}`
    const basePrice = PLAN_META[plan].monthlyPrice ?? 999
    const subscriptionDaysAgo = 5 + Math.floor(rand() * 380)

    customers.push({
      id: `cust-${i + 1}`,
      name: `${owner} ${storeName.split(" ").slice(-1)[0]}`,
      email: `${owner.toLowerCase()}@${storeName.replace(/[^a-zA-Z]/g, "").toLowerCase() || "store"}.sa`,
      storeName,
      storeCount: 1 + Math.floor(rand() * 3),
      platform,
      plan,
      status,
      paymentMethod: pick(PAYMENT_METHODS),
      monthlyRevenue: status === "trial" ? 0 : Math.round(basePrice * (0.9 + rand() * 0.3)),
      subscriptionDate: isoDaysAgo(subscriptionDaysAgo),
      renewalDate: isoDaysFromNow(30 - Math.floor(rand() * 20)),
      lastActivity: pick(LAST_ACTIVITY_LABELS),
    })
  }

  return customers
}

let cachedCustomers: MadarAdminCustomer[] | null = null

export function getAllCustomers(): MadarAdminCustomer[] {
  if (!cachedCustomers) cachedCustomers = buildCustomers()
  return cachedCustomers
}

export function getOverviewKpis() {
  return {
    totalCustomers: { value: TOTAL_CUSTOMERS, deltaPct: 12 },
    totalStores: { value: TOTAL_STORES, deltaPct: 18 },
    activeSubscriptions: { value: TOTAL_ACTIVE_SUBSCRIPTIONS, deltaPct: 14 },
    mrr: { value: MRR_SAR, deltaPct: 22 },
    liveVisitors: { value: LIVE_VISITORS_NOW, deltaPct: 6 },
  }
}

export function getCustomersListKpis() {
  return {
    endingSoon: { value: 18, deltaPct: -6 },
    overdue: { value: STATUS_COUNTS.overdue, deltaPct: -18 },
    trial: { value: STATUS_COUNTS.trial, deltaPct: 27 },
    active: { value: STATUS_COUNTS.active, deltaPct: 14 },
    total: { value: TOTAL_CUSTOMERS, deltaPct: 12 },
  }
}

export function getSubscriptionsListKpis() {
  return {
    cancelled: { value: STATUS_COUNTS.cancelled, deltaPct: -28 },
    paused: { value: 26, deltaPct: -18 },
    trial: { value: 28, deltaPct: 27 },
    active: { value: STATUS_COUNTS.active, deltaPct: 14 },
    total: { value: TOTAL_CUSTOMERS, deltaPct: 12 },
  }
}

export function getRevenueTrend() {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس"]
  const revenue = [58000, 71000, 84000, 96000, 108000, 122000, 138000, 152430]
  const subscriptions = [210, 240, 265, 285, 305, 325, 342, 356]
  return months.map((month, index) => ({
    month,
    الإيرادات: revenue[index],
    الاشتراكات: subscriptions[index],
  }))
}

const PLAN_DONUT_COLOR: Record<PlanTier, string> = {
  growth: "#10b981",
  starter: "#2878ff",
  pro: "#7c4dff",
  enterprise: "#ff9f43",
}

export function getPlanDistribution() {
  return (["growth", "starter", "pro", "enterprise"] as PlanTier[]).map((tier) => ({
    tier,
    label: PLAN_META[tier].name,
    value: PLAN_COUNTS[tier],
    share: Math.round((PLAN_COUNTS[tier] / TOTAL_CUSTOMERS) * 100),
    color: PLAN_DONUT_COLOR[tier],
  }))
}

export function getSubscriptionStatusBreakdown() {
  const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    active: "نشط",
    trial: "تجربة مجانية",
    overdue: "متأخر في الدفع",
    cancelled: "ملغي",
    expired: "منتهي",
  }
  const STATUS_COLOR: Record<SubscriptionStatus, string> = {
    active: "bg-emerald-500",
    trial: "bg-blue-500",
    overdue: "bg-amber-500",
    cancelled: "bg-rose-500",
    expired: "bg-slate-400",
  }
  return (Object.keys(STATUS_COUNTS) as SubscriptionStatus[]).map((status) => ({
    status,
    label: STATUS_LABEL[status],
    value: STATUS_COUNTS[status],
    share: Math.round((STATUS_COUNTS[status] / TOTAL_CUSTOMERS) * 100),
    barClassName: STATUS_COLOR[status],
  }))
}

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  Salla: "سلة",
  Shopify: "Shopify",
  Zid: "زد",
  WooCommerce: "WooCommerce",
  Other: "منصات أخرى",
}

export function getPlatformBreakdown() {
  return (["Salla", "Shopify", "Zid", "WooCommerce", "Other"] as PlatformKey[]).map((platform) => ({
    platform,
    label: PLATFORM_LABEL[platform],
    value: STORE_PLATFORM_COUNTS[platform],
    share: Math.round((STORE_PLATFORM_COUNTS[platform] / TOTAL_STORES) * 100),
  }))
}

export function getTodayStats() {
  return [
    { label: "الأحداث المستقبلة", value: "245,832", deltaPct: 18 },
    { label: "عدد الطلبات (Purchases)", value: "3,421", deltaPct: 10 },
    { label: "المتاجر الجديدة", value: "12", deltaPct: 33 },
    { label: "العملاء الجدد", value: "18", deltaPct: 28 },
    { label: "الأخطاء في التكاملات", value: "3", deltaPct: -57 },
  ]
}

export function getRecentCustomers(limit = 3) {
  return getAllCustomers().slice(0, limit)
}

export function getRecentActivity() {
  return [
    { activity: "اشتراك جديد", details: "متجر لمة اشترك في باقة Growth", time: "10:24" },
    { activity: "دفعة ناجحة", details: "SAR 299 - Rimal Store", time: "09:41" },
    { activity: "ربط متجر", details: "تم ربط متجر جديد على سلة", time: "08:32" },
    { activity: "ترقية باقة", details: "تمت ترقية Taj Store إلى باقة Pro", time: "06:17" },
  ]
}

export interface CustomerListFilters {
  search?: string
  platform?: PlatformKey | "all"
  plan?: PlanTier | "all"
  status?: SubscriptionStatus | "all"
}

export function listCustomers(filters: CustomerListFilters = {}): MadarAdminCustomer[] {
  const { search = "", platform = "all", plan = "all", status = "all" } = filters
  const query = search.trim().toLowerCase()

  return getAllCustomers().filter((customer) => {
    if (platform !== "all" && customer.platform !== platform) return false
    if (plan !== "all" && customer.plan !== plan) return false
    if (status !== "all" && customer.status !== status) return false
    if (query.length === 0) return true
    return (
      customer.name.toLowerCase().includes(query) ||
      customer.storeName.toLowerCase().includes(query) ||
      customer.email.toLowerCase().includes(query)
    )
  })
}

export function listSubscriptions(filters: CustomerListFilters = {}): MadarAdminCustomer[] {
  return listCustomers(filters)
}

export function getPlans(): MadarPlan[] {
  return PLAN_ORDER.map((tier) => ({ ...PLAN_META[tier], customerCount: PLAN_COUNTS[tier] }))
}

// Coupons have no reference screenshot -- invented to match this feature's general shape and
// styled identically to everything else here, kept intentionally small.
let cachedCoupons: Coupon[] | null = null

function buildCoupons(): Coupon[] {
  return [
    {
      id: "cp-1",
      code: "WELCOME20",
      discountType: "percentage",
      value: 20,
      usageLimit: 500,
      usedCount: 342,
      expiresAt: isoDaysFromNow(45),
      status: "active",
      applicablePlans: ["starter", "growth"],
    },
    {
      id: "cp-2",
      code: "GROWTH50",
      discountType: "fixed",
      value: 50,
      usageLimit: 200,
      usedCount: 128,
      expiresAt: isoDaysFromNow(15),
      status: "active",
      applicablePlans: ["growth", "pro"],
    },
    {
      id: "cp-3",
      code: "RAMADAN25",
      discountType: "percentage",
      value: 25,
      usageLimit: 1000,
      usedCount: 764,
      expiresAt: isoDaysAgo(20),
      status: "expired",
      applicablePlans: ["starter", "growth", "pro", "enterprise"],
    },
    {
      id: "cp-4",
      code: "VIP100",
      discountType: "fixed",
      value: 100,
      usageLimit: 50,
      usedCount: 12,
      expiresAt: isoDaysFromNow(90),
      status: "active",
      applicablePlans: ["enterprise"],
    },
    {
      id: "cp-5",
      code: "TESTPAUSE",
      discountType: "percentage",
      value: 10,
      usageLimit: 100,
      usedCount: 4,
      expiresAt: isoDaysFromNow(60),
      status: "disabled",
      applicablePlans: ["starter"],
    },
  ]
}

export function listCoupons(): Coupon[] {
  if (!cachedCoupons) cachedCoupons = buildCoupons()
  return cachedCoupons
}

export function getCouponsKpis() {
  const coupons = listCoupons()
  return {
    total: coupons.length,
    active: coupons.filter((c) => c.status === "active").length,
    expired: coupons.filter((c) => c.status === "expired").length,
    redemptions: coupons.reduce((sum, c) => sum + c.usedCount, 0),
  }
}
