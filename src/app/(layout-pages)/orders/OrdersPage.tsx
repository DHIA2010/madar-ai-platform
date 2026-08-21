"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  Loader2,
  MoreVertical,
  Package,
  Receipt,
  Search,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  orderListService,
  type OrderItemRecord,
  type OrderRecord,
  type OrdersSummary,
} from "@/features/orders/services/order-list.service"

import { AppCard } from "@/components/app"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const statusOptions = ["All Status", "Completed", "Processing", "Cancelled", "Refunded"] as const
const paymentOptions = ["All Payment", "Paid", "Pending", "Refunded"] as const
const PAGE_SIZE = 8

type PeriodOption = "7" | "30" | "90" | "month"

const periodOptions: Array<{ value: PeriodOption; label: string }> = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "month", label: "This month" },
]

function periodToRange(period: PeriodOption): { startDate: string; endDate: string } {
  const end = new Date()
  if (period === "month") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1)
    return { startDate: start.toISOString(), endDate: end.toISOString() }
  }

  const days = Number(period)
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

function formatCurrency(value: number, currency: string = "SAR") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatChangePct(value: number | null): string | null {
  if (value === null) {
    return null
  }
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

interface OrderKpiCardData {
  label: string
  value: string
  changePct: number | null
  icon: LucideIcon
  tone: "blue" | "green" | "violet" | "emerald" | "amber" | "rose"
}

const ORDER_KPI_TONE_CLASSNAMES: Record<OrderKpiCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
}

function OrderKpiCard({ kpi }: { kpi: OrderKpiCardData }) {
  const Icon = kpi.icon
  const changeLabel = formatChangePct(kpi.changePct)

  return (
    <AppCard className="overflow-hidden rounded-2xl border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            ORDER_KPI_TONE_CLASSNAMES[kpi.tone]
          )}
        >
          <Icon className="size-5" />
        </div>
        {changeLabel && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              (kpi.changePct ?? 0) >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            )}
          >
            {(kpi.changePct ?? 0) >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {changeLabel}
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{kpi.value}</p>
      {changeLabel ? (
        <p className="mt-2 text-xs text-muted-foreground">vs previous period</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Current period</p>
      )}
    </AppCard>
  )
}

function getOrderStatusClasses(status: OrderRecord["orderStatus"]) {
  if (status === "Completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (status === "Processing") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (status === "Refunded") {
    return "border-violet-200 bg-violet-50 text-violet-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function getPaymentStatusClasses(status: OrderRecord["paymentStatus"]) {
  if (status === "Paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (status === "Pending") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  return "border-rose-200 bg-rose-50 text-rose-700"
}

function PlatformIcon({ platform }: { platform: OrderRecord["platform"] }) {
  if (platform === "Shopify") {
    return <ShoppingBag className="size-4" />
  }
  if (platform === "Salla") {
    return <Store className="size-4" />
  }
  if (platform === "Zid") {
    return <Globe className="size-4" />
  }
  return <Store className="size-4" />
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [summary, setSummary] = useState<OrdersSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [channel, setChannel] = useState("All Channels")
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]>("All Status")
  const [paymentFilter, setPaymentFilter] = useState<(typeof paymentOptions)[number]>("All Payment")
  const [period, setPeriod] = useState<PeriodOption>("30")
  const [viewedOrder, setViewedOrder] = useState<OrderRecord | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      setIsLoading(true)
      setLoadError(null)

      try {
        const { startDate, endDate } = periodToRange(period)
        const response = await orderListService.listOrders({ startDate, endDate })
        if (!cancelled) {
          setOrders(response.items)
          setSummary(response.summary)
        }
      } catch (error) {
        console.error("Failed to load orders", error)
        if (!cancelled) {
          setLoadError("Couldn't load orders from your connected stores. Please try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadOrders()

    return () => {
      cancelled = true
    }
  }, [period])

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
    if (!summary) {
      return []
    }

    return [
      {
        label: "Total Orders",
        value: summary.totalOrders.toLocaleString(),
        changePct: summary.totalOrdersChangePct,
        icon: Receipt,
        tone: "blue",
      },
      {
        label: "Total Sales",
        value: formatCurrency(summary.totalSales),
        changePct: summary.totalSalesChangePct,
        icon: Wallet,
        tone: "violet",
      },
      {
        label: "Average Order Value",
        value: formatCurrency(summary.averageOrderValue),
        changePct: summary.averageOrderValueChangePct,
        icon: TrendingUp,
        tone: "amber",
      },
      {
        label: "Completed Orders",
        value: summary.completedOrders.toLocaleString(),
        changePct: summary.completedOrdersChangePct,
        icon: CheckCircle2,
        tone: "emerald",
      },
      {
        label: "Processing",
        value: summary.processingOrders.toLocaleString(),
        changePct: null,
        icon: Clock,
        tone: "amber",
      },
      {
        label: "Cancelled Orders",
        value: summary.cancelledOrders.toLocaleString(),
        changePct: null,
        icon: XCircle,
        tone: "rose",
      },
    ]
  }, [summary])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  function clearFilters() {
    setSearch("")
    setChannel("All Channels")
    setStatusFilter("All Status")
    setPaymentFilter("All Payment")
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpiCards.map((kpi) => (
          <OrderKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
          <div>
            <CardTitle className="text-lg mb-0">Orders</CardTitle>
            <CardDescription>Orders across all connected stores.</CardDescription>
          </div>

          <div className="relative mb-0 w-[280px] max-w-lg">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by order # or customer..."
              className="pl-9"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <Select value={period} onValueChange={(next) => setPeriod(next as PeriodOption)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={channel} onValueChange={(next) => setChannel(next)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  {dynamicChannelOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(next) => setStatusFilter(next as (typeof statusOptions)[number])}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={paymentFilter}
                onValueChange={(next) => setPaymentFilter(next as (typeof paymentOptions)[number])}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Payment" />
                </SelectTrigger>
                <SelectContent>
                  {paymentOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-[20px] border border-border bg-card py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading orders from your connected stores...
            </div>
          ) : loadError ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-700">
              {loadError}
            </div>
          ) : (
            <div className="relative w-full overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12%] text-center">Order #</TableHead>
                    <TableHead className="w-[16%] text-center">Customer</TableHead>
                    <TableHead className="w-[14%] text-center">Channel</TableHead>
                    <TableHead className="w-[10%] text-center">Products</TableHead>
                    <TableHead className="w-[12%] text-center">Amount</TableHead>
                    <TableHead className="w-[12%] text-center">Status</TableHead>
                    <TableHead className="w-[12%] text-center">Payment</TableHead>
                    <TableHead className="w-[8%] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="w-[12%] text-center font-medium">
                        #{order.orderNumber}
                      </TableCell>
                      <TableCell className="w-[16%] text-center">{order.customerName}</TableCell>
                      <TableCell className="w-[14%] text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <PlatformIcon platform={order.platform} />
                          <span>{order.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[10%] text-center tabular-nums">
                        {order.productCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="w-[12%] text-center tabular-nums">
                        {formatCurrency(order.amount, order.currency)}
                      </TableCell>
                      <TableCell className="w-[12%] text-center">
                        <div className="flex items-center justify-center">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                              getOrderStatusClasses(order.orderStatus)
                            )}
                          >
                            {order.orderStatus}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[12%] text-center">
                        <div className="flex items-center justify-center">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                              getPaymentStatusClasses(order.paymentStatus)
                            )}
                          >
                            {order.paymentStatus}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[8%] text-center">
                        <div className="flex items-center justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setViewedOrder(order)}>
                                <Eye className="mr-2 size-4" />
                                View Products
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <div>
                {filteredOrders.length === 0
                  ? "Showing 0 of 0"
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredOrders.length)} of ${filteredOrders.length} orders`}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-border bg-muted/60 text-foreground/90 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <span className="min-w-24 text-center text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-border bg-muted/60 text-foreground/90 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewedOrder !== null} onOpenChange={(open) => !open && setViewedOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Products in order #{viewedOrder?.orderNumber ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {viewedOrder?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No product details are available for this order.
              </p>
            ) : (
              viewedOrder?.items.map((item: OrderItemRecord, index: number) => (
                <div
                  key={`${item.name}-${index}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <Badge variant="secondary">x{item.quantity}</Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
