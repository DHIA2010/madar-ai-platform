"use client"

import { useMemo, useState } from "react"
import { isWithinInterval } from "date-fns"
import type { DateRange } from "react-day-picker"
import { AppDateRangeFilter } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Download } from "lucide-react"

type AnalyticsProductRow = {
  id: number
  name: string
  category: string
  sku: string
  platform: string
  unitsSold: number
  revenue: number
  averageSellingPrice: number
  orders: number
  conversionRate: number
  image: string
  activityDate: string
}

const analyticsProducts: AnalyticsProductRow[] = [
  {
    id: 1,
    name: "Denim Jacket",
    category: "Outerwear",
    sku: "DJ-659",
    platform: "Shopify",
    unitsSold: 1240,
    revenue: 148800,
    averageSellingPrice: 120,
    orders: 932,
    conversionRate: 3.8,
    image: "/products/01.png",
    activityDate: "2026-06-04",
  },
  {
    id: 2,
    name: "Leather Belt",
    category: "Accessories",
    sku: "LB-500",
    platform: "Salla",
    unitsSold: 980,
    revenue: 44100,
    averageSellingPrice: 45,
    orders: 714,
    conversionRate: 4.2,
    image: "/products/02.png",
    activityDate: "2026-06-07",
  },
  {
    id: 3,
    name: "Slim Fit Jeans",
    category: "Bottoms",
    sku: "SFJ-2021",
    platform: "Zid",
    unitsSold: 845,
    revenue: 75205,
    averageSellingPrice: 89,
    orders: 608,
    conversionRate: 2.9,
    image: "/products/03.png",
    activityDate: "2026-06-11",
  },
  {
    id: 4,
    name: "Formal Blazer",
    category: "Suits & Blazers",
    sku: "FB-300",
    platform: "Shopify",
    unitsSold: 522,
    revenue: 103878,
    averageSellingPrice: 199,
    orders: 394,
    conversionRate: 2.5,
    image: "/products/04.png",
    activityDate: "2026-06-13",
  },
  {
    id: 5,
    name: "Running Shoes",
    category: "Footwear",
    sku: "RS-150",
    platform: "WooCommerce",
    unitsSold: 1160,
    revenue: 87000,
    averageSellingPrice: 75,
    orders: 818,
    conversionRate: 3.4,
    image: "/products/05.png",
    activityDate: "2026-06-16",
  },
  {
    id: 6,
    name: "Cotton Hoodie",
    category: "Sweatshirts",
    sku: "CH-100",
    platform: "Salla",
    unitsSold: 734,
    revenue: 109366,
    averageSellingPrice: 149,
    orders: 521,
    conversionRate: 3.1,
    image: "/products/06.png",
    activityDate: "2026-06-18",
  },
  {
    id: 7,
    name: "Wool Scarf",
    category: "Accessories",
    sku: "WS-220",
    platform: "Zid",
    unitsSold: 612,
    revenue: 23868,
    averageSellingPrice: 39,
    orders: 487,
    conversionRate: 4.6,
    image: "/products/07.png",
    activityDate: "2026-06-19",
  },
  {
    id: 8,
    name: "Graphic T-Shirt",
    category: "Tops",
    sku: "GT-310",
    platform: "WooCommerce",
    unitsSold: 1425,
    revenue: 41325,
    averageSellingPrice: 29,
    orders: 1032,
    conversionRate: 5.1,
    image: "/products/08.png",
    activityDate: "2026-06-20",
  },
  {
    id: 9,
    name: "Raincoat",
    category: "Outerwear",
    sku: "RC-450",
    platform: "Shopify",
    unitsSold: 468,
    revenue: 41652,
    averageSellingPrice: 89,
    orders: 321,
    conversionRate: 2.2,
    image: "/products/09.png",
    activityDate: "2026-06-14",
  },
]

const categoryOptions = [
  "All Categories",
  "Accessories",
  "Bottoms",
  "Footwear",
  "Outerwear",
  "Suits & Blazers",
  "Sweatshirts",
  "Tops",
]

const platformOptions = ["All Platforms", "Shopify", "Salla", "WooCommerce", "Zid"]

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function ToolbarSelect({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-11 min-w-[170px] rounded-2xl border border-slate-700/80 bg-slate-950/65 px-4 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl transition-colors hover:border-sky-400/45 focus:ring-2 focus:ring-sky-400/30">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-2xl border border-slate-700/80 bg-slate-950/95 text-slate-100 shadow-[0_24px_60px_-28px_rgba(14,165,233,0.45)] backdrop-blur-xl">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function AnalyticsProductsTable() {
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState("All Categories")
  const [platform, setPlatform] = useState("All Platforms")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const filteredProducts = useMemo(() => {
    return analyticsProducts.filter((product) => {
      const matchesCategory = category === "All Categories" || product.category === category
      const matchesPlatform = platform === "All Platforms" || product.platform === platform
      const matchesDateRange =
        !dateRange?.from ||
        isWithinInterval(new Date(product.activityDate), {
          start: dateRange.from,
          end: dateRange.to ?? dateRange.from,
        })

      return matchesCategory && matchesPlatform && matchesDateRange
    })
  }, [category, dateRange, platform])

  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const exportToCSV = () => {
    const headers = [
      "Product",
      "SKU",
      "Category",
      "Units Sold",
      "Revenue",
      "Average Selling Price",
      "Orders",
      "Conversion Rate",
    ]

    const csvContent = [
      headers.join(","),
      ...filteredProducts.map((row) =>
        [
          row.name,
          row.sku,
          row.category,
          row.unitsSold,
          row.revenue,
          row.averageSellingPrice,
          row.orders,
          `${row.conversionRate}%`,
        ].join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = "analytics-products.csv"
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <Card className="overflow-hidden border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] text-slate-100 shadow-[0_24px_80px_-44px_rgba(14,165,233,0.45)]">
      <CardHeader className="border-b border-slate-800/90 pb-5">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-xl text-slate-50">Products List</CardTitle>
          <CardDescription className="text-slate-400">
            Executive product performance across connected stores.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div className="overflow-hidden rounded-[24px] border border-slate-800/90 bg-slate-950/35">
          <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-slate-950/70 px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl xl:flex-row xl:items-center">
            <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end xl:me-auto">
              <AppDateRangeFilter
                value={dateRange}
                onChange={(next) => {
                  setDateRange(next)
                  setPage(1)
                }}
              />

              <ToolbarSelect
                value={platform}
                onValueChange={(value) => {
                  setPlatform(value)
                  setPage(1)
                }}
                options={platformOptions}
                placeholder="Platform"
              />

              <ToolbarSelect
                value={category}
                onValueChange={(value) => {
                  setCategory(value)
                  setPage(1)
                }}
                options={categoryOptions}
                placeholder="Category"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="h-11 rounded-2xl border-slate-700 bg-slate-900/80 px-4 text-slate-200 hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-slate-50"
                onClick={exportToCSV}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className="border-slate-800/80 hover:bg-transparent">
                  <TableHead className="h-12 w-[24%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Product
                  </TableHead>
                  <TableHead className="w-[10%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    SKU
                  </TableHead>
                  <TableHead className="w-[14%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Category
                  </TableHead>
                  <TableHead className="w-[10%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Units Sold
                  </TableHead>
                  <TableHead className="w-[12%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Revenue
                  </TableHead>
                  <TableHead className="w-[14%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Average Selling Price
                  </TableHead>
                  <TableHead className="w-[8%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Orders
                  </TableHead>
                  <TableHead className="w-[8%] px-5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Conversion Rate
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow
                    key={product.id}
                    className="border-slate-800/70 transition-colors hover:bg-slate-900/45"
                  >
                    <TableCell className="w-[24%] px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                          {/* Static export mode cannot use the default next/image loader here. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.image}
                            alt={product.name}
                            width={42}
                            height={42}
                            className="h-10 w-10 rounded-xl object-cover"
                          />
                        </div>
                        <div className="min-w-0 text-center leading-tight">
                          <p className="font-medium text-slate-50">{product.name}</p>
                          <p className="text-xs text-sky-300/80">{product.platform}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="w-[10%] px-5 text-center text-slate-300">
                      {product.sku}
                    </TableCell>
                    <TableCell className="w-[14%] px-5 text-center text-slate-300">
                      {product.category}
                    </TableCell>
                    <TableCell className="w-[10%] px-5 text-center tabular-nums text-slate-200">
                      {product.unitsSold.toLocaleString()}
                    </TableCell>
                    <TableCell className="w-[12%] px-5 text-center tabular-nums text-slate-200">
                      {formatCurrency(product.revenue)}
                    </TableCell>
                    <TableCell className="w-[14%] px-5 text-center tabular-nums text-slate-200">
                      {formatCurrency(product.averageSellingPrice)}
                    </TableCell>
                    <TableCell className="w-[8%] px-5 text-center tabular-nums text-slate-200">
                      {product.orders.toLocaleString()}
                    </TableCell>
                    <TableCell className="w-[8%] px-5 text-center tabular-nums text-slate-200">
                      {product.conversionRate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
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
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
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
