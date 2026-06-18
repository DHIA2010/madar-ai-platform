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
  Truck,
  CreditCard,
  User,
  Package,
  Download,
  FileText,
  Printer,
} from "lucide-react"

const order = {
  id: "ORD-003",
  status: "Completed",
  paymentStatus: "Paid",
  date: "2024-02-03",
  total: "$245.75",
  subtotal: "$220.00",
  tax: "$15.75",
  shipping: "$10.00",
  customer: {
    name: "Michael Brown",
    email: "michael@example.com",
    avatar: "https://randomuser.me/api/portraits/men/30.jpg",
  },
  items: [
    {
      name: "Denim Jacket",
      price: "$120.00",
      qty: 1,
      image: "/pulse-ui-next/products/01.png",
    },
    {
      name: "Leather Belt",
      price: "$45.00",
      qty: 1,
      image: "/pulse-ui-next/products/02.png",
    },
    {
      name: "Cotton T-Shirt",
      price: "$25.00",
      qty: 2,
      image: "/pulse-ui-next/products/03.png",
    },
    {
      name: "Running Shoes",
      price: "$85.75",
      qty: 1,
      image: "/pulse-ui-next/products/04.png",
    },
  ],
}

const statusClass = (status: string) => {
  switch (status) {
    case "Completed":
      return "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
    case "Pending":
      return "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
    case "Cancelled":
      return "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function OrderDetails() {

  // Handle print invoice action
  const handlePrintInvoice = () => {
    window.print()
  }

  return (
    <div className="order-detail-page">

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 xl:col-span-8 space-y-6">

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon">
                <ArrowLeft />
              </Button>

              <div>
                <h2 className="text-2xl font-semibold">
                  Order ORD-003
                </h2>
                <p className="text-sm text-muted-foreground">
                  Placed on 2024-02-03
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Invoice Actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <FileText className="mr-1 h-4 w-4" />
                  Invoice
                </Button>

                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-4 w-4" />
                  PDF
                </Button>

                <Button variant="outline" size="sm" onClick={handlePrintInvoice}>
                  <Printer className="mr-1 h-4 w-4" />
                  Print
                </Button>
              </div>

              {/* Status */}
              <Badge className="bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400" variant="outline">
                Completed
              </Badge>
            </div>
          </div>
          
              {/* ORDER ITEMS */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Items</CardTitle>
                </CardHeader>

                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead className="text-right">
                          Total
                        </TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {order.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <img
                                src={item.image}
                                alt={item.name}
                                className="h-11 w-11 rounded-full border object-cover p-1 bg-muted/50"
                              />
                              <span className="font-medium">
                                {item.name}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>{item.price}</TableCell>
                          <TableCell>{item.qty}</TableCell>
                          <TableCell className="text-right">
                            {item.price}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              {/* ORDER ACTIVITY */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>✔ Order placed</p>
                  <p>✔ Payment confirmed</p>
                  <p>✔ Order completed</p>
                </CardContent>
              </Card>
        </div>
        <div className="col-span-12 lg:col-span-5 xl:col-span-4">
            <div className="space-y-6">
              {/* CUSTOMER */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <img
                    src={order.customer.avatar}
                    alt={order.customer.name}
                    className="h-14 w-14 rounded-full border object-cover"
                  />
                  <div>
                    <p className="font-medium">{order.customer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.customer.email}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* PAYMENT */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Method</span>
                    <span>Credit Card</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <Badge>{order.paymentStatus}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* ORDER SUMMARY */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{order.subtotal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{order.tax}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>{order.shipping}</span>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span>{order.total}</span>
                  </div>
                </CardContent>
              </Card>

              {/* ACTIONS */}
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Update status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Processing">Processing</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="outline" className="w-full">
                    Refund Order
                  </Button>

                  <Button
                    variant="destructive"
                    className="w-full"
                  >
                    Cancel Order
                  </Button>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>

    </div>
  )
}
