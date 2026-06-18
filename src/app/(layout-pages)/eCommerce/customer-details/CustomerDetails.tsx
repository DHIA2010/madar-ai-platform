"use client"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  MessageSquare,
  Edit2,
  Trash2,
} from "lucide-react"

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

const customerDetails = {
  id: 1,
  name: "John Doe",
  image: "https://randomuser.me/api/portraits/men/1.jpg",
  email: "john@example.com",
  phone: "+1 (555) 123-4567",
  country: "us",
  joinDate: "2024-01-15",
  totalOrders: 8,
  totalSpent: "$1,250.50",
  status: "Active",
  recentOrders: [
    {
      id: "ORD-001",
      date: "2024-02-05",
      status: "Completed",
      items: 3,
      total: "$156.00",
    },
    {
      id: "ORD-002",
      date: "2024-01-28",
      status: "Completed",
      items: 2,
      total: "$89.50",
    },
    {
      id: "ORD-003",
      date: "2024-01-15",
      status: "Completed",
      items: 3,
      total: "$245.75",
    },
  ],
  activity: [
    { date: "2024-02-05", action: "Placed order ORD-001" },
    { date: "2024-01-28", action: "Placed order ORD-002" },
    { date: "2024-01-15", action: "Account created & joined" },
  ],
}

const statusClass = (status: string) => {
  switch (status) {
    case "Active":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
    case "Inactive":
      return "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400"
    case "Suspended":
      return "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const orderStatusClass = (status: string) => {
  switch (status) {
    case "Completed":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
    case "Pending":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
    case "Processing":
      return "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function CustomerDetails() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <h2 className="text-2xl font-semibold">
              {customerDetails.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Customer ID: #{customerDetails.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Edit2 className="mr-1 h-4 w-4" />
            Edit
          </Button>

          <Button variant="destructive" size="sm">
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>

          <Badge className={statusClass(customerDetails.status)} variant="outline">
            {customerDetails.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* RECENT ORDERS */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>

            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {customerDetails.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.id}</TableCell>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.items}</TableCell>
                      <TableCell className="font-medium">{order.total}</TableCell>
                      <TableCell>
                        <Badge className={orderStatusClass(order.status)} variant="outline">
                          {order.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ACTIVITY TIMELINE */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customerDetails.activity.map((item, idx) => (
                <div key={idx} className="flex gap-4 pb-4 last:pb-0">
                  <div className="relative">
                    <div className="h-3 w-3 rounded-full bg-green-600 mt-1.5" />
                    {idx !== customerDetails.activity.length - 1 && (
                      <div className="absolute top-3 left-1.5 h-12 w-0.5 bg-border" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* PROFILE */}
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <img
                  src={customerDetails.image}
                  alt={customerDetails.name}
                  className="h-24 w-24 rounded-full border-2 object-cover"
                />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">{customerDetails.name}</p>
                <p className="text-sm text-muted-foreground">Active Customer</p>
              </div>
            </CardContent>
          </Card>

          {/* CONTACT INFORMATION */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{customerDetails.email}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{customerDetails.phone}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Country</p>
                  <div className="flex items-center gap-2 mt-1">
                    <img
                      src={`https://flagcdn.com/24x18/${customerDetails.country}.png`}
                      alt={countryData[customerDetails.country]?.name}
                      className="h-4 w-6 rounded-sm"
                    />
                    <p className="text-sm font-medium">
                      {countryData[customerDetails.country]?.name}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ACCOUNT INFORMATION */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Join Date</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{customerDetails.joinDate}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Account Status</p>
                <Badge className={statusClass(customerDetails.status)} variant="outline">
                  {customerDetails.status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* STATISTICS */}
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-muted-foreground">Total Orders</span>
                </div>
                <p className="font-semibold text-lg">{customerDetails.totalOrders}</p>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">Total Spent</span>
                </div>
                <p className="font-semibold text-lg">{customerDetails.totalSpent}</p>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-muted-foreground">Avg. Order</span>
                </div>
                <p className="font-semibold text-lg">
                  ${(parseFloat(customerDetails.totalSpent.replace('$', '')) / customerDetails.totalOrders).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
