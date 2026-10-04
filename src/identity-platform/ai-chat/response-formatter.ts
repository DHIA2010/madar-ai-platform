import type {
  AnomalyFlag,
  CampaignDeclineRow,
  CampaignRecommendation,
  CampaignRow,
  CampaignScalingSignal,
  ChannelComparisonRow,
  ChannelFreshness,
  ConfidenceLevel,
  MetricKey,
  PeriodComparisonResult,
  PerformanceDriver,
} from "../campaigns/analytics-types"
import type { KpiResult } from "../reports/types"
import { describePeriodFairness, type RevenueDecomposition } from "../shared/analytics-rules"

import type {
  ChartSeriesPoint,
  ChartSpec,
  ContributionFinding,
  DataQualityWarning,
  DriverFinding,
  Fact,
  Insight,
  KpiCard,
  RawToolResult,
  ReportTable,
  StructuredAnalyticsResponse,
} from "./response-types"

// Which of the ~12 metrics in a MetricSnapshot are worth a KPI card -- the full set would be
// noisy (nobody needs a card for "active campaigns"); these are the ones a business owner
// actually scans first. Matches the headline fields used throughout the campaigns feature.
const HEADLINE_METRICS: Array<{ key: MetricKey; title: string; format: KpiCard["format"] }> = [
  { key: "spend", title: "الإنفاق", format: "currency" },
  { key: "revenue", title: "الإيرادات", format: "currency" },
  { key: "roas", title: "ROAS", format: "multiple" },
  { key: "cpa", title: "تكلفة الاكتساب (CPA)", format: "currency" },
  { key: "conversionRate", title: "معدل التحويل", format: "percent" },
]

const MATERIAL_FACT_PCT = 10

function trend(changePercent: number | null): KpiCard["trend"] {
  if (changePercent === null || Math.abs(changePercent) < 1) return "flat"
  return changePercent > 0 ? "up" : "down"
}

// Human-readable Arabic datetime strings in the organization's own timezone -- the one place an
// ISO timestamp from a tool's raw output becomes something a user should actually read. Built
// from Intl.DateTimeFormat parts (not the locale's own combined string) so the separator between
// date and time matches this product's own style ("22 سبتمبر 2026، 11:32 م") rather than
// whatever ICU's default conjunction happens to be ("...في..."). Returns "—" for a null/invalid
// input -- the report renderer never shows "null" or an unformatted ISO string to the user.
function formatDateTime(iso: string | null, timezone: string): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const parts = new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")} ${get("month")} ${get("year")}، ${get("hour")}:${get("minute")} ${get("dayPeriod")}`
}

function factFromComparison(comparison: PeriodComparisonResult): Fact[] {
  return comparison.deltas
    .filter((d) => d.changePercent !== null && Math.abs(d.changePercent) >= MATERIAL_FACT_PCT)
    .map((d) => ({
      statement: `${d.metric}: ${d.previous} -> ${d.current} (${d.changePercent! > 0 ? "+" : ""}${d.changePercent}%)`,
      metric: d.metric,
      currentValue: d.current,
      previousValue: d.previous,
      changePercent: d.changePercent,
    }))
}

function kpiCardsFromComparison(comparison: PeriodComparisonResult): KpiCard[] {
  return HEADLINE_METRICS.map(({ key, title, format }) => {
    const delta = comparison.deltas.find((d) => d.metric === key)!
    return {
      type: "kpi" as const,
      title,
      value: delta.current,
      previousValue: delta.previous,
      changePercent: delta.changePercent,
      trend: trend(delta.changePercent),
      format,
    }
  })
}

function kpiCardsFromSnapshot(metrics: Record<MetricKey, number>): KpiCard[] {
  return HEADLINE_METRICS.map(({ key, title, format }) => ({
    type: "kpi" as const,
    title,
    value: metrics[key],
    previousValue: null,
    changePercent: null,
    trend: "flat" as const,
    format,
  }))
}

function insightsFromDrivers(drivers: PerformanceDriver[]): Insight[] {
  return drivers.map((driver) => ({
    statement: driver.narrative,
    relatedMetrics: [driver.metric],
    confidence: "medium" as ConfidenceLevel,
  }))
}

// Typed counterpart of insightsFromDrivers -- identifyPerformanceDrivers already ranks by
// magnitude (magnitudeRank), so rank 1 is "primary" and everything else "secondary"; current/
// previous now travel on PerformanceDriver itself (added alongside this) so evidence doesn't
// need to re-derive them from a sibling compare_campaign_periods call that may not have run.
function driverFindingsFromPerformanceDrivers(drivers: PerformanceDriver[]): DriverFinding[] {
  return drivers.map((driver) => ({
    metric: driver.metric,
    role: driver.magnitudeRank === 1 ? "primary" : "secondary",
    direction: driver.direction,
    changePercent: driver.changePercent,
    statement: driver.narrative,
    evidence: [
      {
        metric: driver.metric,
        current: driver.current,
        previous: driver.previous,
        changePercent: driver.changePercent,
      },
    ],
    confidence: "medium",
  }))
}

function factsAndInsightsFromAnomalies(anomalies: AnomalyFlag[]): {
  facts: Fact[]
  insights: Insight[]
} {
  const facts: Fact[] = []
  const insights: Insight[] = []
  for (const anomaly of anomalies) {
    facts.push({
      statement: anomaly.detail,
      metric: anomaly.type,
      currentValue: anomaly.changePercent ?? null,
      previousValue: null,
      changePercent: anomaly.changePercent ?? null,
    })
    if (anomaly.supportingChanges && anomaly.supportingChanges.length > 0) {
      const supporting = anomaly.supportingChanges
        .map((d) => `${d.metric} ${d.changePercent! > 0 ? "+" : ""}${d.changePercent}%`)
        .join("، ")
      insights.push({
        statement: `تزامن ${anomaly.entityName} مع تغيّرات أخرى: ${supporting}.`,
        relatedMetrics: anomaly.supportingChanges.map((d) => d.metric),
        confidence: "medium",
      })
    }
  }
  return { facts, insights }
}

// Visualization-selection fix from the Genie-upgrade audit: a ranked list of campaigns is a
// category comparison, which a bar chart communicates better than a two-column table (the
// generic ReportTable above already covers the "give me the raw records" case separately).
function chartFromCampaignRows(
  rows: CampaignRow[] | CampaignDeclineRow[],
  metric: MetricKey,
  title: string
): ChartSpec {
  const data: ChartSeriesPoint[] = rows.map((row) => ({
    label: row.name,
    value: row.metrics[metric],
  }))
  return { type: "chart", chartType: "bar", title, series: [{ name: metric, data }] }
}

function chartFromChannelComparison(rows: ChannelComparisonRow[]): ChartSpec {
  return {
    type: "chart",
    chartType: "comparison",
    title: "مقارنة القنوات -- الإيرادات",
    series: [
      { name: "revenue", data: rows.map((r) => ({ label: r.channel, value: r.metrics.revenue })) },
    ],
  }
}

// Mirrors channels/channels-service.ts's ChannelsTrendPoint.
interface ChannelSpendTrendPoint {
  bucketStart: string
  spendByChannel: Record<string, number>
}

// Visualization-selection fix (audit section 8/10): a time series over days/weeks is a trend,
// which a line chart communicates correctly -- this was the one tool returning time-bucketed data
// with no structured handling at all before, so it fell back to raw LLM narration like every
// other unhandled case.
function chartFromSpendTrend(points: ChannelSpendTrendPoint[]): ChartSpec {
  return {
    type: "chart",
    chartType: "line",
    title: "اتجاه الإنفاق الإعلاني",
    series: [
      {
        name: "spend",
        data: points.map((point) => ({
          label: point.bucketStart,
          value:
            Math.round(Object.values(point.spendByChannel).reduce((a, b) => a + b, 0) * 100) / 100,
        })),
      },
    ],
  }
}

// Mirrors the shape PosInvoicesService.topProducts() actually returns (pos/invoices-service.ts)
// -- not re-exported as a named type there, so reproduced structurally here rather than widening
// that service's own return type just for this.
interface TopProductRow {
  productId: string | null
  productName: string
  quantitySold: number
  revenue: number
  invoiceCount: number
}

function chartFromTopProducts(rows: TopProductRow[]): ChartSpec {
  return {
    type: "chart",
    chartType: "bar",
    title: "أفضل المنتجات مبيعًا -- الإيرادات",
    series: [
      { name: "revenue", data: rows.map((r) => ({ label: r.productName, value: r.revenue })) },
    ],
  }
}

// Mirrors PosShiftsService's ShiftView (pos/shifts-service.ts) -- reproduced structurally for the
// same reason as TopProductRow above.
interface ShiftRow {
  id: string
  shiftNumber: number | null
  status: "open" | "closed"
  openingCashAmount: number
  closingCashAmount: number | null
  openedAt: string
  closedAt: string | null
}

const SHIFT_STATUS_LABEL: Record<ShiftRow["status"], string> = {
  open: "مفتوحة",
  closed: "مغلقة",
}

function tableFromShifts(rows: ShiftRow[], timezone: string): ReportTable {
  return {
    title: "تفاصيل الورديات",
    columns: [
      { key: "shiftNumber", label: "الوردية", format: "text" },
      { key: "status", label: "الحالة", format: "status" },
      { key: "openedAt", label: "وقت الافتتاح", format: "datetime" },
      { key: "closedAt", label: "وقت الإغلاق", format: "datetime" },
      { key: "openingCashAmount", label: "المبلغ الافتتاحي", format: "currency" },
      { key: "closingCashAmount", label: "المبلغ الختامي", format: "currency" },
    ],
    rows: rows.map((row) => ({
      shiftNumber: row.shiftNumber !== null ? `#${row.shiftNumber}` : "—",
      status: SHIFT_STATUS_LABEL[row.status],
      openedAt: formatDateTime(row.openedAt, timezone),
      closedAt: row.closedAt ? formatDateTime(row.closedAt, timezone) : null,
      openingCashAmount: row.openingCashAmount,
      closingCashAmount: row.closingCashAmount,
    })),
  }
}

// Mirrors OrdersAggregationService's OrderSummaryView (orders/service.ts).
interface OrderRow {
  id: string
  orderNumber: string
  customerName: string
  platform: string
  amount: number
  orderStatus: "Completed" | "Processing" | "Cancelled" | "Refunded"
  createdAt: string
}

const ORDER_STATUS_LABEL: Record<OrderRow["orderStatus"], string> = {
  Completed: "مكتمل",
  Processing: "قيد المعالجة",
  Cancelled: "ملغي",
  Refunded: "مسترجع",
}

function tableFromOrders(rows: OrderRow[]): ReportTable {
  return {
    title: "تفاصيل الطلبات",
    columns: [
      { key: "orderNumber", label: "رقم الطلب", format: "text" },
      { key: "customerName", label: "العميل", format: "text" },
      { key: "platform", label: "المنصة", format: "text" },
      { key: "orderStatus", label: "الحالة", format: "status" },
      { key: "amount", label: "القيمة", format: "currency" },
    ],
    rows: rows.map((row) => ({
      orderNumber: row.orderNumber,
      customerName: row.customerName || "—",
      platform: row.platform,
      orderStatus: ORDER_STATUS_LABEL[row.orderStatus],
      amount: row.amount,
    })),
  }
}

// Mirrors OrdersAggregationService's OrdersSummaryStats (orders/service.ts).
interface OrdersSummaryStats {
  totalOrders: number
  totalOrdersChangePct: number | null
  previousTotalOrders: number
  totalSales: number
  totalSalesChangePct: number | null
  previousTotalSales: number
  averageOrderValue: number
  averageOrderValueChangePct: number | null
  previousAverageOrderValue: number
  decomposition: RevenueDecomposition
}

function kpiCardsFromOrdersSummary(summary: OrdersSummaryStats): KpiCard[] {
  return [
    {
      type: "kpi",
      title: "إجمالي المبيعات",
      value: summary.totalSales,
      previousValue: summary.previousTotalSales,
      changePercent: summary.totalSalesChangePct,
      trend: trend(summary.totalSalesChangePct),
      format: "currency",
    },
    {
      type: "kpi",
      title: "عدد الطلبات",
      value: summary.totalOrders,
      previousValue: summary.previousTotalOrders,
      changePercent: summary.totalOrdersChangePct,
      trend: trend(summary.totalOrdersChangePct),
      format: "number",
    },
    {
      type: "kpi",
      title: "متوسط قيمة الطلب",
      value: summary.averageOrderValue,
      previousValue: summary.previousAverageOrderValue,
      changePercent: summary.averageOrderValueChangePct,
      trend: trend(summary.averageOrderValueChangePct),
      format: "currency",
    },
  ]
}

// Same framing as driverFindingsFromPosDecomposition -- same decomposeRevenueChange output,
// now reused for e-commerce (Analysis Orchestration audit section 4/15: e-commerce had the raw
// before/after numbers but never decomposed WHY sales moved).
function driverFindingsFromOrdersDecomposition(summary: OrdersSummaryStats): DriverFinding[] {
  const decomposition = summary.decomposition
  if (decomposition.dominantDriver === "none") return []
  const ordersIsPrimary =
    (decomposition.orderEffectPercent ?? 0) >= (decomposition.aovEffectPercent ?? 0)
  return [
    {
      metric: "orders",
      role: ordersIsPrimary ? "primary" : "secondary",
      direction: decomposition.orderEffect >= 0 ? "up" : "down",
      changePercent: summary.totalOrdersChangePct,
      statement: `${ordersIsPrimary ? "العامل الأساسي" : "عامل إضافي"} في تغيّر المبيعات هو عدد الطلبات (${decomposition.orderEffectPercent ?? 0}% من إجمالي التغيّر).`,
      evidence: [
        {
          metric: "orders",
          current: summary.totalOrders,
          previous: summary.previousTotalOrders,
          changePercent: summary.totalOrdersChangePct,
        },
      ],
      confidence: "medium",
    },
    {
      metric: "aov",
      role: ordersIsPrimary ? "secondary" : "primary",
      direction: decomposition.aovEffect >= 0 ? "up" : "down",
      changePercent: summary.averageOrderValueChangePct,
      statement: `${ordersIsPrimary ? "عامل إضافي" : "العامل الأساسي"} في تغيّر المبيعات هو متوسط قيمة الطلب (${decomposition.aovEffectPercent ?? 0}% من إجمالي التغيّر).`,
      evidence: [
        {
          metric: "aov",
          current: summary.averageOrderValue,
          previous: summary.previousAverageOrderValue,
          changePercent: summary.averageOrderValueChangePct,
        },
      ],
      confidence: "medium",
    },
  ]
}

// Mirrors StoresAggregationService's StoreSummary (stores/service.ts).
interface StoreRow {
  id: string
  name: string
  platform: string
  connectionStatus: "pending" | "connected" | "paused" | "disconnected" | "error"
  orderCount: number
  lastSyncAt: string | null
}

const STORE_CONNECTION_STATUS_LABEL: Record<StoreRow["connectionStatus"], string> = {
  pending: "قيد الانتظار",
  connected: "متصل",
  paused: "متوقف مؤقتًا",
  disconnected: "غير متصل",
  error: "خطأ في الاتصال",
}

function tableFromStores(rows: StoreRow[], timezone: string): ReportTable {
  return {
    title: "المتاجر المتصلة",
    columns: [
      { key: "name", label: "المتجر", format: "text" },
      { key: "platform", label: "المنصة", format: "text" },
      { key: "connectionStatus", label: "حالة الاتصال", format: "status" },
      { key: "orderCount", label: "عدد الطلبات", format: "number" },
      { key: "lastSyncAt", label: "آخر مزامنة", format: "datetime" },
    ],
    rows: rows.map((row) => ({
      name: row.name,
      platform: row.platform,
      connectionStatus: STORE_CONNECTION_STATUS_LABEL[row.connectionStatus],
      orderCount: row.orderCount,
      lastSyncAt: row.lastSyncAt ? formatDateTime(row.lastSyncAt, timezone) : null,
    })),
  }
}

function insightsFromScalingSignals(signals: CampaignScalingSignal[]): Insight[] {
  return signals
    .filter((s) => s.signal !== "insufficient_data" && s.signal !== "neutral")
    .map((s) => ({
      statement: `${s.campaignName}: إشارة ${s.signal === "strong_positive" ? "إيجابية قوية" : s.signal === "positive" ? "إيجابية" : "سلبية"} (ROAS مقارنة بالحساب: ${s.roasVsAccountPercent ?? "—"}%, CPA: ${s.cpaVsAccountPercent ?? "—"}%).`,
      relatedMetrics: ["roas", "cpa"],
      confidence: s.confidence,
    }))
}

// Data-quality layer (audit section 14/4): a channel's own stale-sync state was already computed
// by getFreshness() but silently dropped before reaching the UI -- surfaced here instead of
// leaving the user to assume a stale number is live.
function warningsFromFreshness(freshness: ChannelFreshness[]): DataQualityWarning[] {
  return freshness
    .filter((f) => f.connected && f.isStale)
    .map((f) => ({
      type: "stale_sync" as const,
      message: `بيانات ${f.channel} لم تتم مزامنتها منذ ${f.minutesSinceSync ?? "فترة غير معروفة"} دقيقة، وقد لا تعكس أحدث الأرقام.`,
    }))
}

// Audit section 5: the current/previous period arithmetic was already fair (precedingPeriod
// mirrors the exact elapsed-day span -- see shared/analytics-rules.ts's own comment), but nothing
// ever told the user that. This is the one piece that was actually missing: an explicit note when
// the current period hasn't finished yet, so "this month" at 3 days in doesn't silently read like
// a full-month comparison.
function periodIncompleteWarning(
  current: { from: string; to: string },
  timezone: string
): DataQualityWarning | null {
  const note = describePeriodFairness(current, timezone)
  if (!note.isCurrentPeriodIncomplete) return null
  return {
    type: "incomplete_period",
    message: `الفترة الحالية لم تكتمل بعد (${note.elapsedDays} ${note.elapsedDays === 1 ? "يوم" : "أيام"} فقط) -- تمت مقارنتها بنفس عدد الأيام من الفترة السابقة لضمان مقارنة عادلة.`,
  }
}

// Mirrors pos/sales-analytics-engine.ts's PosSalesPerformanceAnalysis/PosSalesComparisonResult --
// reproduced structurally for the same reason as the other Mirrors-X-Service interfaces above.
interface PosSalesSnapshot {
  revenue: number
  orders: number
  aov: number
}
interface PosRevenueDecomposition {
  orderEffect: number
  aovEffect: number
  orderEffectPercent: number | null
  aovEffectPercent: number | null
  dominantDriver: "orders" | "aov" | "both" | "none"
}
interface PosSalesComparisonResult {
  period: { current: { from: string; to: string }; previous: { from: string; to: string } }
  current: PosSalesSnapshot
  previous: PosSalesSnapshot
  revenueChangePercent: number | null
  ordersChangePercent: number | null
  aovChangePercent: number | null
  decomposition: PosRevenueDecomposition
  confidence: ConfidenceLevel
  periodFairness: { isCurrentPeriodIncomplete: boolean; elapsedDays: number }
}
interface PosSalesPerformanceAnalysis {
  comparison: PosSalesComparisonResult
  productContributions: Array<{
    productName: string
    currentRevenue: number
    previousRevenue: number
    revenueDelta: number
  }>
}

function kpiCardsFromPosComparison(comparison: PosSalesComparisonResult): KpiCard[] {
  return [
    {
      type: "kpi",
      title: "الإيرادات",
      value: comparison.current.revenue,
      previousValue: comparison.previous.revenue,
      changePercent: comparison.revenueChangePercent,
      trend: trend(comparison.revenueChangePercent),
      format: "currency",
    },
    {
      type: "kpi",
      title: "عدد الطلبات",
      value: comparison.current.orders,
      previousValue: comparison.previous.orders,
      changePercent: comparison.ordersChangePercent,
      trend: trend(comparison.ordersChangePercent),
      format: "number",
    },
    {
      type: "kpi",
      title: "متوسط قيمة الطلب",
      value: comparison.current.aov,
      previousValue: comparison.previous.aov,
      changePercent: comparison.aovChangePercent,
      trend: trend(comparison.aovChangePercent),
      format: "currency",
    },
  ]
}

// The core "don't stop at invoice count dropped" fix (audit section 6/19): names which factor --
// order volume, average order value, or both -- explains most of the measured revenue change,
// backed by the exact decomposition in shared/analytics-rules.ts. Hedged ("the largest measured
// contributor"), never a causal claim.
function insightFromPosDecomposition(decomposition: PosRevenueDecomposition): Insight[] {
  if (decomposition.dominantDriver === "none") return []
  const label =
    decomposition.dominantDriver === "orders"
      ? "تغيّر عدد الطلبات"
      : decomposition.dominantDriver === "aov"
        ? "تغيّر متوسط قيمة الطلب"
        : "تغيّر عدد الطلبات ومتوسط قيمة الطلب معًا"
  const share =
    decomposition.dominantDriver === "orders"
      ? decomposition.orderEffectPercent
      : decomposition.dominantDriver === "aov"
        ? decomposition.aovEffectPercent
        : null
  return [
    {
      statement:
        decomposition.dominantDriver === "both"
          ? `أكبر عامل مقاس في تغيّر الإيرادات هو ${label}، إذ ساهم كل منهما بنسبة متقاربة من إجمالي التغيّر.`
          : `أكبر عامل مقاس في تغيّر الإيرادات هو ${label} (يمثل نحو ${share}% من إجمالي التغيّر).`,
      relatedMetrics: ["revenue", "orders", "aov"],
      confidence: "medium",
    },
  ]
}

// Typed counterpart of insightFromPosDecomposition -- same decomposeRevenueChange output, same
// dominant/secondary framing, just structured instead of flattened into one sentence (Analysis
// Orchestration audit section 7/11/12). Always returns BOTH factors (never just the dominant
// one) so a frontend can show "orders: primary driver / AOV: secondary driver" side by side.
function driverFindingsFromPosDecomposition(
  decomposition: PosRevenueDecomposition,
  comparison: PosSalesComparisonResult
): DriverFinding[] {
  if (decomposition.dominantDriver === "none") return []
  const ordersIsPrimary =
    (decomposition.orderEffectPercent ?? 0) >= (decomposition.aovEffectPercent ?? 0)
  return [
    {
      metric: "orders",
      role: ordersIsPrimary ? "primary" : "secondary",
      direction: decomposition.orderEffect >= 0 ? "up" : "down",
      changePercent: comparison.ordersChangePercent,
      statement: `${ordersIsPrimary ? "العامل الأساسي" : "عامل إضافي"} في تغيّر الإيرادات هو عدد الطلبات (${decomposition.orderEffectPercent ?? 0}% من إجمالي التغيّر).`,
      evidence: [
        {
          metric: "orders",
          current: comparison.current.orders,
          previous: comparison.previous.orders,
          changePercent: comparison.ordersChangePercent,
        },
      ],
      confidence: comparison.confidence,
    },
    {
      metric: "aov",
      role: ordersIsPrimary ? "secondary" : "primary",
      direction: decomposition.aovEffect >= 0 ? "up" : "down",
      changePercent: comparison.aovChangePercent,
      statement: `${ordersIsPrimary ? "عامل إضافي" : "العامل الأساسي"} في تغيّر الإيرادات هو متوسط قيمة الطلب (${decomposition.aovEffectPercent ?? 0}% من إجمالي التغيّر).`,
      evidence: [
        {
          metric: "aov",
          current: comparison.current.aov,
          previous: comparison.previous.aov,
          changePercent: comparison.aovChangePercent,
        },
      ],
      confidence: comparison.confidence,
    },
  ]
}

// Typed counterpart of tableFromPosProductContributions -- same ranked product deltas, plus
// each one's share of the TOTAL absolute change across every contributor (section 5's "Campaign
// A contributed approximately 42% of the total decline" framing).
function contributionFindingsFromPosProducts(
  rows: PosSalesPerformanceAnalysis["productContributions"]
): ContributionFinding[] {
  const totalAbs = rows.reduce((sum, row) => sum + Math.abs(row.revenueDelta), 0)
  return rows.map((row) => ({
    label: row.productName,
    dimension: "product",
    currentValue: row.currentRevenue,
    previousValue: row.previousRevenue,
    delta: row.revenueDelta,
    contributionSharePercent:
      totalAbs === 0 ? null : Math.round((Math.abs(row.revenueDelta) / totalAbs) * 1000) / 10,
  }))
}

function tableFromPosProductContributions(
  rows: PosSalesPerformanceAnalysis["productContributions"]
): ReportTable {
  return {
    title: "المنتجات الأكثر تأثرًا بالتغيّر",
    columns: [
      { key: "productName", label: "المنتج", format: "text" },
      { key: "currentRevenue", label: "الإيرادات الحالية", format: "currency" },
      { key: "previousRevenue", label: "الإيرادات السابقة", format: "currency" },
      { key: "revenueDelta", label: "التغيّر", format: "currency" },
    ],
    rows: rows.map((row) => ({
      productName: row.productName,
      currentRevenue: row.currentRevenue,
      previousRevenue: row.previousRevenue,
      revenueDelta: row.revenueDelta,
    })),
  }
}

// Deterministic, templated per tool -- never an LLM-authored "anything else?" (audit section 17's
// explicit "do not generate generic questions"). Each entry only fires for tools that actually ran
// this turn, and a couple of templates fold in a real value from that tool's own output (the
// declining campaign's name, the dominant driver) so the suggestion reads as genuinely contextual.
const FOLLOW_UP_TEMPLATES: Partial<Record<string, (output: unknown) => string[]>> = {
  compare_campaign_periods: () => [
    "ما سبب هذا التغيير؟",
    "ما هي أفضل الحملات أداءً خلال هذه الفترة؟",
    "قارن هذه الفترة مع نفس الفترة من الشهر الماضي.",
  ],
  get_campaign_declines: (output) => {
    const rows = output as CampaignDeclineRow[]
    const top = rows[0]?.name
    return [
      top ? `لماذا تراجع أداء حملة "${top}"؟` : "ما سبب هذا التراجع؟",
      "ما هي الحملات الأفضل أداءً حاليًا؟",
      "هل هناك توصيات بخصوص هذه الحملات؟",
    ]
  },
  get_top_campaigns: () => [
    "ما الذي يجعل هذه الحملات تحقق أداءً أفضل؟",
    "هل يمكن زيادة ميزانيتها؟",
  ],
  get_campaign_anomalies: () => ["ما هي أسباب هذه التغيرات المفاجئة؟", "هل هناك توصيات لمعالجتها؟"],
  get_top_selling_products: () => [
    "ما هو إجمالي المبيعات لهذه الفترة؟",
    "قارن هذه الفترة مع الفترة السابقة.",
  ],
  list_pos_shifts: () => ["ما هو إجمالي المبيعات لهذه الفترة؟", "هل هناك ورديات متأخرة الإغلاق؟"],
  list_orders: () => ["ما هي حالة المتاجر المتصلة؟", "ما هي أفضل المنتجات مبيعًا؟"],
  analyze_sales_performance: (output) => {
    const analysis = output as PosSalesPerformanceAnalysis
    const topProduct = analysis.productContributions[0]?.productName
    return [
      topProduct ? `لماذا تراجع أداء منتج "${topProduct}"؟` : "ما هي أفضل المنتجات مبيعًا؟",
      "قارن هذه الفترة مع نفس الفترة من الشهر الماضي.",
      "ما هو إجمالي المبيعات لهذه الفترة؟",
    ]
  },
}

function buildFollowUpQuestions(rawResults: RawToolResult[]): string[] {
  const questions: string[] = []
  for (const { tool, output } of rawResults) {
    const template = FOLLOW_UP_TEMPLATES[tool]
    if (!template) continue
    for (const question of template(output)) {
      if (!questions.includes(question)) questions.push(question)
    }
  }
  return questions.slice(0, 4)
}

// Mirrors PosInvoicesService's InvoiceSummary (pos/invoices-service.ts).
interface PosInvoiceSummaryResult {
  totalCount: number
  completedCount: number
  cancelledCount: number
  returnedCount: number
  averageCompletedValue: number
  totalCompletedAmount: number
}

function kpiCardsFromInvoiceSummary(result: PosInvoiceSummaryResult): KpiCard[] {
  return [
    {
      type: "kpi",
      title: "إجمالي الفواتير",
      value: result.totalCount,
      previousValue: null,
      changePercent: null,
      trend: "flat",
      format: "number",
    },
    {
      type: "kpi",
      title: "الفواتير المكتملة",
      value: result.completedCount,
      previousValue: null,
      changePercent: null,
      trend: "flat",
      format: "number",
    },
    {
      type: "kpi",
      title: "الفواتير المرتجعة",
      value: result.returnedCount,
      previousValue: null,
      changePercent: null,
      trend: "flat",
      format: "number",
    },
    {
      type: "kpi",
      title: "إجمالي المبيعات المكتملة",
      value: result.totalCompletedAmount,
      previousValue: null,
      changePercent: null,
      trend: "flat",
      format: "currency",
    },
    {
      type: "kpi",
      title: "متوسط قيمة الفاتورة",
      value: result.averageCompletedValue,
      previousValue: null,
      changePercent: null,
      trend: "flat",
      format: "currency",
    },
  ]
}

// Universal Data Intelligence audit, Step 3/4: the generic query engine's result (reports/
// query-builder.ts's executeKpi, run via run_kpi_preview) has no fixed shape the way every other
// tool here does -- it can be a single number, a single number with a period comparison, or a
// ranked breakdown, depending entirely on what the model asked for. `meta` (added alongside this
// step) is what makes a readable title possible here without the formatter re-deriving it from
// the catalog itself.
function kpiCardFromGenericResult(result: KpiResult): KpiCard {
  const title = result.meta
    ? `${result.meta.dataSourceLabel} -- ${result.meta.fieldLabel}`
    : "نتيجة الاستعلام"
  return {
    type: "kpi",
    title,
    value: result.currentValue,
    previousValue: result.previousValue,
    changePercent: result.changePercent,
    trend: trend(result.changePercent),
    format: "number",
  }
}

// Universal Data Intelligence "Next Level" audit, Section 6: run_kpi_preview's generic
// contribution/driver mode (groupByDimension + compareEnabled together -- see query-builder.ts's
// executeKpi) attaches each label's delta vs the preceding period purely as numeric extraValues.
// This turns the top few into the same hedged, non-causal co-occurrence language the hand-written
// identify_performance_drivers tool already uses for advertising -- never "caused"/"because of",
// only "the largest contributor to the change was" -- so the same wording convention holds
// whether the diagnostic came from a dedicated tool or the generic engine.
function insightsFromGenericContribution(result: KpiResult): Insight[] {
  const withDelta = result.points.filter((point) => point.extraValues?.delta !== undefined)
  if (withDelta.length === 0) return []
  const fieldLabel = result.meta?.fieldLabel ?? "القيمة"
  const confidence: ConfidenceLevel =
    result.sampleSize > 0 && result.sampleSize < 3 ? "low" : "medium"
  return withDelta.slice(0, 3).map((point, index) => {
    const delta = point.extraValues!.delta
    const previousValue = point.extraValues!.previousValue
    const direction = delta >= 0 ? "بارتفاع" : "بانخفاض"
    const rank = index === 0 ? "أكبر مساهم في التغيّر" : "من المساهمين أيضًا في التغيّر"
    return {
      statement: `${rank} في ${fieldLabel} هو "${point.label}" ${direction} قدره ${Math.abs(delta)} (من ${previousValue} إلى ${point.value}) -- هذا تزامن وليس بالضرورة سببًا مباشرًا.`,
      relatedMetrics: [fieldLabel],
      confidence,
    }
  })
}

// Typed counterpart of insightsFromGenericContribution -- same run_kpi_preview
// groupByDimension+compareEnabled result, same |delta| ranking, but every contributor (not just
// the top 3 narrated as prose) with its share of the total absolute change.
function contributionFindingsFromGenericResult(result: KpiResult): ContributionFinding[] {
  const withDelta = result.points.filter((point) => point.extraValues?.delta !== undefined)
  if (withDelta.length === 0) return []
  const totalAbs = withDelta.reduce((sum, point) => sum + Math.abs(point.extraValues!.delta), 0)
  return withDelta.map((point) => ({
    label: point.label,
    dimension: result.meta?.groupByDimensionLabel ?? "unknown",
    currentValue: point.value,
    previousValue: point.extraValues!.previousValue,
    delta: point.extraValues!.delta,
    contributionSharePercent:
      totalAbs === 0
        ? null
        : Math.round((Math.abs(point.extraValues!.delta) / totalAbs) * 1000) / 10,
  }))
}

function chartFromGenericResult(result: KpiResult): ChartSpec {
  const title = result.meta
    ? `${result.meta.dataSourceLabel} -- ${result.meta.fieldLabel}${
        result.meta.groupByDimensionLabel ? ` حسب ${result.meta.groupByDimensionLabel}` : ""
      }`
    : "نتيجة الاستعلام"
  return {
    type: "chart",
    chartType: "bar",
    title,
    series: [
      {
        name: result.meta?.fieldLabel ?? "value",
        data: result.points.map((point) => ({ label: point.label, value: point.value })),
      },
    ],
  }
}

// Pure, deterministic, and the ONLY place this envelope is assembled -- every field comes
// straight from a tool's already-computed return value, nothing here calls the LLM or invents a
// number. Returns null when nothing in this turn's tool calls was analytics-shaped (e.g. a plain
// get_metric_definitions lookup), so a trivial answer doesn't carry a pointless empty structured
// object. `timezone` is the organization's own IANA timezone (resolved once in ai-chat/service.ts
// via the existing deterministic date-resolution system) -- every date/datetime cell in a
// ReportTable is formatted against it here, never left to the LLM to compute or reformat.
export function buildStructuredResponse(
  rawResults: RawToolResult[],
  timezone: string
): StructuredAnalyticsResponse | null {
  const facts: Fact[] = []
  const insights: Insight[] = []
  const drivers: DriverFinding[] = []
  const contributions: ContributionFinding[] = []
  const recommendations: CampaignRecommendation[] = []
  const metrics: KpiCard[] = []
  const charts: ChartSpec[] = []
  const tables: ReportTable[] = []
  const warnings: DataQualityWarning[] = []
  let dataPeriod: { from: string; to: string } | null = null
  let confidence: ConfidenceLevel | null = null
  let sawAnalyticsTool = false
  let domain: string | null = null

  for (const { tool, output } of rawResults) {
    switch (tool) {
      case "get_campaign_summary": {
        sawAnalyticsTool = true
        domain = "advertising"
        const result = output as {
          metrics: Record<MetricKey, number>
          confidence: ConfidenceLevel
          freshness: ChannelFreshness[]
          queriedPeriod: { from: string; to: string } | null
        }
        metrics.push(...kpiCardsFromSnapshot(result.metrics))
        confidence = result.confidence
        warnings.push(...warningsFromFreshness(result.freshness))
        dataPeriod = dataPeriod ?? result.queriedPeriod
        break
      }
      case "compare_campaign_periods": {
        sawAnalyticsTool = true
        domain = "advertising"
        const comparison = output as PeriodComparisonResult
        facts.push(...factFromComparison(comparison))
        metrics.push(...kpiCardsFromComparison(comparison))
        dataPeriod = comparison.period.current
        confidence = comparison.confidence
        warnings.push(...warningsFromFreshness(comparison.freshness))
        const incomplete = periodIncompleteWarning(comparison.period.current, timezone)
        if (incomplete) warnings.push(incomplete)
        break
      }
      case "identify_performance_drivers": {
        sawAnalyticsTool = true
        domain = "advertising"
        const result = output as {
          comparison: PeriodComparisonResult
          drivers: PerformanceDriver[]
        }
        insights.push(...insightsFromDrivers(result.drivers))
        drivers.push(...driverFindingsFromPerformanceDrivers(result.drivers))
        dataPeriod = dataPeriod ?? result.comparison.period.current
        confidence = confidence ?? result.comparison.confidence
        break
      }
      case "generate_campaign_recommendations": {
        sawAnalyticsTool = true
        domain = "advertising"
        const result = output as { recommendations: CampaignRecommendation[] }
        recommendations.push(...result.recommendations)
        break
      }
      case "get_campaign_anomalies": {
        sawAnalyticsTool = true
        domain = "advertising"
        const anomalies = output as AnomalyFlag[]
        const derived = factsAndInsightsFromAnomalies(anomalies)
        facts.push(...derived.facts)
        insights.push(...derived.insights)
        break
      }
      case "get_campaign_scaling_signals": {
        sawAnalyticsTool = true
        domain = "advertising"
        insights.push(...insightsFromScalingSignals(output as CampaignScalingSignal[]))
        break
      }
      case "get_channel_comparison": {
        sawAnalyticsTool = true
        domain = "advertising"
        const rows = output as ChannelComparisonRow[]
        if (rows.length > 0) charts.push(chartFromChannelComparison(rows))
        break
      }
      case "get_channel_spend_trend": {
        sawAnalyticsTool = true
        domain = "advertising"
        const result = output as {
          items: ChannelSpendTrendPoint[]
          queriedPeriod: { from: string; to: string } | null
        }
        dataPeriod = dataPeriod ?? result.queriedPeriod
        if (result.items.length > 0) charts.push(chartFromSpendTrend(result.items))
        break
      }
      case "get_top_campaigns": {
        sawAnalyticsTool = true
        domain = "advertising"
        const rows = output as CampaignRow[]
        if (rows.length > 0)
          charts.push(chartFromCampaignRows(rows, "revenue", "أفضل الحملات -- الإيرادات"))
        break
      }
      case "get_campaign_declines": {
        sawAnalyticsTool = true
        domain = "advertising"
        const rows = output as CampaignDeclineRow[]
        if (rows.length > 0) charts.push(chartFromCampaignRows(rows, "roas", "الحملات المتراجعة"))
        break
      }
      case "get_top_selling_products": {
        sawAnalyticsTool = true
        domain = "pos"
        const rows = output as TopProductRow[]
        if (rows.length > 0) charts.push(chartFromTopProducts(rows))
        break
      }
      case "list_pos_shifts": {
        sawAnalyticsTool = true
        domain = "pos"
        const rows = output as ShiftRow[]
        if (rows.length > 0) tables.push(tableFromShifts(rows, timezone))
        break
      }
      case "analyze_sales_performance": {
        sawAnalyticsTool = true
        domain = "pos"
        const analysis = output as PosSalesPerformanceAnalysis
        metrics.push(...kpiCardsFromPosComparison(analysis.comparison))
        insights.push(...insightFromPosDecomposition(analysis.comparison.decomposition))
        drivers.push(
          ...driverFindingsFromPosDecomposition(
            analysis.comparison.decomposition,
            analysis.comparison
          )
        )
        if (analysis.productContributions.length > 0) {
          tables.push(tableFromPosProductContributions(analysis.productContributions))
          contributions.push(...contributionFindingsFromPosProducts(analysis.productContributions))
        }
        dataPeriod = analysis.comparison.period.current
        confidence = analysis.comparison.confidence
        if (analysis.comparison.periodFairness.isCurrentPeriodIncomplete) {
          const days = analysis.comparison.periodFairness.elapsedDays
          warnings.push({
            type: "incomplete_period",
            message: `الفترة الحالية لم تكتمل بعد (${days} ${days === 1 ? "يوم" : "أيام"} فقط) -- تمت مقارنتها بنفس عدد الأيام من الفترة السابقة لضمان مقارنة عادلة.`,
          })
        }
        break
      }
      case "get_pos_invoices_summary": {
        sawAnalyticsTool = true
        domain = "pos"
        const result = output as PosInvoiceSummaryResult & {
          queriedPeriod: { from: string; to: string } | null
        }
        metrics.push(...kpiCardsFromInvoiceSummary(result))
        dataPeriod = dataPeriod ?? result.queriedPeriod
        break
      }
      case "list_orders": {
        sawAnalyticsTool = true
        domain = "ecommerce"
        const result = output as {
          items: OrderRow[]
          summary: OrdersSummaryStats
          queriedPeriod: { from: string; to: string } | null
          periodFairness?: { isCurrentPeriodIncomplete: boolean; elapsedDays: number }
        }
        dataPeriod = dataPeriod ?? result.queriedPeriod
        if (result.items.length > 0) tables.push(tableFromOrders(result.items))
        metrics.push(...kpiCardsFromOrdersSummary(result.summary))
        drivers.push(...driverFindingsFromOrdersDecomposition(result.summary))
        if (result.periodFairness?.isCurrentPeriodIncomplete) {
          const days = result.periodFairness.elapsedDays
          warnings.push({
            type: "incomplete_period",
            message: `الفترة الحالية لم تكتمل بعد (${days} ${days === 1 ? "يوم" : "أيام"} فقط) -- تمت مقارنتها بنفس عدد الأيام من الفترة السابقة لضمان مقارنة عادلة.`,
          })
        }
        break
      }
      case "list_stores": {
        sawAnalyticsTool = true
        domain = "ecommerce"
        const rows = output as StoreRow[]
        if (rows.length > 0) tables.push(tableFromStores(rows, timezone))
        break
      }
      case "run_kpi_preview": {
        sawAnalyticsTool = true
        const result = output as KpiResult
        domain = result.meta?.application ?? domain ?? "madarApps"
        dataPeriod = dataPeriod ?? result.meta?.queriedPeriod ?? null
        // A grouped breakdown (groupByDimension was set) is a ranked comparison -- a bar chart,
        // same as every other ranking tool here. A single aggregate (with or without a period
        // comparison) is a KPI card. Never both: the model asked for one or the other.
        if (result.points.length > 1) {
          charts.push(chartFromGenericResult(result))
          insights.push(...insightsFromGenericContribution(result))
          contributions.push(...contributionFindingsFromGenericResult(result))
        } else {
          metrics.push(kpiCardFromGenericResult(result))
        }
        // previousValue is only ever set when compareEnabled fired (executeKpi ignores
        // compareEnabled whenever groupByDimension is set) -- same scope periodIncompleteWarning
        // already has for compare_campaign_periods: a single, uncompared period isn't a fairness
        // question, only a comparison is.
        if (result.previousValue !== null && result.meta?.queriedPeriod) {
          const incomplete = periodIncompleteWarning(result.meta.queriedPeriod, timezone)
          if (incomplete) warnings.push(incomplete)
        }
        // A generic, conservative floor -- this is a much cruder signal than the multi-dimension
        // confidence engines elsewhere (see KpiResult.sampleSize's own comment), so the threshold
        // stays deliberately low: this only ever fires for a result genuinely too thin to rank or
        // trust, not a borderline one.
        if (result.sampleSize > 0 && result.sampleSize < 3) {
          warnings.push({
            type: "insufficient_sample",
            message: `هذه النتيجة محسوبة من ${result.sampleSize} ${result.sampleSize === 1 ? "سجل فقط" : "سجلات فقط"} -- قد لا تكون كافية لإعطاء استنتاج موثوق.`,
          })
        }
        break
      }
      default:
        break
    }
  }

  if (!sawAnalyticsTool) return null

  if (confidence === "insufficient") {
    warnings.push({
      type: "insufficient_sample",
      message: "حجم البيانات المتاحة صغير جدًا لإعطاء نتيجة موثوقة لهذا السؤال.",
    })
  }

  return {
    type: "analytics_response",
    facts,
    insights,
    drivers,
    contributions,
    recommendations,
    metrics,
    charts,
    tables,
    warnings,
    followUpQuestions: buildFollowUpQuestions(rawResults),
    dataPeriod,
    source: domain ? { domain } : null,
    confidence,
  }
}
