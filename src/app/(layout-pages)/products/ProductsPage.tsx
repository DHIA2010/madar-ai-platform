"use client"

import { useMemo, useState } from "react"
import {
  addMonths,
  endOfMonth,
  format,
  getMonth,
  getYear,
  isWithinInterval,
  setMonth,
  setYear,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"
import {
  AlertTriangle,
  CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Globe,
  Package,
  Search,
  ShoppingBag,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"

import { AppCard } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Can } from "@/features/authentication/components"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type ProductStatus = "Active" | "Draft" | "Archived"

type ProductRow = {
  id: number
  name: string
  sku: string
  category: string
  status: ProductStatus
  availableStock: number
  costPrice: number
  sellingPrice: number
  platform: string
  image: string
  activityDate: string
}

const products: ProductRow[] = [
  {
    id: 1,
    name: "AirPods Pro",
    sku: "APL-APRO-241",
    category: "Electronics",
    status: "Active",
    availableStock: 245,
    costPrice: 168,
    sellingPrice: 249,
    platform: "Shopify",
    image: "/products/01.png",
    activityDate: "2026-06-04",
  },
  {
    id: 2,
    name: "Coffee Maker",
    sku: "HOM-CFMK-118",
    category: "Home & Living",
    status: "Draft",
    availableStock: 38,
    costPrice: 72,
    sellingPrice: 119,
    platform: "Salla",
    image: "/products/02.png",
    activityDate: "2026-06-07",
  },
  {
    id: 3,
    name: "Leather Wallet",
    sku: "ACC-LWLT-502",
    category: "Accessories",
    status: "Active",
    availableStock: 126,
    costPrice: 24,
    sellingPrice: 49,
    platform: "Zid",
    image: "/products/03.png",
    activityDate: "2026-06-11",
  },
  {
    id: 4,
    name: "Gaming Mouse",
    sku: "ELE-GMSE-330",
    category: "Electronics",
    status: "Archived",
    availableStock: 0,
    costPrice: 31,
    sellingPrice: 59,
    platform: "Shopify",
    image: "/products/04.png",
    activityDate: "2026-06-13",
  },
  {
    id: 5,
    name: "Running Shoes",
    sku: "FSH-RSHO-150",
    category: "Fashion",
    status: "Active",
    availableStock: 84,
    costPrice: 58,
    sellingPrice: 110,
    platform: "WooCommerce",
    image: "/products/05.png",
    activityDate: "2026-06-16",
  },
  {
    id: 6,
    name: "Smart Watch",
    sku: "ELE-SWCH-907",
    category: "Electronics",
    status: "Active",
    availableStock: 57,
    costPrice: 129,
    sellingPrice: 199,
    platform: "Salla",
    image: "/products/06.png",
    activityDate: "2026-06-18",
  },
  {
    id: 7,
    name: "Protein Powder",
    sku: "SPT-PPWD-440",
    category: "Sports",
    status: "Draft",
    availableStock: 163,
    costPrice: 19,
    sellingPrice: 34,
    platform: "Zid",
    image: "/products/07.png",
    activityDate: "2026-06-19",
  },
  {
    id: 8,
    name: "Office Chair",
    sku: "HOM-OCHR-612",
    category: "Home & Living",
    status: "Active",
    availableStock: 29,
    costPrice: 94,
    sellingPrice: 179,
    platform: "WooCommerce",
    image: "/products/08.png",
    activityDate: "2026-06-20",
  },
]

const categoryOptions = [
  "All Categories",
  "Accessories",
  "Beauty",
  "Electronics",
  "Fashion",
  "Food & Beverage",
  "Home & Living",
  "Sports",
]
const platformOptions = ["All Platforms", "Shopify", "Salla", "WooCommerce", "Zid"]
const monthOptions = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const yearOptions = Array.from({ length: 21 }, (_, index) => 2018 + index)
const PAGE_SIZE = 6

function getDateRangePresets(): Array<{ label: string; range: DateRange }> {
  const today = new Date()
  const lastMonth = subMonths(today, 1)

  return [
    { label: "Yesterday", range: { from: subDays(today, 1), to: subDays(today, 1) } },
    { label: "Last 7 Days", range: { from: subDays(today, 6), to: today } },
    { label: "Last 30 Days", range: { from: subDays(today, 29), to: today } },
    { label: "This Month", range: { from: startOfMonth(today), to: endOfMonth(today) } },
    { label: "Last Month", range: { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) } },
  ]
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

interface ProductKpiCardData {
  label: string
  value: string
  footnote: string
  icon: LucideIcon
  tone: "blue" | "green" | "rose" | "violet"
}

const PRODUCT_KPI_TONE_CLASSNAMES: Record<ProductKpiCardData["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
}

function ProductKpiCard({ kpi }: { kpi: ProductKpiCardData }) {
  const Icon = kpi.icon

  return (
    <AppCard className="overflow-hidden rounded-2xl border-border/60 bg-card p-4 shadow-sm">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          PRODUCT_KPI_TONE_CLASSNAMES[kpi.tone]
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{kpi.value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{kpi.footnote}</p>
    </AppCard>
  )
}

function getStatusClasses(status: ProductStatus) {
  if (status === "Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }

  if (status === "Draft") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  return "border-border bg-muted text-muted-foreground"
}

function getInventoryStatus(stock: number) {
  if (stock === 0) {
    return "Out of Stock"
  }

  if (stock <= 30) {
    return "Low Stock"
  }

  return "In Stock"
}

function getInventoryStatusClasses(stock: number) {
  const inventoryStatus = getInventoryStatus(stock)

  if (inventoryStatus === "In Stock") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }

  if (inventoryStatus === "Low Stock") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }

  return "border-rose-200 bg-rose-50 text-rose-700"
}

function PlatformIcon({ platform }: { platform: ProductRow["platform"] }) {
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

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from) {
    return "Date Range"
  }

  if (!range.to) {
    return format(range.from, "MMM d, yyyy")
  }

  return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange | undefined
  onChange: (next: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value?.from ?? new Date())
  const [rangeAnchor, setRangeAnchor] = useState<Date | undefined>(undefined)
  const monthIndex = getMonth(displayMonth)
  const yearValue = getYear(displayMonth)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDisplayMonth(value?.from ?? new Date())
          setRangeAnchor(value?.from && !value?.to ? value.from : undefined)
        } else {
          setRangeAnchor(undefined)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-11 min-w-[240px] justify-start rounded-2xl border border-border bg-card px-4 text-left text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors hover:border-sky-400/45 hover:bg-card"
        >
          <CalendarIcon className="mr-2 size-4 text-sky-300" />
          <span className="truncate">{formatDateRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        dir="ltr"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(23rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-sky-400/15 bg-card p-3.5 text-foreground shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <Select
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[7.75rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {monthOptions.map((monthLabel, index) => (
                  <SelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {monthLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(yearValue)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setYear(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-9 w-[6rem] rounded-full border border-border bg-muted/60 px-3 text-sm font-semibold text-foreground shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="max-h-56 rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
                sideOffset={4}
              >
                {yearOptions.map((yearOption) => (
                  <SelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-foreground focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
                  >
                    {yearOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Calendar
          mode="range"
          animate
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={(next, selectedDay) => {
            if (!selectedDay) {
              onChange(next)
              return
            }

            if (!rangeAnchor) {
              onChange({ from: selectedDay, to: undefined })
              setRangeAnchor(selectedDay)
              return
            }

            const from = selectedDay < rangeAnchor ? selectedDay : rangeAnchor
            const to = selectedDay < rangeAnchor ? rangeAnchor : selectedDay

            onChange({ from, to })
            setRangeAnchor(undefined)
            setOpen(false)
          }}
          numberOfMonths={1}
          startMonth={new Date(2018, 0)}
          endMonth={new Date(2038, 11)}
          captionLayout="label"
          formatters={{
            formatWeekdayName: (date) => format(date, "EEE"),
          }}
          className="rounded-[18px] bg-transparent p-0 [--cell-size:32px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-2",
            nav: "hidden",
            button_previous:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            button_next:
              "size-8 rounded-full border border-border bg-muted/60 text-muted-foreground transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-foreground",
            weekdays: "mb-1.5 grid grid-cols-7 gap-1.5",
            weekday:
              "h-6 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            week: "mt-1.5 grid grid-cols-7 gap-1.5",
            day: "rounded-full text-foreground",
            day_button:
              "size-8 rounded-full border border-transparent bg-transparent text-xs font-medium text-foreground transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today:
              "rounded-full border border-sky-400/60 bg-transparent text-foreground shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-foreground",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-foreground",
            range_start:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            range_end:
              "rounded-full border border-sky-300 bg-sky-400 text-foreground shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            outside: "text-muted-foreground opacity-40",
            disabled: "text-muted-foreground opacity-35",
          }}
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {getDateRangePresets().map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
              onClick={() => {
                onChange(preset.range)
                setRangeAnchor(undefined)
                setDisplayMonth(preset.range.from ?? new Date())
                setOpen(false)
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-xl border-border bg-muted/60 px-3.5 text-sm font-medium text-muted-foreground transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-foreground"
            onClick={() => {
              onChange(undefined)
              setRangeAnchor(undefined)
              setDisplayMonth(new Date())
              setOpen(false)
            }}
          >
            Clear Date
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl bg-sky-400 px-3.5 text-sm font-semibold text-foreground shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
            onClick={() => {
              const today = new Date()
              onChange({ from: today, to: today })
              setRangeAnchor(undefined)
              setDisplayMonth(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function ProductsPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState("All Categories")
  const [platform, setPlatform] = useState("All Platforms")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = `${product.name} ${product.sku} ${product.category}`
        .toLowerCase()
        .includes(search.toLowerCase())
      const matchesCategory = category === "All Categories" || product.category === category
      const matchesPlatform = platform === "All Platforms" || product.platform === platform
      const matchesDateRange =
        !dateRange?.from ||
        isWithinInterval(new Date(product.activityDate), {
          start: dateRange.from,
          end: dateRange.to ?? dateRange.from,
        })

      return matchesSearch && matchesCategory && matchesPlatform && matchesDateRange
    })
  }, [category, dateRange, platform, search])

  const productKpiCards = useMemo<ProductKpiCardData[]>(() => {
    const activeCount = filteredProducts.filter((product) => product.status === "Active").length
    const lowOrOutOfStockCount = filteredProducts.filter(
      (product) => getInventoryStatus(product.availableStock) !== "In Stock"
    ).length
    const inventoryValue = filteredProducts.reduce(
      (sum, product) => sum + product.costPrice * product.availableStock,
      0
    )

    return [
      {
        label: "Total Products",
        value: filteredProducts.length.toLocaleString(),
        footnote: "Across all connected stores",
        icon: Package,
        tone: "blue",
      },
      {
        label: "Active Products",
        value: activeCount.toLocaleString(),
        footnote: "Live and visible to customers",
        icon: CheckCircle2,
        tone: "green",
      },
      {
        label: "Low / Out of Stock",
        value: lowOrOutOfStockCount.toLocaleString(),
        footnote: "Stock at or below 30 units",
        icon: AlertTriangle,
        tone: "rose",
      },
      {
        label: "Inventory Value",
        value: formatCurrency(inventoryValue),
        footnote: "At cost price across available stock",
        icon: Wallet,
        tone: "violet",
      },
    ]
  }, [filteredProducts])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  function exportToCSV(rows: ProductRow[]) {
    const headers = [
      "Product",
      "SKU",
      "Category",
      "Status",
      "Inventory Status",
      "Available Stock",
      "Cost Price",
      "Selling Price",
      "Platform",
    ]

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.name,
          row.sku,
          row.category,
          row.status,
          getInventoryStatus(row.availableStock),
          row.availableStock,
          row.costPrice,
          row.sellingPrice,
          row.platform,
        ].join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "products-analytics.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {productKpiCards.map((kpi) => (
          <ProductKpiCard key={kpi.label} kpi={kpi} />
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
          <div>
            <CardTitle className="text-lg mb-0">Products</CardTitle>
            <CardDescription>
              Executive product performance across connected stores.
            </CardDescription>
          </div>

          <div className="relative mb-0 w-[280px] max-w-lg">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by product or SKU..."
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
              <DateRangeFilter value={dateRange} onChange={setDateRange} />

              <Select value={platform} onValueChange={(next) => setPlatform(next)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={category} onValueChange={(next) => setCategory(next)}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Can permission="products:export">
                <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredProducts)}>
                  <Download className="mr-2 size-4" />
                  Export
                </Button>
              </Can>
            </div>
          </div>

          <div className="relative w-full overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%] text-center">Product</TableHead>
                  <TableHead className="w-[10%] text-center">SKU</TableHead>
                  <TableHead className="w-[14%] text-center">Category</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-[12%] text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Inventory Status</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                              aria-label="Inventory status classification"
                            >
                              <CircleAlert className="size-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            sideOffset={8}
                            className="max-w-[260px] rounded-2xl border border-sky-400/15 bg-card px-4 py-3 text-left text-foreground shadow-[0_16px_36px_-20px_rgba(2,6,23,0.9)] ring-1 ring-sky-400/10"
                          >
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs font-semibold text-foreground">
                                  Inventory Status Classification
                                </p>
                              </div>
                              <div className="space-y-1 text-[11px] leading-5 text-muted-foreground">
                                <p>
                                  <span className="text-emerald-300">In Stock</span>
                                  <br />
                                  More than 30 units available.
                                </p>
                                <p>
                                  <span className="text-amber-300">Low Stock</span>
                                  <br />
                                  Between 1 and 30 units available.
                                </p>
                                <p>
                                  <span className="text-rose-300">Out of Stock</span>
                                  <br />
                                  No inventory available.
                                </p>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableHead>
                  <TableHead className="w-[10%] text-center">Available Stock</TableHead>
                  <TableHead className="w-[8%] text-center">Cost Price</TableHead>
                  <TableHead className="w-[10%] text-center">Selling Price</TableHead>
                  <TableHead className="w-[10%] text-center">Platform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="w-[22%] text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Static export mode cannot use the default next/image loader here. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.image}
                          alt={product.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full border bg-muted/50 object-cover p-1"
                        />
                        <div className="min-w-0 leading-tight text-center">
                          <p className="font-semibold">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.platform}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-[10%] text-center">{product.sku}</TableCell>
                    <TableCell className="w-[14%] text-center">{product.category}</TableCell>
                    <TableCell className="w-[10%] text-center">
                      <div className="flex items-center justify-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(product.status)}`}
                        >
                          {product.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="w-[12%] text-center">
                      <div className="flex items-center justify-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getInventoryStatusClasses(product.availableStock)}`}
                        >
                          {getInventoryStatus(product.availableStock)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="w-[10%] text-center tabular-nums">
                      {product.availableStock.toLocaleString()}
                    </TableCell>
                    <TableCell className="w-[8%] text-center tabular-nums">
                      {formatCurrency(product.costPrice)}
                    </TableCell>
                    <TableCell className="w-[10%] text-center tabular-nums">
                      {formatCurrency(product.sellingPrice)}
                    </TableCell>
                    <TableCell className="w-[10%] text-center">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <PlatformIcon platform={product.platform} />
                        <span>{product.platform}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              {filteredProducts.length === 0
                ? "Showing 0 of 0"
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of ${filteredProducts.length}`}
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
        </CardContent>
      </Card>
    </div>
  )
}
