"use client"

// الطلبات -- every order synced from a connected storefront (Salla/Shopify/Zid), aggregated live
// by OrdersAggregationService (see identity-platform/orders/service.ts). Real data end to end:
// listOrders()/getOrderDetail() hit GET /v1/orders and GET /v1/orders/:id/details, no mock arrays
// anywhere on this page.
//
// Two honest simplifications, since the underlying data genuinely doesn't have more to give:
// - "حالة الدفع" shows the real payment STATUS (paid/pending/refunded) a storefront order
//   actually carries -- there is no real payment METHOD (cash/card/Apple Pay/etc.) synced for a
//   storefront order today, so this column is deliberately a status, not a method.
// - The products cell shows a generic package icon per line, not a real product photo -- the
//   list endpoint only returns each item's name/quantity; a real thumbnail only exists on the
//   separate, on-demand order-detail endpoint opened via "عرض المنتجات".

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  Globe,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Receipt,
  RotateCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { cairo } from "@/components/design/fonts"
import { ROUTES } from "@/constants/routes"
import { localeDirection, type Locale } from "@/i18n/locales"
import {
  orderListService,
  type OrderDetail,
  type OrderItemRecord,
  type OrderRecord,
  type OrdersSummary,
} from "@/features/orders/services/order-list.service"

import { AppDateRangeFilter, AppSearchableSelect } from "@/components/app"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { DateRange } from "react-day-picker"

const PANEL = "rounded-[14px] border border-[#e1e7f0] bg-white"
const HEADING = "text-[#0b1738]"
const MUTED = "text-[#6b7b96]"
const FILTER_TRIGGER_CLASS =
  "h-10 w-[184px] rounded-[10px] border-[#e1e7f0] bg-white text-[12.5px] text-[#0b1738]"
const PAGER_BUTTON_CLASS =
  "flex size-9 cursor-pointer items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:text-[#0b1738] disabled:cursor-not-allowed disabled:opacity-40"

function amountFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatAmount(value: number, locale: Locale): string {
  return `${amountFormatter(locale).format(value)} ${locale === "ar" ? "ر.س" : "SAR"}`
}

function dateTimeFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
function formatDateTime(value: string, locale: Locale): string {
  return dateTimeFormatter(locale).format(new Date(value))
}

type OrdersTranslator = ReturnType<typeof useTranslations<"orders">>

function getOrderStatusMeta(
  t: OrdersTranslator
): Record<OrderRecord["orderStatus"], { label: string; className: string }> {
  return {
    Completed: { label: t("status.completed"), className: "bg-[#e9f8ef] text-[#1f9d55]" },
    Processing: { label: t("status.processing"), className: "bg-[#fff3e3] text-[#e08b00]" },
    Cancelled: { label: t("status.cancelled"), className: "bg-[#fdeeee] text-[#e0484d]" },
    Refunded: { label: t("status.refunded"), className: "bg-[#f3eeff] text-[#8b5cf6]" },
  }
}

// Real payment STATUS, not a method -- see the module comment above.
function getPaymentStatusMeta(
  t: OrdersTranslator
): Record<OrderRecord["paymentStatus"], { label: string; className: string }> {
  return {
    Paid: { label: t("paymentStatus.paid"), className: "bg-[#e9f8ef] text-[#1f9d55]" },
    Pending: { label: t("paymentStatus.pending"), className: "bg-[#fff3e3] text-[#e08b00]" },
    Refunded: { label: t("paymentStatus.refunded"), className: "bg-[#f3eeff] text-[#8b5cf6]" },
  }
}

const PLATFORM_TINT: Record<OrderRecord["platform"], string> = {
  Salla: "bg-[#e9f8ef] text-[#1f9d55]",
  Shopify: "bg-[#e9f8ef] text-[#1f9d55]",
  Zid: "bg-[#eef4ff] text-[#2878ff]",
  Madar: "bg-[#f3eeff] text-[#8b5cf6]",
}

function PlatformIcon({ platform }: { platform: OrderRecord["platform"] }) {
  if (platform === "Shopify") return <ShoppingBag className="size-3.5" />
  if (platform === "Zid") return <Globe className="size-3.5" />
  if (platform === "Madar") return <ShoppingCart className="size-3.5" />
  return <Store className="size-3.5" />
}

// Only ever rendered for platform === "Madar" rows -- the three synced platforms have no push
// concept of their own (sallaPushStatus is undefined for them).
const PUSH_STATUS_TINT: Record<NonNullable<OrderRecord["sallaPushStatus"]>, string> = {
  not_applicable: "bg-[#f2f5fa] text-[#5b6b85]",
  pending: "bg-[#fff3e3] text-[#e08b00]",
  pushed: "bg-[#e9f8ef] text-[#1f9d55]",
  failed: "bg-[#fdeeee] text-[#e0484d]",
}

function getStatusFilterOptions(t: OrdersTranslator) {
  return [
    { value: "All Status", label: t("status.all") },
    { value: "Completed", label: t("status.completed") },
    { value: "Processing", label: t("status.processing") },
    { value: "Cancelled", label: t("status.cancelled") },
    { value: "Refunded", label: t("status.refunded") },
  ]
}
function getPaymentFilterOptions(t: OrdersTranslator) {
  return [
    { value: "All Payment", label: t("paymentStatus.all") },
    { value: "Paid", label: t("paymentStatus.paid") },
    { value: "Pending", label: t("paymentStatus.pending") },
    { value: "Refunded", label: t("paymentStatus.refunded") },
  ]
}

interface OrderKpiCardData {
  label: string
  value: string
  changePct: number | null
  icon: LucideIcon
  tone: "blue" | "green" | "violet" | "amber" | "rose"
}

const KPI_TONE_CLASSNAMES: Record<OrderKpiCardData["tone"], string> = {
  blue: "bg-[#eef4ff] text-[#2878ff]",
  green: "bg-[#e9f8ef] text-[#1f9d55]",
  violet: "bg-[#f3eeff] text-[#8b5cf6]",
  amber: "bg-[#fff3e3] text-[#e08b00]",
  rose: "bg-[#fdeeee] text-[#e0484d]",
}

function formatChangePct(value: number | null): string | null {
  if (value === null) return null
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function OrderKpiCard({ kpi }: { kpi: OrderKpiCardData }) {
  const t = useTranslations("orders")
  const Icon = kpi.icon
  const changeLabel = formatChangePct(kpi.changePct)

  return (
    <div className={cn(PANEL, "p-4")}>
      {/* RTL: the label/value block is written first so it lands on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[12px] leading-[18px]", MUTED)}>{kpi.label}</p>
          <p className={cn("mt-1.5 text-[22px] font-extrabold leading-tight", HEADING)}>
            {kpi.value}
          </p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[12px]",
            KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>

      {changeLabel ? (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
              (kpi.changePct ?? 0) >= 0
                ? "bg-[#e9f8ef] text-[#1f9d55]"
                : "bg-[#fdeeee] text-[#e0484d]"
            )}
          >
            {(kpi.changePct ?? 0) >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {changeLabel}
          </span>
          <span className={cn("text-[10.5px]", MUTED)}>{t("kpis.comparedToPreviousPeriod")}</span>
        </div>
      ) : (
        <p className={cn("mt-3 text-[10.5px]", MUTED)}>{t("kpis.currentPeriod")}</p>
      )}
    </div>
  )
}

function ProductsCell({ items, productCount }: { items: OrderItemRecord[]; productCount: number }) {
  if (items.length === 0) {
    return <span className={cn("text-[12px]", MUTED)}>—</span>
  }

  const shown = items.slice(0, 2)
  const extra = items.length - shown.length

  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className="flex items-center -space-x-2 [direction:ltr]">
        {shown.map((item, index) => (
          <span
            key={`${item.name}-${index}`}
            title={`${item.name} × ${item.quantity}`}
            className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#eef4ff] text-[#2878ff]"
          >
            <Package className="size-3.5" />
          </span>
        ))}
      </div>
      {extra > 0 ? (
        <span className="rounded-full bg-[#f2f5fa] px-1.5 py-0.5 text-[10.5px] font-bold text-[#5b6b85]">
          +{extra}
        </span>
      ) : null}
      <span className={cn("text-[11px]", MUTED)}>({productCount})</span>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: keyof typeof KPI_TONE_CLASSNAMES
}) {
  return (
    <div className="rounded-[10px] border border-[#e8edf3] bg-[#f7f9fc] p-3 text-center">
      <span
        className={cn(
          "mx-auto mb-2 flex size-7 items-center justify-center rounded-[8px]",
          KPI_TONE_CLASSNAMES[tone]
        )}
      >
        <Wallet className="size-3.5" />
      </span>
      <p className={cn("text-[11px]", MUTED)}>{label}</p>
      <p className={cn("text-[13px] font-bold tabular-nums", HEADING)}>{value}</p>
    </div>
  )
}

function OrderProductsDialog({
  order,
  onClose,
}: {
  order: OrderRecord | null
  onClose: () => void
}) {
  const t = useTranslations("orders")
  const locale = useLocale() as Locale
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailLoadFailed, setDetailLoadFailed] = useState(false)

  useEffect(() => {
    if (!order) return
    let cancelled = false

    async function loadOrderDetail(orderId: string) {
      setIsLoadingDetail(true)
      setDetailLoadFailed(false)
      setDetail(null)
      try {
        const result = await orderListService.getOrderDetail(orderId)
        if (!cancelled) setDetail(result)
      } catch (error) {
        // Falls back to the already-synced name+quantity list below rather than showing
        // nothing -- expected for platforms without a live order-detail integration yet.
        console.error("Failed to load order line items", error)
        if (!cancelled) setDetailLoadFailed(true)
      } finally {
        if (!cancelled) setIsLoadingDetail(false)
      }
    }

    void loadOrderDetail(order.id)
    return () => {
      cancelled = true
    }
  }, [order])

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col sm:max-w-[36rem]",
          locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
        )}
      >
        <DialogHeader className="text-right">
          <DialogTitle className={cn("text-[15px] font-extrabold", HEADING)}>
            {t("dialog.titleWithNumber", { orderNumber: order?.orderNumber ?? "" })}
          </DialogTitle>
          <DialogDescription className={cn("text-[12px]", MUTED)}>
            {order?.customerName ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pe-1">
          {isLoadingDetail ? (
            <div className={cn("flex items-center justify-center gap-2 py-10 text-[13px]", MUTED)}>
              <Loader2 className="size-4 animate-spin" />
              {t("dialog.loadingDetails")}
            </div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <SummaryStat
                  label={t("dialog.summaryTotal")}
                  value={formatAmount(detail.total, locale)}
                  tone="blue"
                />
                <SummaryStat
                  label={t("dialog.summaryDiscount")}
                  value={formatAmount(detail.discountTotal, locale)}
                  tone="green"
                />
                <SummaryStat
                  label={t("dialog.summaryTax")}
                  value={formatAmount(detail.taxTotal, locale)}
                  tone="violet"
                />
                <SummaryStat
                  label={t("dialog.summaryProductCount")}
                  value={String(detail.items.length)}
                  tone="amber"
                />
              </div>

              <div className="overflow-hidden rounded-[10px] border border-[#e8edf3]">
                <table className="w-full text-center">
                  <thead>
                    <tr className="bg-[#f7f9fc]">
                      {[
                        t("dialog.columnProduct"),
                        t("dialog.columnSku"),
                        t("dialog.columnUnitPrice"),
                        t("dialog.columnQuantity"),
                        t("dialog.columnTotal"),
                      ].map((label) => (
                        <th
                          key={label}
                          className={cn(
                            "border-b border-[#e8edf3] px-2.5 py-2.5 text-[11px] font-semibold",
                            MUTED
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => (
                      <tr key={item.id} className="border-b border-[#f0f3f8] last:border-0">
                        <td className="px-2.5 py-2.5 text-right">
                          <div className="flex items-center gap-2">
                            {item.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.thumbnail}
                                alt={item.name}
                                className="size-8 shrink-0 rounded-[8px] border border-[#e8edf3] object-cover"
                              />
                            ) : (
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f2f5fa] text-[#95a4bd]">
                                <Package className="size-4" />
                              </span>
                            )}
                            <span className={cn("text-[12.5px] font-semibold", HEADING)}>
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td className={cn("px-2.5 py-2.5 text-[12px]", MUTED)}>
                          {item.sku ?? "—"}
                        </td>
                        <td className={cn("px-2.5 py-2.5 text-[12px] tabular-nums", HEADING)}>
                          {item.unitPrice === null ? "—" : formatAmount(item.unitPrice, locale)}
                        </td>
                        <td className={cn("px-2.5 py-2.5 text-[12px] tabular-nums", HEADING)}>
                          {item.quantity}
                        </td>
                        <td
                          className={cn(
                            "px-2.5 py-2.5 text-[12.5px] font-bold tabular-nums",
                            HEADING
                          )}
                        >
                          {formatAmount(item.total, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {order?.items.length === 0 ? (
                <p className={cn("text-[12.5px]", MUTED)}>{t("dialog.noDetailsForOrder")}</p>
              ) : (
                order?.items.map((item: OrderItemRecord, index: number) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex items-center justify-between rounded-[10px] border border-[#e8edf3] bg-[#f7f9fc] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Package className={cn("size-4", MUTED)} />
                      <span className={cn("text-[12.5px] font-semibold", HEADING)}>
                        {item.name}
                      </span>
                    </div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#5b6b85]">
                      × {item.quantity}
                    </span>
                  </div>
                ))
              )}
              {detailLoadFailed ? (
                <p className={cn("text-[11px]", MUTED)}>{t("dialog.pricesUnavailable")}</p>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function OrdersPage() {
  const t = useTranslations("orders")
  const locale = useLocale() as Locale
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [summary, setSummary] = useState<OrdersSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [channel, setChannel] = useState("All Channels")
  const [statusFilter, setStatusFilter] = useState("All Status")
  const [paymentFilter, setPaymentFilter] = useState("All Payment")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [viewedOrder, setViewedOrder] = useState<OrderRecord | null>(null)
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null)

  // order.id here is the "madar:<uuid>" composite id used everywhere else on this page --
  // retry-push only ever operates on the bare madar_orders.id, hence the slice.
  async function handleRetryPush(order: OrderRecord) {
    const bareId = order.id.startsWith("madar:") ? order.id.slice("madar:".length) : order.id
    setRetryingOrderId(order.id)
    try {
      const updated = await orderListService.retryPush(bareId)
      setOrders((current) =>
        current.map((candidate) =>
          candidate.id === order.id
            ? { ...candidate, sallaPushStatus: updated.sallaPushStatus }
            : candidate
        )
      )
      toast.success(t("pushStatus.retrySuccess"))
    } catch (error) {
      console.error("Failed to retry Salla push", error)
      toast.error(t("pushStatus.retryError"))
    } finally {
      setRetryingOrderId(null)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const response = await orderListService.listOrders({
          startDate: dateRange?.from?.toISOString(),
          endDate: (dateRange?.to ?? dateRange?.from)?.toISOString(),
        })
        if (!cancelled) {
          setOrders(response.items)
          setSummary(response.summary)
        }
      } catch (error) {
        console.error("Failed to load orders", error)
        if (!cancelled) setLoadError(t("loadError"))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadOrders()
    return () => {
      cancelled = true
    }
    // Only re-runs when the date range changes -- re-running on every locale toggle would
    // refetch the whole order list just from switching the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  const dynamicChannelOptions = useMemo(() => {
    const realChannels = Array.from(
      new Set(orders.map((order) => order.channel).filter((value) => value.length > 0))
    ).sort((a, b) => a.localeCompare(b))
    return ["All Channels", ...realChannels]
  }, [orders])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = `${order.orderNumber} ${order.customerName}`
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesChannel = channel === "All Channels" || order.channel === channel
      const matchesStatus = statusFilter === "All Status" || order.orderStatus === statusFilter
      const matchesPayment =
        paymentFilter === "All Payment" || order.paymentStatus === paymentFilter
      return matchesSearch && matchesChannel && matchesStatus && matchesPayment
    })
  }, [orders, search, channel, statusFilter, paymentFilter])

  const kpiCards = useMemo<OrderKpiCardData[]>(() => {
    if (!summary) return []
    const numberLocale = locale === "ar" ? "ar-SA-u-nu-latn" : "en-US"
    return [
      {
        label: t("kpis.totalOrders"),
        value: summary.totalOrders.toLocaleString(numberLocale),
        changePct: summary.totalOrdersChangePct,
        icon: ShoppingCart,
        tone: "blue",
      },
      {
        label: t("kpis.totalSales"),
        value: formatAmount(summary.totalSales, locale),
        changePct: summary.totalSalesChangePct,
        icon: Wallet,
        tone: "violet",
      },
      {
        label: t("kpis.averageOrderValue"),
        value: formatAmount(summary.averageOrderValue, locale),
        changePct: summary.averageOrderValueChangePct,
        icon: Receipt,
        tone: "blue",
      },
      {
        label: t("kpis.completedOrders"),
        value: summary.completedOrders.toLocaleString(numberLocale),
        changePct: summary.completedOrdersChangePct,
        icon: CheckCircle2,
        tone: "green",
      },
      {
        label: t("kpis.processingOrders"),
        value: summary.processingOrders.toLocaleString(numberLocale),
        changePct: summary.processingOrdersChangePct,
        icon: Clock,
        tone: "amber",
      },
      {
        label: t("kpis.cancelledOrders"),
        value: summary.cancelledOrders.toLocaleString(numberLocale),
        changePct: summary.cancelledOrdersChangePct,
        icon: XCircle,
        tone: "rose",
      },
    ]
  }, [summary, locale, t])

  const orderStatusMeta = useMemo(() => getOrderStatusMeta(t), [t])
  const paymentStatusMeta = useMemo(() => getPaymentStatusMeta(t), [t])
  const statusFilterOptions = useMemo(() => getStatusFilterOptions(t), [t])
  const paymentFilterOptions = useMemo(() => getPaymentFilterOptions(t), [t])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function exportToCSV(rows: OrderRecord[]) {
    const headers = [
      t("csv.orderNumber"),
      t("csv.date"),
      t("csv.customer"),
      t("csv.channel"),
      t("csv.productCount"),
      t("csv.amount"),
      t("csv.paymentStatus"),
      t("csv.status"),
    ]
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.orderNumber,
          formatDateTime(row.createdAt, locale),
          row.customerName,
          row.channel,
          row.productCount,
          row.amount,
          paymentStatusMeta[row.paymentStatus].label,
          row.statusLabel,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "orders.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className={cn(cairo.className, "min-h-full bg-[#f7f9fd] px-6 py-5")}
      dir={localeDirection(locale)}
    >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {/* RTL: the title block is written first so it lands on the right, actions left. */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-[#eef4ff] text-[#2878ff]">
              <ShoppingCart className="size-5" />
            </span>
            <div>
              <h1 className={cn("text-[24px] font-extrabold leading-tight", HEADING)}>
                {t("heading")}
              </h1>
              <p className={cn("mt-1.5 text-[12.5px]", MUTED)}>{t("subheading")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              className="h-11 gap-2 rounded-[10px] border-[#e1e7f0] bg-white px-4 text-[12.5px] font-semibold text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
              disabled={filteredOrders.length === 0}
              onClick={() => exportToCSV(filteredOrders)}
            >
              {t("export")}
              <Download className="size-4" />
            </Button>
            <Button
              className="h-11 gap-2 rounded-[10px] bg-[#2878ff] px-4 text-[12.5px] font-bold text-white hover:bg-[#1f63d6]"
              onClick={() => router.push(ROUTES.ordersCreate)}
            >
              <Plus className="size-4" />
              {t("newOrder")}
            </Button>
          </div>
        </div>

        <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {kpiCards.map((kpi) => (
            <OrderKpiCard key={kpi.label} kpi={kpi} />
          ))}
        </section>

        <div className={cn(PANEL, "space-y-4 p-4 md:p-5")}>
          {/* RTL: search is written first so it lands on the right, filters trail left. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-[240px]">
              <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-[#95a4bd]" />
              <Input
                placeholder={t("searchPlaceholder")}
                className="h-10 rounded-[10px] border-[#e1e7f0] bg-white pe-9 text-[12.5px] placeholder:text-[#95a4bd]"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
              />
            </div>

            <AppDateRangeFilter value={dateRange} onChange={setDateRange} />

            <AppSearchableSelect
              value={paymentFilter}
              onChange={(next) => {
                setPaymentFilter(next)
                setPage(1)
              }}
              options={paymentFilterOptions}
              triggerClassName={FILTER_TRIGGER_CLASS}
            />

            <AppSearchableSelect
              value={statusFilter}
              onChange={(next) => {
                setStatusFilter(next)
                setPage(1)
              }}
              options={statusFilterOptions}
              triggerClassName={FILTER_TRIGGER_CLASS}
            />

            <AppSearchableSelect
              value={channel}
              onChange={(next) => {
                setChannel(next)
                setPage(1)
              }}
              options={dynamicChannelOptions.map((option) => ({
                value: option,
                label: option === "All Channels" ? t("allChannels") : option,
              }))}
              triggerClassName={FILTER_TRIGGER_CLASS}
            />
          </div>

          {isLoading ? (
            <div
              className={cn(
                "flex items-center justify-center gap-2 rounded-[12px] border border-[#eef2f8] py-16 text-[12.5px]",
                MUTED
              )}
            >
              <Loader2 className="size-4 animate-spin" />
              {t("loadingOrders")}
            </div>
          ) : loadError ? (
            <div className="rounded-[12px] border border-[#f7c9ca] bg-[#fdeeee] px-4 py-8 text-center text-[12.5px] text-[#e0484d]">
              {loadError}
            </div>
          ) : paginatedOrders.length === 0 ? (
            <div className="rounded-[12px] border border-[#eef2f8] px-4 py-12 text-center">
              <p className={cn("text-[13.5px] font-bold", HEADING)}>{t("noResultsTitle")}</p>
              <p className={cn("mt-2 text-[12px]", MUTED)}>{t("noResultsHint")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-center">
                <thead>
                  <tr className="bg-[#f1f5fc]">
                    {[
                      { key: "index", label: t("table.columns.index") },
                      { key: "order", label: t("table.columns.order") },
                      { key: "date", label: t("table.columns.date") },
                      { key: "customer", label: t("table.columns.customer") },
                      { key: "products", label: t("table.columns.products") },
                      { key: "channel", label: t("table.columns.channel") },
                      { key: "amount", label: t("table.columns.amount") },
                      { key: "payment", label: t("table.columns.payment") },
                      { key: "status", label: t("table.columns.status") },
                      { key: "actions", label: t("table.columns.actions") },
                    ].map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap border-b border-[#e8edf3] px-3 py-3 text-[12px] font-semibold",
                          MUTED
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order, index) => (
                    <tr key={order.id} className="border-b border-[#f0f3f8] last:border-0">
                      <td className={cn("px-3 py-3 text-[12px]", MUTED)}>
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[12.5px] font-bold text-[#2878ff]">
                          {order.orderNumber}
                        </span>
                      </td>
                      <td className={cn("px-3 py-3 text-[12px]", MUTED)}>
                        {formatDateTime(order.createdAt, locale)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#2878ff]">
                            <User className="size-3.5" />
                          </span>
                          <span className={cn("text-[12.5px] font-semibold", HEADING)}>
                            {order.customerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ProductsCell items={order.items} productCount={order.productCount} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-full",
                              PLATFORM_TINT[order.platform]
                            )}
                          >
                            <PlatformIcon platform={order.platform} />
                          </span>
                          <span className={cn("text-[12px]", MUTED)}>{order.channel}</span>
                          {order.platform === "Madar" && order.sallaPushStatus ? (
                            <span
                              title={t(
                                `pushStatus.${order.sallaPushStatus === "not_applicable" ? "notApplicable" : order.sallaPushStatus}`
                              )}
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full",
                                PUSH_STATUS_TINT[order.sallaPushStatus]
                              )}
                            >
                              {order.sallaPushStatus === "pushed" ? (
                                <CheckCircle2 className="size-3" />
                              ) : order.sallaPushStatus === "failed" ? (
                                <AlertTriangle className="size-3" />
                              ) : order.sallaPushStatus === "pending" ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={cn("px-3 py-3 text-[12.5px] font-bold tabular-nums", HEADING)}>
                        {formatAmount(order.amount, locale)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                            paymentStatusMeta[order.paymentStatus].className
                          )}
                        >
                          {paymentStatusMeta[order.paymentStatus].label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                            orderStatusMeta[order.orderStatus].className
                          )}
                        >
                          {order.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={t("table.rowActionsAriaLabel", {
                                orderNumber: order.orderNumber,
                              })}
                              className="mx-auto flex size-8 items-center justify-center rounded-[8px] border border-[#e1e7f0] bg-white text-[#5b6b85] transition-colors hover:border-[#c4d5f0] hover:bg-[#f4f7fc]"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          {/* Radix portals this to document.body, which does not inherit the
                              page's dir. */}
                          <DropdownMenuContent
                            align="end"
                            className={cn(
                              cairo.className,
                              "w-44 rounded-[12px]",
                              locale === "ar" ? "[direction:rtl]" : "[direction:ltr]"
                            )}
                          >
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 text-[12.5px]"
                              onSelect={() => {
                                // Same next-tick defer InvoicesPage/ProductsPage use -- opening
                                // a Dialog synchronously from a DropdownMenu onSelect races both
                                // components' Radix pointer-events cleanup on <body>.
                                setTimeout(() => setViewedOrder(order), 0)
                              }}
                            >
                              <Eye className="size-4" />
                              {t("table.viewProducts")}
                            </DropdownMenuItem>
                            {order.platform === "Madar" && order.sallaPushStatus === "failed" ? (
                              <DropdownMenuItem
                                disabled={retryingOrderId === order.id}
                                className="cursor-pointer gap-2 text-[12.5px]"
                                onSelect={() => void handleRetryPush(order)}
                              >
                                <RotateCw
                                  className={cn(
                                    "size-4",
                                    retryingOrderId === order.id && "animate-spin"
                                  )}
                                />
                                {t("pushStatus.retry")}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !loadError ? (
            <div className="flex flex-col gap-3 border-t border-[#f1f4f9] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
              {/* RTL: count and page size on the right, pager on the left. */}
              <div className="flex items-center gap-3">
                <span className={cn("text-[12px]", MUTED)}>
                  {filteredOrders.length === 0
                    ? t("pagination.noResults")
                    : t("pagination.showingRange", {
                        from: (currentPage - 1) * pageSize + 1,
                        to: Math.min(currentPage * pageSize, filteredOrders.length),
                        total: filteredOrders.length,
                      })}
                </span>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[12px]", MUTED)}>{t("pagination.itemsPerPage")}</span>
                  <AppSearchableSelect
                    value={String(pageSize)}
                    onChange={(next) => {
                      setPageSize(Number(next))
                      setPage(1)
                    }}
                    options={[10, 25, 50].map((option) => ({
                      value: String(option),
                      label: String(option),
                    }))}
                    triggerClassName="h-9 w-[74px] rounded-[10px] border-[#e1e7f0] bg-white text-[12px] text-[#0b1738]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label={t("pagination.first")}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === 1}
                  aria-label={t("pagination.previous")}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
                  const pageNumber = Math.max(1, first) + index
                  if (pageNumber > totalPages) return null

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      className={cn(
                        "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-[8px] border px-2 text-[12px] font-bold transition-colors",
                        pageNumber === currentPage
                          ? "border-[#2878ff] bg-white text-[#2878ff]"
                          : "border-[#e1e7f0] bg-white text-[#5b6b85] hover:border-[#c4d5f0] hover:text-[#0b1738]"
                      )}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  )
                })}

                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("pagination.next")}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  <ChevronRight className="size-4 rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  className={PAGER_BUTTON_CLASS}
                  disabled={currentPage === totalPages}
                  aria-label={t("pagination.last")}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="size-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <OrderProductsDialog order={viewedOrder} onClose={() => setViewedOrder(null)} />
    </div>
  )
}
