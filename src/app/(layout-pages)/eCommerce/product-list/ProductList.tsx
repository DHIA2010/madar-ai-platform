"use client"
import { useMemo, useState } from "react"
import Image from "next/image"
import { isWithinInterval } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DateRange } from "react-day-picker"
import { AppDateRangeFilter } from "@/components/app"

import {
  Download,
  ShoppingBag,
  Upload,
  Wallet,
  Users,
  Box,
  ArrowUpRight,
  ArrowDownRight,
  Search,
} from "lucide-react"

const products = [
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

export default function ProductList() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [productsData] = useState(products)
  const [category, setCategory] = useState("All Categories")
  const [platform, setPlatform] = useState("All Platforms")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  // 📤 Export to CSV
  const exportToCSV = (rows: typeof products) => {
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
      ...rows.map((row) =>
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
    link.download = "products.csv"
    link.click()

    URL.revokeObjectURL(url)
  }

  // 🔍 Search filter
  const filteredProducts = useMemo(() => {
    return productsData.filter((product) => {
      const matchesSearch = `${product.name} ${product.sku} ${product.category} ${product.platform}`
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
  }, [category, dateRange, platform, productsData, search])

  //
  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  return (
    <div className="space-y-6">
      <div className="rounded-xl border-4 border-yellow-300 bg-red-600 px-6 py-4 text-center text-2xl font-bold text-yellow-100">
        THIS IS THE COMPONENT I AM EDITING
      </div>

      {/* KPI CARDS */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Orders"
          value="8,542"
          trend="+3.5%"
          icon={<ShoppingBag />}
          positive
        />
        <StatCard title="Total Revenue" value="$23,456" trend="+8.5%" icon={<Wallet />} positive />
        <StatCard title="Customers" value="5,678" trend="-2.5%" icon={<Users />} />
        <StatCard title="Products" value="1,234" trend="+5.0%" icon={<Box />} positive />
      </div>

      {/* PRODUCT LIST */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg mb-0">Products List</CardTitle>
            <CardDescription>
              Executive product performance across connected stores.
            </CardDescription>
          </div>
          {/* Search */}
          <div className="relative mb-0 max-w-lg w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          {/* FILTERS */}
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex gap-3 flex-wrap">
              <Select value={category} onValueChange={setCategory}>
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

              <Select value={platform} onValueChange={setPlatform}>
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

              <AppDateRangeFilter value={dateRange} onChange={setDateRange} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportToCSV(filteredProducts)}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          {/* TABLE */}
          <div className="relative w-full overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Units Sold</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Average Selling Price</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Conversion Rate</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Image
                          src={product.image}
                          alt={product.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full border bg-muted/50 object-cover p-1"
                        />
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.platform}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>{product.sku}</TableCell>
                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.unitsSold.toLocaleString()}</TableCell>
                    <TableCell>{formatCurrency(product.revenue)}</TableCell>
                    <TableCell>{formatCurrency(product.averageSellingPrice)}</TableCell>
                    <TableCell>{product.orders.toLocaleString()}</TableCell>
                    <TableCell>{product.conversionRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Pagination controls */}
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-sm text-muted-foreground">
              {filteredProducts.length === 0
                ? "Showing 0 of 0"
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} of ${filteredProducts.length}`}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>

              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

/* KPI CARD */
function StatCard({
  title,
  value,
  trend,
  icon,
  positive,
}: {
  title: string
  value: string
  trend: string
  icon: React.ReactNode
  positive?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex justify-between items-center p-6">
        <div>
          <p className="text-md text-muted-foreground">{title}</p>
          <h3 className="text-2xl font-medium">{value}</h3>
          <div className="flex items-center gap-1 mt-1 text-sm font-medium mt-2">
            {positive ? (
              <ArrowUpRight className="h-4 w-5 text-emerald-600" />
            ) : (
              <ArrowDownRight className="h-4 w-5 text-rose-600" />
            )}
            <span>{trend}</span>
          </div>
        </div>
        <div className="rounded-xl bg-muted p-3">{icon}</div>
      </CardContent>
    </Card>
  )
}
