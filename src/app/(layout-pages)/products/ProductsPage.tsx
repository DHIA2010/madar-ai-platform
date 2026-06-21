"use client"

import { useMemo, useState } from "react"
import { addMonths, format, getMonth, getYear, isWithinInterval, setMonth, setYear } from "date-fns"
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  Globe,
  Search,
  ShoppingBag,
  Store,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
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
    image: "/pulse-ui-next/products/01.png",
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
    image: "/pulse-ui-next/products/02.png",
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
    image: "/pulse-ui-next/products/03.png",
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
    image: "/pulse-ui-next/products/04.png",
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
    image: "/pulse-ui-next/products/05.png",
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
    image: "/pulse-ui-next/products/06.png",
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
    image: "/pulse-ui-next/products/07.png",
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
    image: "/pulse-ui-next/products/08.png",
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function getStatusClasses(status: ProductStatus) {
  if (status === "Active") {
    return "border-emerald-400/30 bg-emerald-500/12 text-emerald-300"
  }

  if (status === "Draft") {
    return "border-amber-400/30 bg-amber-500/12 text-amber-300"
  }

  return "border-slate-600/60 bg-slate-700/25 text-slate-300"
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
    return "border-emerald-400/30 bg-emerald-500/12 text-emerald-300"
  }

  if (inventoryStatus === "Low Stock") {
    return "border-amber-400/30 bg-amber-500/12 text-amber-300"
  }

  return "border-rose-400/30 bg-rose-500/12 text-rose-300"
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
          className="h-11 min-w-[240px] justify-start rounded-2xl border border-slate-700/80 bg-slate-950/65 px-4 text-left text-sm font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors hover:border-sky-400/45 hover:bg-slate-950/80"
        >
          <CalendarIcon className="mr-2 size-4 text-sky-300" />
          <span className="truncate">{formatDateRangeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[min(27rem,calc(100vw-2rem))] rounded-[24px] border border-sky-400/15 bg-slate-950/92 p-5 text-slate-100 shadow-[0_28px_90px_-38px_rgba(14,165,233,0.55)] ring-1 ring-sky-400/10 backdrop-blur-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-10 rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35"
            onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <Select
              value={String(monthIndex)}
              onValueChange={(next) => {
                setDisplayMonth((current) => setMonth(current, Number(next)))
              }}
            >
              <SelectTrigger className="h-11 w-[9.25rem] rounded-full border border-slate-700/70 bg-slate-900/75 px-4 text-sm font-semibold text-slate-50 shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{monthOptions[monthIndex]}</span>
              </SelectTrigger>
              <SelectContent
                className="rounded-2xl border border-slate-700/70 bg-slate-950/95 p-1.5 text-slate-100 shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {monthOptions.map((monthLabel, index) => (
                  <SelectItem
                    key={monthLabel}
                    value={String(index)}
                    className="rounded-xl px-3 py-2 text-sm text-slate-100 focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
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
              <SelectTrigger className="h-11 w-[7.5rem] rounded-full border border-slate-700/70 bg-slate-900/75 px-4 text-sm font-semibold text-slate-50 shadow-none transition-all hover:border-sky-400/35 hover:bg-sky-500/10 focus-visible:ring-2 focus-visible:ring-sky-400/35">
                <span>{yearValue}</span>
              </SelectTrigger>
              <SelectContent
                className="max-h-72 rounded-2xl border border-slate-700/70 bg-slate-950/95 p-1.5 text-slate-100 shadow-[0_18px_40px_-20px_rgba(2,6,23,0.88)]"
                align="center"
              >
                {yearOptions.map((yearOption) => (
                  <SelectItem
                    key={yearOption}
                    value={String(yearOption)}
                    className="rounded-xl px-3 py-2 text-sm text-slate-100 focus:bg-sky-500/10 data-[state=checked]:bg-sky-500/15"
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
            className="size-10 rounded-full border border-slate-700/80 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35"
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
          className="rounded-[18px] bg-transparent p-0 [--cell-size:40px]"
          classNames={{
            root: "w-full",
            months: "w-full",
            month: "w-full gap-4",
            nav: "hidden",
            button_previous:
              "size-10 rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35",
            button_next:
              "size-10 rounded-full border border-slate-700 bg-slate-900/80 text-slate-300 transition-all hover:border-sky-400/45 hover:bg-sky-500/10 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35",
            month_caption: "hidden",
            caption_label: "text-base font-semibold text-slate-50",
            weekdays: "mb-4 grid grid-cols-7 gap-2.5",
            weekday:
              "h-8 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500",
            week: "mt-2.5 grid grid-cols-7 gap-2.5",
            day: "rounded-full text-slate-100",
            day_button:
              "size-10 rounded-full border border-transparent bg-transparent text-sm font-medium text-slate-100 transition-all duration-200 ease-out hover:border-sky-300/40 hover:bg-sky-500/14 hover:text-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400/35",
            today: "rounded-full border border-sky-400/60 bg-transparent text-slate-50 shadow-none",
            selected:
              "rounded-full border border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)] hover:bg-sky-300 hover:text-slate-950",
            range_middle: "rounded-full border border-transparent bg-sky-500/14 text-slate-50",
            range_start:
              "rounded-full border border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            range_end:
              "rounded-full border border-sky-300 bg-sky-400 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_10px_30px_rgba(14,165,233,0.32)]",
            outside: "text-slate-600 opacity-40",
            disabled: "text-slate-600 opacity-35",
          }}
        />

        <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 rounded-xl border-slate-700 bg-slate-900/70 px-4 text-sm font-medium text-slate-300 transition-all hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
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
            className="h-10 rounded-xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_18px_34px_-18px_rgba(14,165,233,0.8)] transition-all hover:bg-sky-300"
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
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle className="text-lg mb-0">Products</CardTitle>
          <CardDescription>Executive product performance across connected stores.</CardDescription>
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
            <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredProducts)}>
              <Download className="mr-2 size-4" />
              Export
            </Button>
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
                          className="max-w-[260px] rounded-2xl border border-sky-400/15 bg-slate-950/96 px-4 py-3 text-left text-slate-100 shadow-[0_16px_36px_-20px_rgba(2,6,23,0.9)] ring-1 ring-sky-400/10"
                        >
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-semibold text-slate-50">
                                Inventory Status Classification
                              </p>
                            </div>
                            <div className="space-y-1 text-[11px] leading-5 text-slate-300">
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

        <div className="flex flex-col gap-3 rounded-[20px] border border-slate-800/80 bg-slate-950/55 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {filteredProducts.length === 0
              ? "Showing 0 of 0"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of ${filteredProducts.length}`}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-700 bg-slate-900/80 text-slate-200 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </Button>
            <span className="min-w-24 text-center text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-700 bg-slate-900/80 text-slate-200 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
