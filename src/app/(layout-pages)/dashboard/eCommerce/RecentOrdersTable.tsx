"use client"

import { useMemo, useState } from "react"
import { Search, MoreVertical, Star, LogOutIcon, SettingsIcon, CreditCardIcon, UserIcon, EllipsisVertical } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const statusStyles: Record<string, string> = {
  Completed:
    "bg-green-600/10 text-green-400 border border-green-500/20",
  Pending:
    "bg-yellow-600/10 text-yellow-400 border border-yellow-500/20",
  Canceled:
    "bg-red-600/10 text-red-400 border border-red-500/20",
}

const PAGE_SIZE = 5

const orders = [
  {
    id: 1,
    name: "Sports Shoes",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&h=200&fit=crop",
    amount: "$149",
    vendor: "Julia Sunota",
    status: "Completed",
    rating: 5.0,
    date: "2025-01-10",
  },
  {
    id: 2,
    name: "Golden Watch",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200&h=200&fit=crop",
    amount: "$168",
    vendor: "Robert Fox",
    status: "Completed",
    rating: 5.0,
    date: "2025-01-09",
  },
  {
    id: 3,
    name: "Men Polo Tshirt",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&h=200&fit=crop",
    amount: "$124",
    vendor: "Emma Watson",
    status: "Pending",
    rating: 4.0,
    date: "2025-01-08",
  },
  {
    id: 4,
    name: "Blue Jeans Casual",
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=200&h=200&fit=crop",
    amount: "$289",
    vendor: "Jacob Jones",
    status: "Completed",
    rating: 3.0,
    date: "2025-01-07",
  },
  {
    id: 5,
    name: "Fancy Shirts",
    image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=200&h=200&fit=crop",
    amount: "$389",
    vendor: "Kristin Watson",
    status: "Canceled",
    rating: 2.0,
    date: "2025-01-06",
  },
  {
    id: 6,
    name: "Wireless Headphones",
    image: "https://images.unsplash.com/photo-1518441902117-fc8c1d65e2a0?w=200&h=200&fit=crop",
    amount: "$199",
    vendor: "Albert Flores",
    status: "Completed",
    rating: 4.5,
    date: "2025-01-05",
  },
]


export default function RecentOrdersTable() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [ordersData, setOrdersData] = useState(orders)


  // 🔍 Search filter
const filteredOrders = useMemo(() => {
  return ordersData.filter((order) =>
    `${order.name} ${order.vendor} ${order.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
}, [search, ordersData])


  // 📄 Pagination
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE)
  const paginatedOrders = filteredOrders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  // ☑️ Checkbox logic
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? paginatedOrders.map(o => o.id) : [])
  }

  const toggleOne = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const exportToCSV = (rows: typeof orders) => {
  const headers = ["Name", "Amount", "Vendor", "Status", "Rating", "Date"]

  const csvContent = [
    headers.join(","),
    ...rows.map(row =>
      [
        row.name,
        row.amount,
        row.vendor,
        row.status,
        row.rating,
        row.date,
      ].join(",")
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <div>
          <CardTitle className="text-lg mb-0">Recent Orders</CardTitle>
          <CardDescription>
            Latest product purchases
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <UserIcon />
              View detailed report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCardIcon />
              Download report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SettingsIcon />
              Export as CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon />
             Refresh data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="p-6">
        {/* Search */}
        <div className="relative mb-4 max-w-sm">
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
                  const selectedRows = ordersData.filter(o =>
                    selected.includes(o.id)
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
                    prev.filter(order => !selected.includes(order.id))
                  )
                  setSelected([])
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="relative w-full overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    paginatedOrders.length > 0 &&
                    selected.length === paginatedOrders.length
                  }
                  onCheckedChange={(val) => toggleAll(!!val)}
                />
              </TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginatedOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(order.id)}
                    onCheckedChange={() => toggleOne(order.id)}
                  />
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-3">
                    <img
                      src={order.image}
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium">{order.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.date}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>{order.amount}</TableCell>
                <TableCell>{order.vendor}</TableCell>

                <TableCell>
                  <Badge
                    variant="outline"
                    className={statusStyles[order.status]}
                  >
                    {order.status}
                  </Badge>
                </TableCell>

                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          console.log("View order", order.id)
                        }}
                      >
                        <UserIcon />
                        View
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={() => {
                          console.log("Edit order", order.id)
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
                            prev.filter(o => o.id !== order.id)
                          )
                          setSelected(prev =>
                            prev.filter(id => id !== order.id)
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

        {/* Pagination */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
