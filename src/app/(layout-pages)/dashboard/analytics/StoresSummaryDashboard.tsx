"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Loader2, Package, Receipt, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

import { AppDateRangeFilter } from "@/components/app"
import {
  orderListService,
  type OrderRecord,
  type StoreSalesRecord,
} from "@/features/orders/services/order-list.service"
import { storeListService, type StoreRecord } from "@/features/stores/services/store-list.service"
import {
  channelsPerformanceService,
  type TopProductRow,
} from "@/features/channels/services/channels-performance.service"

import {
  HEADING,
  MUTED,
  PANEL,
  ReadyReportKpiCard,
  ReadyReportTrendBadge,
} from "@/features/reports/components/ready-report-field"
import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  formatCurrencyCompact,
  TOOLTIP_STYLE,
} from "@/features/reports/components/chart-constants"

import { type Locale, localeDirection } from "@/i18n/locales"

function formatPlainNumber(value: number, locale: Locale): string {
  return value.toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function defaultRange(): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from, to }
}

// Same day-bucketing technique as channels-service.ts's own groupOrderRevenueByDay (server-side
// precedent for exactly this), just done client-side here since listOrders() already hands back
// every order in the current period -- no new backend aggregation needed for a daily series.
function bucketByDay(
  orders: OrderRecord[],
  pick: (order: OrderRecord) => number
): Array<{ date: string; value: number }> {
  const byDay = new Map<string, number>()
  for (const order of orders) {
    const day = order.createdAt.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + pick(order))
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }))
}

const STATUS_DOT: Record<StoreRecord["connectionStatus"], string> = {
  connected: "#22c55e",
  pending: "#f59e0b",
  paused: "#95a4bd",
  disconnected: "#95a4bd",
  error: "#ef4444",
}

export default function StoresSummaryDashboard() {
  const t = useTranslations("dashboard.storesSummary")
  const locale = useLocale() as Locale
  const currency = locale === "ar" ? "ر.س" : "SAR"
  const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange)
  const [trendTab, setTrendTab] = useState<"sales" | "orders">("sales")

  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [summary, setSummary] = useState<{
    totalOrders: number
    totalOrdersChangePct: number | null
    totalSales: number
    totalSalesChangePct: number | null
    averageOrderValue: number
    averageOrderValueChangePct: number | null
  } | null>(null)
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [salesByStore, setSalesByStore] = useState<StoreSalesRecord[]>([])
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      const range = dateRange?.from
        ? { from: dateRange.from, to: dateRange.to ?? dateRange.from }
        : defaultRange()
      const params = {
        startDate: range.from!.toISOString().slice(0, 10),
        endDate: range.to!.toISOString().slice(0, 10),
      }
      try {
        const [ordersRes, salesByStoreRes, storesRes, topProductsRes] = await Promise.all([
          orderListService.listOrders(params),
          orderListService.getSalesByStore(params),
          storeListService.listStores(),
          channelsPerformanceService.getTopProducts(params),
        ])
        if (cancelled) return
        setOrders(ordersRes.items)
        setSummary(ordersRes.summary)
        setSalesByStore(salesByStoreRes.items)
        setStores(storesRes)
        setTopProducts(topProductsRes.items)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [dateRange])

  const trendData = useMemo(() => {
    const points =
      trendTab === "sales"
        ? bucketByDay(orders, (order) => order.amount)
        : bucketByDay(orders, () => 1)
    return points.map((point) => ({
      ...point,
      label: new Date(point.date).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        day: "numeric",
        month: "short",
      }),
    }))
  }, [orders, trendTab, locale])

  const storesById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores])
  const totalStoreSales = salesByStore.reduce((sum, row) => sum + row.totalSales, 0)

  return (
    <div dir={localeDirection(locale)} className="flex flex-col gap-4">
      <div className={cn(PANEL, "flex flex-wrap items-center gap-3 p-4")}>
        <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {isLoading || !summary ? (
        <div className="flex items-center justify-center gap-2 p-16 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <ReadyReportKpiCard
              label={t("kpis.orderCount")}
              value={String(summary.totalOrders)}
              icon={Receipt}
              tone="blue"
              trailing={<ReadyReportTrendBadge changePercent={summary.totalOrdersChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.totalSales")}
              value={`${formatPlainNumber(summary.totalSales, locale)} ${currency}`}
              icon={Wallet}
              tone="emerald"
              trailing={<ReadyReportTrendBadge changePercent={summary.totalSalesChangePct} />}
            />
            <ReadyReportKpiCard
              label={t("kpis.avgOrderValue")}
              value={`${formatPlainNumber(summary.averageOrderValue, locale)} ${currency}`}
              icon={Package}
              tone="amber"
              trailing={
                <ReadyReportTrendBadge changePercent={summary.averageOrderValueChangePct} />
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn(PANEL, "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className={cn("text-[13.5px] font-bold", HEADING)}>{t("trendTitle")}</h3>
                <div className="flex gap-1 rounded-full bg-[#f1f4f9] p-1">
                  {(["sales", "orders"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTrendTab(key)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors",
                        trendTab === key ? "bg-white text-[#2878ff] shadow-sm" : "text-[#6b7b96]"
                      )}
                    >
                      {t(`trendTabs.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
              {trendData.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="storesTrendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2878ff" stopOpacity={0.26} />
                          <stop offset="100%" stopColor="#2878ff" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="#eef2f8" />
                      <XAxis
                        dataKey="label"
                        tick={AXIS_TICK_STYLE}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value: number) => formatCurrencyCompact(value)}
                        tick={AXIS_TICK_STYLE}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [
                          formatCurrencyCompact(value),
                          t(`trendTabs.${trendTab}`),
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#2878ff"
                        strokeWidth={2}
                        fill="url(#storesTrendFill)"
                        dot={{ r: 3, fill: "#2878ff", strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className={cn(PANEL, "p-4")}>
              <h3 className={cn("mb-3 text-[13.5px] font-bold", HEADING)}>{t("byStoreTitle")}</h3>
              {salesByStore.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {salesByStore
                    .slice()
                    .sort((left, right) => right.totalSales - left.totalSales)
                    .map((row, index) => (
                      <div key={row.connectionId} className="flex items-center gap-2 text-[12px]">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className={cn("min-w-0 flex-1 truncate font-semibold", HEADING)}>
                          {storesById.get(row.connectionId)?.name ?? row.platform}
                        </span>
                        <span className={cn("shrink-0 font-bold", HEADING)}>
                          {totalStoreSales > 0
                            ? ((row.totalSales / totalStoreSales) * 100).toFixed(0)
                            : 0}
                          %
                        </span>
                        <span className={cn("shrink-0", MUTED)}>
                          {formatPlainNumber(row.totalSales, locale)} {currency}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn(PANEL, "overflow-hidden")}>
              <div className="border-b border-[#e1e7f0] px-5 py-4">
                <h2 className={cn("text-[14.5px] font-bold", HEADING)}>{t("topProductsTitle")}</h2>
              </div>
              {topProducts.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noData")}</p>
              ) : (
                <table className="w-full text-right">
                  <tbody>
                    {topProducts.slice(0, 5).map((product, index) => (
                      <tr
                        key={`${product.name}-${index}`}
                        className="border-b border-[#f1f4f9] last:border-0"
                      >
                        <td className="w-10 px-3 py-2.5 text-center text-[12px] font-bold text-[#95a4bd]">
                          {index + 1}
                        </td>
                        <td className={cn("px-3 py-2.5 text-[12.5px] font-semibold", HEADING)}>
                          {product.name}
                        </td>
                        <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", MUTED)}>
                          {product.quantitySold}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2.5 text-[12px] font-bold",
                            HEADING
                          )}
                        >
                          {product.orders}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={cn(PANEL, "overflow-hidden")}>
              <div className="border-b border-[#e1e7f0] px-5 py-4">
                <h2 className={cn("text-[14.5px] font-bold", HEADING)}>{t("storesTableTitle")}</h2>
              </div>
              {stores.length === 0 ? (
                <p className={cn("py-10 text-center text-[12.5px]", MUTED)}>{t("noStores")}</p>
              ) : (
                <table className="w-full text-right">
                  <tbody>
                    {stores.map((store) => {
                      const sales = salesByStore.find((row) => row.connectionId === store.id)
                      return (
                        <tr key={store.id} className="border-b border-[#f1f4f9] last:border-0">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: STATUS_DOT[store.connectionStatus] }}
                              />
                              <span className={cn("text-[12.5px] font-semibold", HEADING)}>
                                {store.name}
                              </span>
                            </div>
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold",
                              MUTED
                            )}
                          >
                            {t(`status.${store.connectionStatus}`)}
                          </td>
                          <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", MUTED)}>
                            {sales?.orderCount ?? 0} {t("ordersUnit")}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2.5 text-[12.5px] font-bold",
                              HEADING
                            )}
                          >
                            {formatPlainNumber(sales?.totalSales ?? 0, locale)} {currency}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
