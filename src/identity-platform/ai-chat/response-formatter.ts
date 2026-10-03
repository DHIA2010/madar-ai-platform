import type {
  AnomalyFlag,
  CampaignDeclineRow,
  CampaignRecommendation,
  CampaignRow,
  CampaignScalingSignal,
  ChannelComparisonRow,
  ConfidenceLevel,
  MetricKey,
  PeriodComparisonResult,
  PerformanceDriver,
} from "../campaigns/analytics-types"

import type {
  ChartSeriesPoint,
  ChartSpec,
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

function chartFromCampaignRows(
  rows: CampaignRow[] | CampaignDeclineRow[],
  metric: MetricKey,
  title: string
): ChartSpec {
  const data: ChartSeriesPoint[] = rows.map((row) => ({
    label: row.name,
    value: row.metrics[metric],
  }))
  return { type: "chart", chartType: "table", title, series: [{ name: metric, data }] }
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

// Mirrors reports/types.ts's KpiResult -- the generic whitelisted-query preview tool.
interface KpiPreviewResult {
  currentValue: number
  previousValue: number | null
  changePercent: number | null
}

function kpiCardFromPreview(result: KpiPreviewResult): KpiCard {
  return {
    type: "kpi",
    title: "نتيجة المؤشر",
    value: result.currentValue,
    previousValue: result.previousValue,
    changePercent: result.changePercent,
    trend: trend(result.changePercent),
    format: "number",
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
  const recommendations: CampaignRecommendation[] = []
  const metrics: KpiCard[] = []
  const charts: ChartSpec[] = []
  const tables: ReportTable[] = []
  let dataPeriod: { from: string; to: string } | null = null
  let confidence: ConfidenceLevel | null = null
  let sawAnalyticsTool = false
  let domain: string | null = null

  for (const { tool, output } of rawResults) {
    switch (tool) {
      case "get_campaign_summary": {
        sawAnalyticsTool = true
        domain = "advertising"
        const result = output as { metrics: Record<MetricKey, number>; confidence: ConfidenceLevel }
        metrics.push(...kpiCardsFromSnapshot(result.metrics))
        confidence = result.confidence
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
      case "get_pos_invoices_summary": {
        sawAnalyticsTool = true
        domain = "pos"
        metrics.push(...kpiCardsFromInvoiceSummary(output as PosInvoiceSummaryResult))
        break
      }
      case "list_orders": {
        sawAnalyticsTool = true
        domain = "ecommerce"
        const result = output as { items: OrderRow[] }
        if (result.items.length > 0) tables.push(tableFromOrders(result.items))
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
        domain = "madarApps"
        metrics.push(kpiCardFromPreview(output as KpiPreviewResult))
        break
      }
      default:
        break
    }
  }

  if (!sawAnalyticsTool) return null

  return {
    type: "analytics_response",
    facts,
    insights,
    recommendations,
    metrics,
    charts,
    tables,
    dataPeriod,
    source: domain ? { domain } : null,
    confidence,
  }
}
