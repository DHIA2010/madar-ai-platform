"use client"
import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  MoreVertical,
  Plus,
  ShoppingBag,
  Wallet,
  Users,
  Box,
  ArrowUpRight,
  ArrowDownRight,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  Search,
} from "lucide-react"

const products = [
  {
    id: 1,
    name: "Denim Jacket",
    category: "Outerwear",
    stock: "In Stock",
    sku: "DJ-659",
    price: "$120",
    status: "Published",
    image: "/pulse-ui-next/products/01.png",
  },
  {
    id: 2,
    name: "Leather Belt",
    category: "Accessories",
    stock: "In Stock",
    sku: "LB-500",
    price: "$45",
    status: "Published",
    image: "/pulse-ui-next/products/02.png",
  },
  {
    id: 3,
    name: "Slim Fit Jeans",
    category: "Bottoms",
    stock: "Low Stock",
    sku: "SFJ-2021",
    price: "$89",
    status: "Draft",
    image: "/pulse-ui-next/products/03.png",
  },
  {
    id: 4,
    name: "Formal Blazer",
    category: "Suits & Blazers",
    stock: "In Stock",
    sku: "FB-300",
    price: "$199",
    status: "Published",
    image: "/pulse-ui-next/products/04.png",
  },
  {
    id: 5,
    name: "Running Shoes",
    category: "Footwear",
    stock: "Out of Stock",
    sku: "RS-150",
    price: "$75",
    status: "Inactive",
    image: "/pulse-ui-next/products/05.png",
  },
  {
    id: 6,
    name: "Cotton Hoodie",
    category: "Sweatshirts",
    stock: "In Stock",
    sku: "CH-100",
    price: "$149",
    status: "Draft",
    image: "/pulse-ui-next/products/06.png",
  },
  {
    id: 7,
    name: "Wool Scarf",
    category: "Accessories",
    stock: "Low Stock",
    sku: "WS-220",
    price: "$39",
    status: "Published",
    image: "/pulse-ui-next/products/07.png",
  },
  {
    id: 8,
    name: "Graphic T-Shirt",
    category: "Tops",
    stock: "In Stock",
    sku: "GT-310",
    price: "$29",
    status: "Published",
    image: "/pulse-ui-next/products/08.png",
  },
  {
    id: 9,
    name: "Raincoat",
    category: "Outerwear",
    stock: "Out of Stock",
    sku: "RC-450",
    price: "$89",
    status: "Archived",
    image: "/pulse-ui-next/products/09.png",
  },
];


const statusVariant = (status: string) => {
  switch (status) {
    case "Published":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/30"
    case "Draft":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-500/30"
    case "Inactive":
      return "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/30"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function ProductList() {
   const [search, setSearch] = useState("")
   const [page, setPage] = useState(1)
   const [selected, setSelected] = useState<number[]>([])
   const [ordersData, setOrdersData] = useState<typeof products>(products)

  // ☑️ Checkbox logic
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? paginatedProducts.map(p => p.id) : [])
  }
  
  // Toggle single selection
  const toggleOne = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  // 📤 Export to CSV
  const exportToCSV = (rows: typeof products) => {
    const headers = ["Name", "Category", "Stock", "SKU", "Price", "Status"]

    const csvContent = [
      headers.join(","),
      ...rows.map(row =>
        [
          row.name,
          row.category,
          row.stock,
          row.sku,
          row.price,
          row.status,
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
  const filteredOrders = useMemo(() => {
    return ordersData.filter((order) =>
      `${order.name} ${order.category} ${order.status}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [search, ordersData])

  //
  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  const paginatedProducts = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ☑️ All selected logic
  const allSelected =
    paginatedProducts.length > 0 &&
    selected.length === paginatedProducts.length

    
  return (
    <div className="space-y-6">

      {/* KPI CARDS */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Orders"
          value="8,542"
          trend="+3.5%"
          icon={<ShoppingBag />}
          positive
        />
        <StatCard
          title="Total Revenue"
          value="$23,456"
          trend="+8.5%"
          icon={<Wallet />}
          positive
        />
        <StatCard
          title="Customers"
          value="5,678"
          trend="-2.5%"
          icon={<Users />}
        />
        <StatCard
          title="Products"
          value="1,234"
          trend="+5.0%"
          icon={<Box />}
          positive
        />
      </div>

      {/* PRODUCT LIST */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 flex-wrap gap-3">
          <div>
          <CardTitle className="text-lg mb-0">Products List</CardTitle>
          <CardDescription>
            Latest product purchases
          </CardDescription>
          </div>
          {/* Search */}
          <div className="relative mb-0 max-w-lg w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
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
          {/* Selection Bar */}
          {selected.length > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2">
              <p className="text-sm text-muted-foreground">
                {selected.length} selected
              </p>

              <div className="flex gap-2">
                {/* Export */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const selectedRows = ordersData.filter(p =>
                      selected.includes(p.id)
                    )
                    exportToCSV(selectedRows)
                  }}
                >
                  Export
                </Button>

                {/* Delete */}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setOrdersData(prev =>
                      prev.filter(product => !selected.includes(product.id))
                    )
                    setSelected([])
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* FILTERS */}
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex gap-3 flex-wrap">
              <Input type="date" className="w-[160px]" />

              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outerwear">Outerwear</SelectItem>
                  <SelectItem value="accessories">Accessories</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Link href="/eCommerce/add-product">
              <Button size="sm">
                <Plus className="mr-1 h-5 w-5" />
                Add Product
              </Button>
            </Link>
          </div>

          {/* TABLE */}
          <div className="relative w-full overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                    checked={
                      paginatedProducts.length > 0 &&
                      selected.length === paginatedProducts.length
                    }
                    onCheckedChange={(val) => toggleAll(!!val)}
                  />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                      checked={selected.includes(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                    />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="h-10 w-10 rounded-full border object-cover p-1 bg-muted/50"
                        />
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </TableCell>

                    <TableCell>{product.category}</TableCell>
                    <TableCell>{product.stock}</TableCell>
                    <TableCell>{product.sku}</TableCell>
                    <TableCell>{product.price}</TableCell>

                    <TableCell>
                      <Badge className={statusVariant(product.status)} variant="outline">
                        {product.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full border-gray-300 dark:border-gray-700"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              console.log("View product", product.id)
                            }}
                          >
                            <UserIcon />
                            View
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => {
                              console.log("Edit product", product.id)
                            }}
                          >
                            <SettingsIcon />
                            Edit
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => {
                              setOrdersData(prev =>
                                prev.filter(p => p.id !== product.id)
                              )
                              setSelected(prev =>
                                prev.filter(id => id !== product.id)
                              )
                            }}
                          >
                            <LogOutIcon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Pagination controls */}
          <div className="flex items-center justify-between px-2 py-2">
            <div className="text-sm text-muted-foreground">
              {filteredOrders.length === 0
                ? "Showing 0 of 0"
                : `Showing ${ (page - 1) * PAGE_SIZE + 1 } - ${ Math.min(page * PAGE_SIZE, filteredOrders.length) } of ${ filteredOrders.length }`}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>

              <span className="text-sm">Page {page} of {totalPages}</span>

              <Button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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
