import { ERRORS } from "../application/errors/IdentityError"
import type { PostgresDatabase } from "../infrastructure/postgres/database"
import type { PurchasableApplication } from "../subscriptions/types"
import type {
  CustomerStatus,
  Page,
  PageRequest,
  PlatformAdminCustomer,
  PlatformAdminSubscriptionView,
  StorePlatform,
} from "./types"

// How much each customer actually uses Madar: what they have created (products, invoices,
// orders, ...) in total and inside a date range, day by day. Read-only, straight from the
// tables the apps themselves write to -- nothing is tracked separately.

// One entry per thing a customer creates while using Madar. `where` keeps out rows the customer
// deleted. Table names and conditions are fixed here, never taken from a request.
const METRIC_SOURCES = [
  { key: "products", table: "products", where: "deleted_at IS NULL" },
  { key: "posInvoices", table: "pos_invoices", where: null },
  {
    key: "salesInvoices",
    table: "sales_invoices",
    where: "deleted_at IS NULL AND document_type = 'invoice'",
  },
  { key: "quotations", table: "sales_quotations", where: "deleted_at IS NULL" },
  { key: "orders", table: "madar_orders", where: null },
  { key: "customers", table: "customers", where: "deleted_at IS NULL" },
  { key: "purchases", table: "purchases", where: "deleted_at IS NULL" },
  { key: "expenses", table: "expenses", where: "deleted_at IS NULL" },
] as const

export type UtilizationMetric = (typeof METRIC_SOURCES)[number]["key"]
export const UTILIZATION_METRICS = METRIC_SOURCES.map((source) => source.key) as [
  UtilizationMetric,
  ...UtilizationMetric[],
]
export type UtilizationCounts = Record<UtilizationMetric, number>

// active: created something inside the range. idle: has data, but nothing inside the range.
// never: has not created anything at all.
export type UsageLevel = "active" | "idle" | "never"

export const UTILIZATION_SORTS = [
  ...UTILIZATION_METRICS,
  "activity",
  "createdAt",
  "lastUsedAt",
  "name",
] as const
export type UtilizationSort = (typeof UTILIZATION_SORTS)[number]

export interface PlatformAdminUtilizationFilters {
  // The range the "in range" numbers and the daily series cover, as Riyadh days (inclusive).
  // Defaults to the last 30 days.
  from?: string
  to?: string
  search?: string
  status?: CustomerStatus
  application?: PurchasableApplication
  platform?: StorePlatform
  usage?: UsageLevel
  // When the customer signed up (Riyadh days, inclusive).
  createdFrom?: string
  createdTo?: string
  sort?: UtilizationSort
  direction?: "asc" | "desc"
}

export interface PlatformAdminUtilizationRow {
  id: string
  name: string
  createdAt: string
  owner: { userId: string; name: string; email: string } | null
  status: CustomerStatus
  platforms: StorePlatform[]
  storeCount: number
  // Apps the customer has running right now (paid or on trial).
  applications: PurchasableApplication[]
  members: number
  branches: number
  totals: UtilizationCounts
  inRange: UtilizationCounts
  // Everything created inside the range, all metrics together.
  activityInRange: number
  usage: UsageLevel
  // The last time each kind of record was created, and the latest of them all.
  lastAt: Record<UtilizationMetric, string | null>
  lastUsedAt: string | null
}

export type UtilizationDailyPoint = { date: string; activeCustomers: number } & UtilizationCounts

export interface PlatformAdminUtilization {
  from: string
  to: string
  summary: {
    customers: number
    active: number
    idle: number
    never: number
    totals: UtilizationCounts
    inRange: UtilizationCounts
  }
  daily: UtilizationDailyPoint[]
  page: Page<PlatformAdminUtilizationRow>
}

export interface PlatformAdminCustomerUtilization {
  from: string
  to: string
  customer: PlatformAdminUtilizationRow
  subscriptions: PlatformAdminSubscriptionView[]
  daily: UtilizationDailyPoint[]
}

const DAY_MS = 86_400_000
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000
const DEFAULT_RANGE_DAYS = 30
export const MAX_UTILIZATION_RANGE_DAYS = 366

// The calendar day in Riyadh (UTC+3, no daylight saving) an instant falls on.
function riyadhDay(value: string | number | Date): string {
  return new Date(new Date(value).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10)
}

// The instant a Riyadh calendar day starts.
function riyadhDayStart(day: string): number {
  return new Date(`${day}T00:00:00.000Z`).getTime() - RIYADH_OFFSET_MS
}

function emptyCounts(): UtilizationCounts {
  return Object.fromEntries(UTILIZATION_METRICS.map((metric) => [metric, 0])) as UtilizationCounts
}

interface ResolvedRange {
  from: string
  to: string
  start: string
  end: string
  days: string[]
}

function resolveRange(from: string | undefined, to: string | undefined): ResolvedRange {
  const lastDay = to ?? riyadhDay(Date.now())
  const firstDay =
    from ??
    riyadhDay(riyadhDayStart(lastDay) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS + RIYADH_OFFSET_MS)
  const start = riyadhDayStart(firstDay)
  const end = riyadhDayStart(lastDay) + DAY_MS
  if (!(start < end)) throw ERRORS.validation({ from: "The range must start before it ends." })
  const dayCount = Math.round((end - start) / DAY_MS)
  if (dayCount > MAX_UTILIZATION_RANGE_DAYS) {
    throw ERRORS.validation({
      from: `The range can cover at most ${MAX_UTILIZATION_RANGE_DAYS} days.`,
    })
  }
  return {
    from: firstDay,
    to: lastDay,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    days: Array.from({ length: dayCount }, (_, index) => riyadhDay(start + index * DAY_MS)),
  }
}

// A SQL `date` comes back as text, as a Date at UTC midnight, or (node-postgres) as a Date at the
// server's local midnight -- read whichever it is as the plain calendar day.
function dayOf(value: unknown): string {
  if (value instanceof Date) {
    const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0
    const year = utcMidnight ? value.getUTCFullYear() : value.getFullYear()
    const month = (utcMidnight ? value.getUTCMonth() : value.getMonth()) + 1
    const day = utcMidnight ? value.getUTCDate() : value.getDate()
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  return String(value).slice(0, 10)
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

interface OrganizationUsage {
  totals: UtilizationCounts
  lastAt: Record<UtilizationMetric, string | null>
  // day -> what was created that day.
  byDay: Map<string, UtilizationCounts>
}

interface LoadedUsage {
  byOrganization: Map<string, OrganizationUsage>
  members: Map<string, number>
  branches: Map<string, number>
}

// Counts for every organization (or just one), grouped in SQL so no table is read row by row.
async function loadUsage(
  db: PostgresDatabase,
  range: ResolvedRange,
  organizationId?: string
): Promise<LoadedUsage> {
  const byOrganization = new Map<string, OrganizationUsage>()
  const usageOf = (id: string) => {
    let usage = byOrganization.get(id)
    if (!usage) {
      usage = {
        totals: emptyCounts(),
        lastAt: Object.fromEntries(UTILIZATION_METRICS.map((metric) => [metric, null])) as Record<
          UtilizationMetric,
          string | null
        >,
        byDay: new Map(),
      }
      byOrganization.set(id, usage)
    }
    return usage
  }
  const onlyOrg = (position: number) =>
    organizationId ? ` AND organization_id = $${position}` : ""

  await Promise.all(
    METRIC_SOURCES.map(async ({ key, table, where }) => {
      const totals = await db.query<{ organization_id: string; total: unknown; last_at: unknown }>(
        `SELECT organization_id, COUNT(*) AS total, MAX(created_at) AS last_at
           FROM ${table}
          WHERE ${where ?? "TRUE"}${onlyOrg(1)}
          GROUP BY organization_id`,
        organizationId ? [organizationId] : []
      )
      for (const row of totals.rows) {
        const usage = usageOf(row.organization_id)
        usage.totals[key] = Number(row.total)
        usage.lastAt[key] = toIso(row.last_at)
      }

      // Days are Riyadh days: the database keeps UTC, so shift by three hours before cutting the
      // time off.
      const daily = await db.query<{ organization_id: string; day: unknown; count: unknown }>(
        `SELECT organization_id, (created_at + interval '3 hours')::date AS day, COUNT(*) AS count
           FROM ${table}
          WHERE created_at >= $1 AND created_at < $2 AND ${where ?? "TRUE"}${onlyOrg(3)}
          GROUP BY organization_id, (created_at + interval '3 hours')::date`,
        organizationId ? [range.start, range.end, organizationId] : [range.start, range.end]
      )
      for (const row of daily.rows) {
        const usage = usageOf(row.organization_id)
        const day = dayOf(row.day)
        const counts = usage.byDay.get(day) ?? emptyCounts()
        counts[key] += Number(row.count)
        usage.byDay.set(day, counts)
      }
    })
  )

  const countBy = async (sql: string) => {
    const result = await db.query<{ organization_id: string; count: unknown }>(
      `${sql}${onlyOrg(1)} GROUP BY organization_id`,
      organizationId ? [organizationId] : []
    )
    return new Map(result.rows.map((row) => [row.organization_id, Number(row.count)]))
  }
  const [members, branches] = await Promise.all([
    countBy(
      "SELECT organization_id, COUNT(DISTINCT user_id) AS count FROM memberships WHERE deleted_at IS NULL"
    ),
    countBy("SELECT organization_id, COUNT(*) AS count FROM workspaces WHERE deleted_at IS NULL"),
  ])
  return { byOrganization, members, branches }
}

function toRow(customer: PlatformAdminCustomer, loaded: LoadedUsage): PlatformAdminUtilizationRow {
  const usage = loaded.byOrganization.get(customer.id)
  const totals = usage?.totals ?? emptyCounts()
  const inRange = emptyCounts()
  for (const counts of usage?.byDay.values() ?? []) {
    for (const metric of UTILIZATION_METRICS) inRange[metric] += counts[metric]
  }
  const sum = (counts: UtilizationCounts) =>
    UTILIZATION_METRICS.reduce((total, metric) => total + counts[metric], 0)
  const activityInRange = sum(inRange)
  const lastAt =
    usage?.lastAt ??
    (Object.fromEntries(UTILIZATION_METRICS.map((metric) => [metric, null])) as Record<
      UtilizationMetric,
      string | null
    >)
  const lastUsedAt =
    Object.values(lastAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? null
  return {
    id: customer.id,
    name: customer.name,
    createdAt: customer.createdAt,
    owner: customer.owner,
    status: customer.status,
    platforms: customer.platforms,
    storeCount: customer.storeCount,
    applications: customer.subscriptions
      .filter((view) => view.status === "active" || view.status === "trial")
      .map((view) => view.application),
    members: loaded.members.get(customer.id) ?? 0,
    branches: loaded.branches.get(customer.id) ?? 0,
    totals,
    inRange,
    activityInRange,
    usage: activityInRange > 0 ? "active" : sum(totals) > 0 ? "idle" : "never",
    lastAt,
    lastUsedAt,
  }
}

function dailySeries(
  range: ResolvedRange,
  organizationIds: string[],
  loaded: LoadedUsage
): UtilizationDailyPoint[] {
  const points = new Map<string, UtilizationDailyPoint>(
    range.days.map((date) => [date, { date, activeCustomers: 0, ...emptyCounts() }])
  )
  for (const id of organizationIds) {
    for (const [day, counts] of loaded.byOrganization.get(id)?.byDay ?? []) {
      const point = points.get(day)
      if (!point) continue
      point.activeCustomers += 1
      for (const metric of UTILIZATION_METRICS) point[metric] += counts[metric]
    }
  }
  return [...points.values()]
}

function compare(
  left: PlatformAdminUtilizationRow,
  right: PlatformAdminUtilizationRow,
  sort: UtilizationSort
): number {
  if (sort === "name") return left.name.localeCompare(right.name, "ar")
  if (sort === "createdAt") return left.createdAt.localeCompare(right.createdAt)
  if (sort === "lastUsedAt") return (left.lastUsedAt ?? "").localeCompare(right.lastUsedAt ?? "")
  if (sort === "activity") return left.activityInRange - right.activityInRange
  // A metric: by what was created inside the range, then by the all-time total.
  return left.inRange[sort] - right.inRange[sort] || left.totals[sort] - right.totals[sort]
}

export async function buildUtilization(
  db: PostgresDatabase,
  customers: PlatformAdminCustomer[],
  filters: PlatformAdminUtilizationFilters,
  page: PageRequest
): Promise<PlatformAdminUtilization> {
  const range = resolveRange(filters.from, filters.to)
  const loaded = await loadUsage(db, range)
  const search = filters.search?.trim().toLowerCase()
  const sort = filters.sort ?? "activity"
  const direction = filters.direction === "asc" ? 1 : -1

  const rows = customers
    .filter((customer) => {
      if (filters.status && customer.status !== filters.status) return false
      if (filters.platform && !customer.platforms.includes(filters.platform)) return false
      if (
        filters.application &&
        !customer.subscriptions.some((view) => view.application === filters.application)
      ) {
        return false
      }
      const signedUp = riyadhDay(customer.createdAt)
      if (filters.createdFrom && signedUp < filters.createdFrom) return false
      if (filters.createdTo && signedUp > filters.createdTo) return false
      if (search) {
        const haystack = [customer.name, customer.owner?.name, customer.owner?.email, customer.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
    .map((customer) => toRow(customer, loaded))
    .filter((row) => !filters.usage || row.usage === filters.usage)
    .sort(
      (left, right) =>
        direction * compare(left, right, sort) || right.createdAt.localeCompare(left.createdAt)
    )

  const totals = emptyCounts()
  const inRange = emptyCounts()
  for (const row of rows) {
    for (const metric of UTILIZATION_METRICS) {
      totals[metric] += row.totals[metric]
      inRange[metric] += row.inRange[metric]
    }
  }
  const count = (level: UsageLevel) => rows.filter((row) => row.usage === level).length
  const start = (page.page - 1) * page.pageSize

  return {
    from: range.from,
    to: range.to,
    summary: {
      customers: rows.length,
      active: count("active"),
      idle: count("idle"),
      never: count("never"),
      totals,
      inRange,
    },
    daily: dailySeries(
      range,
      rows.map((row) => row.id),
      loaded
    ),
    page: {
      items: rows.slice(start, start + page.pageSize),
      total: rows.length,
      page: page.page,
      pageSize: page.pageSize,
    },
  }
}

export async function buildCustomerUtilization(
  db: PostgresDatabase,
  customer: PlatformAdminCustomer,
  filters: { from?: string; to?: string }
): Promise<PlatformAdminCustomerUtilization> {
  const range = resolveRange(filters.from, filters.to)
  const loaded = await loadUsage(db, range, customer.id)
  return {
    from: range.from,
    to: range.to,
    customer: toRow(customer, loaded),
    subscriptions: customer.subscriptions,
    daily: dailySeries(range, [customer.id], loaded),
  }
}
