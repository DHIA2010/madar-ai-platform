"use client"
import { useMemo, useState, ReactNode } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
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

const countryData: { [key: string]: { name: string; code: string } } = {
  pk: { name: "Pakistan", code: "pk" },
  ca: { name: "Canada", code: "ca" },
  it: { name: "Italy", code: "it" },
  de: { name: "Germany", code: "de" },
  cn: { name: "China", code: "cn" },
  us: { name: "United States", code: "us" },
  uk: { name: "United Kingdom", code: "gb" },
  fr: { name: "France", code: "fr" },
  au: { name: "Australia", code: "au" },
  jp: { name: "Japan", code: "jp" },
}

export default function CustomerList() {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [customerList, setCustomerList] = useState([
    {
      id: 1,
      name: "John Doe",
      image: "https://randomuser.me/api/portraits/men/1.jpg",
      email: "john@example.com",
      phone: "+1 (555) 123-4567",
      joinDate: "2024-01-15",
      totalOrders: 8,
      totalSpent: "$1,250.50",
      country: "us",
    },
    {
      id: 2,
      name: "Sarah Smith",
      image: "https://randomuser.me/api/portraits/women/2.jpg",
      email: "sarah@example.com",
      phone: "+1 (555) 234-5678",
      joinDate: "2024-01-20",
      totalOrders: 5,
      totalSpent: "$890.00",
      country: "ca",
    },
    {
      id: 3,
      name: "Michael Brown",
      image: "https://randomuser.me/api/portraits/men/3.jpg",
      email: "michael@example.com",
      phone: "+1 (555) 345-6789",
      joinDate: "2024-01-10",
      totalOrders: 12,
      totalSpent: "$2,150.75",
      country: "br",
    },
    {
      id: 4,
      name: "Emily Davis",
      image: "https://randomuser.me/api/portraits/women/4.jpg",
      email: "emily@example.com",
      phone: "+1 (555) 456-7890",
      joinDate: "2024-02-01",
      totalOrders: 3,
      totalSpent: "$425.00",
      country: "de",
    },
    {
      id: 5,
      name: "Robert Wilson",
      image: "https://randomuser.me/api/portraits/men/5.jpg",
      email: "robert@example.com",
      phone: "+1 (555) 567-8901",
      joinDate: "2023-12-20",
      totalOrders: 15,
      totalSpent: "$3,200.25",
      country: "it",
    },
    {
      id: 6,
      name: "Lisa Anderson",
      image: "https://randomuser.me/api/portraits/women/6.jpg",
      email: "lisa@example.com",
      phone: "+1 (555) 678-9012",
      joinDate: "2024-01-25",
      totalOrders: 2,
      totalSpent: "$199.99",
      country: "fr",
    },
    {
      id: 7,
      name: "James Taylor",
      image: "https://randomuser.me/api/portraits/men/7.jpg",
      email: "james@example.com",
      phone: "+1 (555) 789-0123",
      joinDate: "2023-11-30",
      totalOrders: 20,
      totalSpent: "$4,567.50",
      country: "au",
    },
    {
      id: 8,
      name: "Jennifer Martinez",
      image: "https://randomuser.me/api/portraits/women/8.jpg",
      email: "jennifer@example.com",
      phone: "+1 (555) 890-1234",
      joinDate: "2024-01-05",
      totalOrders: 7,
      totalSpent: "$1,050.00",
      country: "pk",
    },
    {
      id: 9,
      name: "David Garcia",
      image: "https://randomuser.me/api/portraits/men/9.jpg",
      email: "david@example.com",
      phone: "+1 (555) 901-2345",
      joinDate: "2024-02-03",
      totalOrders: 1,
      totalSpent: "$150.00",
      country: "cn",
    },
    {
      id: 10,
      name: "Amanda Thomas",
      image: "https://randomuser.me/api/portraits/women/10.jpg",
      email: "amanda@example.com",
      phone: "+1 (555) 012-3456",
      joinDate: "2024-01-30",
      totalOrders: 6,
      totalSpent: "$875.50",
      country: "jp",
    },
    {
      id: 11,
      name: "Christopher Lee",
      image: "https://randomuser.me/api/portraits/men/11.jpg",
      email: "chris@example.com",
      phone: "+1 (555) 123-4567",
      joinDate: "2023-12-15",
      totalOrders: 18,
      totalSpent: "$3,500.00",
      country: "us",
    },
    {
      id: 12,
      name: "Michelle White",
      image: "https://randomuser.me/api/portraits/women/12.jpg",
      email: "michelle@example.com",
      phone: "+1 (555) 234-5678",
      joinDate: "2024-01-28",
      totalOrders: 4,
      totalSpent: "$650.75",
      country: "ca",
    },
    {
      id: 13,
      name: "Daniel Harris",
      image: "https://randomuser.me/api/portraits/men/13.jpg",
      email: "daniel@example.com",
      phone: "+1 (555) 345-6789",
      joinDate: "2024-02-02",
      totalOrders: 9,
      totalSpent: "$1,400.00",
      country: "uk",
    },
    {
      id: 14,
      name: "Jessica Clark",
      image: "https://randomuser.me/api/portraits/women/14.jpg",
      email: "jessica@example.com",
      phone: "+1 (555) 456-7890",
      joinDate: "2024-01-18",
      totalOrders: 11,
      totalSpent: "$2,300.50",
      country: "de",
    },
    {
      id: 15,
      name: "Matthew Rodriguez",
      image: "https://randomuser.me/api/portraits/men/15.jpg",
      email: "matthew@example.com",
      phone: "+1 (555) 567-8901",
      joinDate: "2024-01-22",
      totalOrders: 5,
      totalSpent: "$950.00",
      country: "it",
    },
  ])
  const [selected, setSelected] = useState<number[]>([])
  const PAGE_SIZE = 5

  const filtered = useMemo(() => {
    return customerList.filter((customer) =>
      `${customer.name} ${customer.email} ${customer.phone} ${countryData[customer.country]?.name || ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [search, customerList])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  const paginated = filtered.slice(start, start + PAGE_SIZE)

  const handleSelectAll = () => {
    if (selected.length === paginated.length) {
      setSelected([])
    } else {
      setSelected(paginated.map((customer) => customer.id))
    }
  }

  const handleSelectOne = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleDeleteSelected = () => {
    setCustomerList((prev) =>
      prev.filter((customer) => !selected.includes(customer.id))
    )
    setSelected([])
  }

  const isAllSelected = paginated.length > 0 && selected.length === paginated.length
  const totalCustomers = customerList.length
  const uniqueCountries = new Set(customerList.map(c => c.country)).size
  const totalRevenue = customerList.reduce((sum, c) => sum + parseFloat(c.totalSpent.replace('$', '').replace(',', '')), 0)
  const averageOrderValue = totalRevenue / customerList.reduce((sum, c) => sum + c.totalOrders, 0)

  return (
    <div className="space-y-6">
     
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
              <CustomerStatCard
                  icon={<Users className="h-6 w-6 text-sky-600" />}
                  value={totalCustomers}
                  label="Total Customers"
              />

              <CustomerStatCard
                  icon={<UserCheck className="h-6 w-6 text-emerald-600" />}
                  value={uniqueCountries}
                  label="Countries"
              />

              <CustomerStatCard
                  icon={<TrendingUp className="h-6 w-6 text-amber-600" />}
                  value={`$${totalRevenue.toFixed(2)}`}
                  label="Total Revenue"
              />

              <CustomerStatCard
                  icon={<UserX className="h-6 w-6 text-rose-600" />}
                  value={`$${averageOrderValue.toFixed(2)}`}
                  label="Avg. Order Value"
              />
          </div>

          
    <Card>
      <CardHeader>
        <CardTitle>Customer List</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
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
              New Customer
            </Button>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-muted-foreground">
            No matching customers found.
          </div>
        ) : isMobile ? (
          <div className="space-y-4">
            {paginated.map((customer) => (
              <Card key={customer.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <img
                        src={customer.image}
                        alt={customer.name}
                        className="h-10 w-10 rounded-full border object-cover bg-muted/50"
                      />
                      <div>
                        <p className="font-semibold">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.email}</p>
                      </div>
                    </div>
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
                            console.log("View customer", customer.id)
                          }}
                        >
                          <UserIcon className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            console.log("Edit customer", customer.id)
                          }}
                        >
                          <SettingsIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => {
                            setCustomerList(prev =>
                              prev.filter(c => c.id !== customer.id)
                            )
                            setSelected(prev =>
                              prev.filter(id => id !== customer.id)
                            )
                          }}
                        >
                          <LogOutIcon className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{customer.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="font-medium">{customer.totalOrders}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Spent</p>
                      <p className="font-medium">{customer.totalSpent}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Joined</p>
                      <p className="font-medium text-xs">{customer.joinDate}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <img
                      src={`https://flagcdn.com/48x36/${customer.country}.png`}
                      alt={countryData[customer.country]?.name}
                      className="h-5 w-7 rounded-sm border object-cover"
                    />
                    <span className="text-sm font-medium">{countryData[customer.country]?.name || 'Unknown'}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="relative w-full overflow-x-auto">
            <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Total Orders</TableHead>
                <TableHead className="hidden md:table-cell">Total Spent</TableHead>
                <TableHead className="hidden xl:table-cell">Join Date</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginated.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(customer.id)}
                      onCheckedChange={() => handleSelectOne(customer.id)}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={customer.image}
                        alt={customer.name}
                        className="h-8 w-8 rounded-full border object-cover bg-muted/50"
                      />
                      <span className="font-medium">{customer.name}</span>
                    </div>
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">{customer.email}</TableCell>
                  <TableCell className="hidden lg:table-cell">{customer.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">{customer.totalOrders}</TableCell>
                  <TableCell className="hidden md:table-cell font-medium">{customer.totalSpent}</TableCell>
                  <TableCell className="hidden xl:table-cell">{customer.joinDate}</TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={`https://flagcdn.com/48x36/${customer.country}.png`}
                        alt={countryData[customer.country]?.name}
                        className="h-6 w-8 rounded-sm border object-cover"
                      />
                      <span className="font-medium">{countryData[customer.country]?.name || 'Unknown'}</span>
                    </div>
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
                            console.log("View customer", customer.id)
                          }}
                        >
                          <UserIcon className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => {
                            console.log("Edit customer", customer.id)
                          }}
                        >
                          <SettingsIcon className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => {
                            setCustomerList(prev =>
                              prev.filter(c => c.id !== customer.id)
                            )
                            setSelected(prev =>
                              prev.filter(id => id !== customer.id)
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
            </div>
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
            <SheetTitle>Add New Customer</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="Enter customer name" />
            </div>

            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" placeholder="customer@example.com" />
            </div>

            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input placeholder="+1 (555) 123-4567" />
            </div>

            <div className="space-y-2">
              <Label>Join Date</Label>
              <Input type="date" />
            </div>

            <div className="space-y-2">
              <Label>Country</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(countryData).map(([code, data]) => (
                    <SelectItem key={code} value={code}>
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://flagcdn.com/24x18/${code}.png`}
                          alt={data.name}
                          className="h-4 w-6 rounded-sm"
                        />
                        {data.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer Notes</Label>
              <Textarea rows={3} placeholder="Add any notes about the customer" />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button>Add Customer</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
    </div>
  )
}

// Reusable card component for customer status stats
function CustomerStatCard({
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
