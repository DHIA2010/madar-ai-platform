"use client"
import { useMemo, useState, ReactNode } from "react"
import {
  Eye,
  CheckCircle,
  Wallet,
  AlertCircle,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Search, Plus, MoreVertical, UserIcon, SettingsIcon, LogOutIcon } from "lucide-react"

const statusClass = (status: string) => {
  switch(status) {
    case "Completed":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/30"
    case "Pending":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400 border-yellow-500/30"
    case "Processing":
      return "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/30"
    case "Cancelled":
      return "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/30"
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-500/30"
  }
}

export default function OrderList() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [orderList, setOrderList] = useState([
    {
      id: 1,
      orderNumber: "ORD-001",
      customerName: "John Doe",
      customerImage: "https://randomuser.me/api/portraits/women/10.jpg",
      email: "john@example.com",
      total: "$156.00",
      products: 3,
      date: "2024-02-01",
      status: "Completed",
    },
    {
      id: 2,
      orderNumber: "ORD-002",
      customerName: "Sarah Smith",
      customerImage: "https://randomuser.me/api/portraits/women/20.jpg",
      email: "sarah@example.com",
      total: "$89.50",
      products: 2,
      date: "2024-02-02",
      status: "Processing",
    },
    {
      id: 3,
      orderNumber: "ORD-003",
      customerName: "Michael Brown",
      customerImage: "https://randomuser.me/api/portraits/men/30.jpg",
      email: "michael@example.com",
      total: "$245.75",
      products: 5,
      date: "2024-02-03",
      status: "Pending",
    },
    {
      id: 4,
      orderNumber: "ORD-004",
      customerName: "Emily Davis",
      customerImage: "https://randomuser.me/api/portraits/women/40.jpg",
      email: "emily@example.com",
      total: "$123.00",
      products: 2,
      date: "2024-02-04",
      status: "Completed",
    },
    {
      id: 5,
      orderNumber: "ORD-005",
      customerName: "Robert Wilson",
      customerImage: "https://randomuser.me/api/portraits/men/50.jpg",
      email: "robert@example.com",
      total: "$198.99",
      products: 4,
      date: "2024-02-05",
      status: "Processing",
    },
    {
      id: 6,
      orderNumber: "ORD-006",
      customerName: "Lisa Anderson",
      customerImage: "https://randomuser.me/api/portraits/women/60.jpg",
      email: "lisa@example.com",
      total: "$67.50",
      products: 1,
      date: "2024-02-06",
      status: "Cancelled",
    },
    {
      id: 7,
      orderNumber: "ORD-007",
      customerName: "James Taylor",
      customerImage: "https://randomuser.me/api/portraits/men/70.jpg",
      email: "james@example.com",
      total: "$312.45",
      products: 6,
      date: "2024-02-07",
      status: "Completed",
    },
    {
      id: 8,
      orderNumber: "ORD-008",
      customerName: "Jennifer Martinez",
      customerImage: "https://randomuser.me/api/portraits/women/80.jpg",
      email: "jennifer@example.com",
      total: "$145.30",
      products: 3,
      date: "2024-02-08",
      status: "Pending",
    },
    {
      id: 9,
      orderNumber: "ORD-009",
      customerName: "David Garcia",
      customerImage: "https://randomuser.me/api/portraits/men/90.jpg",
      email: "david@example.com",
      total: "$220.00",
      products: 4,
      date: "2024-02-09",
      status: "Processing",
    },
    {
      id: 10,
      orderNumber: "ORD-010",
      customerName: "Amanda Thomas",
      customerImage: "https://randomuser.me/api/portraits/women/100.jpg",
      email: "amanda@example.com",
      total: "$89.99",
      products: 2,
      date: "2024-02-10",
      status: "Completed",
    },
    {
      id: 11,
      orderNumber: "ORD-011",
      customerName: "Christopher Lee",
      customerImage: "https://randomuser.me/api/portraits/men/110.jpg",
      email: "chris@example.com",
      total: "$276.50",
      products: 5,
      date: "2024-02-11",
      status: "Processing",
    },
    {
      id: 12,
      orderNumber: "ORD-012",
      customerName: "Michelle White",
      customerImage: "https://randomuser.me/api/portraits/women/120.jpg",
      email: "michelle@example.com",
      total: "$134.75",
      products: 3,
      date: "2024-02-12",
      status: "Pending",
    },
    {
      id: 13,
      orderNumber: "ORD-013",
      customerName: "Daniel Harris",
      customerImage: "https://randomuser.me/api/portraits/men/130.jpg",
      email: "daniel@example.com",
      total: "$198.50",
      products: 4,
      date: "2024-02-13",
      status: "Completed",
    },
    {
      id: 14,
      orderNumber: "ORD-014",
      customerName: "Jessica Clark",
      customerImage: "https://randomuser.me/api/portraits/women/140.jpg",
      email: "jessica@example.com",
      total: "$299.99",
      products: 5,
      date: "2024-02-14",
      status: "Cancelled",
    },
    {
      id: 15,
      orderNumber: "ORD-015",
      customerName: "Matthew Rodriguez",
      customerImage: "https://randomuser.me/api/portraits/men/150.jpg",
      email: "matthew@example.com",
      total: "$156.25",
      products: 3,
      date: "2024-02-15",
      status: "Processing",
    },
  ])
  const [selected, setSelected] = useState<number[]>([])
  const PAGE_SIZE = 5

  const filtered = useMemo(() => {
    return orderList.filter((order) =>
      `${order.orderNumber} ${order.customerName} ${order.email} ${order.status} ${order.total}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [search, orderList])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  const paginated = filtered.slice(start, start + PAGE_SIZE)

  const handleSelectAll = () => {
    if (selected.length === paginated.length) {
      setSelected([])
    } else {
      setSelected(paginated.map((order) => order.id))
    }
  }

  const handleSelectOne = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleDeleteSelected = () => {
    setOrderList((prev) =>
      prev.filter((order) => !selected.includes(order.id))
    )
    setSelected([])
  }

  const isAllSelected = paginated.length > 0 && selected.length === paginated.length

  return (
    <div className="space-y-6">
     
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
              <OrderStatCard
                  icon={<Eye className="h-6 w-6 text-sky-600" />}
                  value={156}
                  label="Pending Payment"
              />

              <OrderStatCard
                  icon={<CheckCircle className="h-6 w-6 text-emerald-600" />}
                  value="12,689"
                  label="Completed"
              />

              <OrderStatCard
                  icon={<Wallet className="h-6 w-6 text-amber-600" />}
                  value={124}
                  label="Refunded"
              />

              <OrderStatCard
                  icon={<AlertCircle className="h-6 w-6 text-rose-600" />}
                  value={32}
                  label="Failed"
              />
          </div>

          
    <Card>
      <CardHeader>
        <CardTitle>Order List</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-[260px]">
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

          <div className="flex gap-2">
            {selected.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
              >
                Delete Selected ({selected.length})
              </Button>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New Order
            </Button>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-muted-foreground">
            No matching orders found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Order Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginated.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(order.id)}
                      onCheckedChange={() => handleSelectOne(order.id)}
                    />
                  </TableCell>

                  <TableCell className="font-medium">
                    {order.orderNumber}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={order.customerImage}
                        alt={order.customerName}
                        className="h-8 w-8 rounded-full border object-cover bg-muted/50"
                      />
                      <span>{order.customerName}</span>
                    </div>
                  </TableCell>

                  <TableCell>{order.email}</TableCell>
                  <TableCell>{order.products}</TableCell>
                  <TableCell className="font-medium">{order.total}</TableCell>
                  <TableCell>{order.date}</TableCell>

                  <TableCell>
                    <Badge className={statusClass(order.status)} variant="outline">
                      {order.status}
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
                            console.log("View order", order.id)
                          }}
                        >
                          <UserIcon className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => {
                            console.log("Edit order", order.id)
                          }}
                        >
                          <SettingsIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => {
                            setOrderList(prev =>
                              prev.filter(o => o.id !== order.id)
                            )
                            setSelected(prev =>
                              prev.filter(id => id !== order.id)
                            )
                          }}
                        >
                          <LogOutIcon className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Result {start + 1}–
            {Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>

      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create New Order</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input placeholder="Enter customer name" />
            </div>

            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" placeholder="customer@example.com" />
            </div>

            <div className="space-y-2">
              <Label>Order Total</Label>
              <Input placeholder="$0.00" />
            </div>

            <div className="space-y-2">
              <Label>Number of Products</Label>
              <Input type="number" placeholder="0" />
            </div>

            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input type="date" />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Processing">Processing</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Order Notes</Label>
              <Textarea rows={3} placeholder="Add any notes about the order" />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button>Create Order</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
    </div>
  )
}

// Reusable card component for order status stats
function OrderStatCard({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string | number
  label: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border">
          {icon}
        </div>

        <div>
          <h3 className="text-2xl font-semibold">{value}</h3>
          <p className="text-md text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}