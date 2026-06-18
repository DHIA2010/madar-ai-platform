"use client"
import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "lucide-react"

export function PaymentHistory() {
  const [payments] = useState([
    {
      id: 1,
      name: "John Doe",
      date: "2025-08-01",
      amount: 250.0,
      status: "Completed",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    {
      id: 2,
      name: "Jane Smith",
      date: "2025-07-28",
      amount: 120.5,
      status: "Pending",
      avatar: "https://randomuser.me/api/portraits/men/33.jpg",
    },
    {
      id: 3,
      name: "Robert Wilson",
      date: "2025-07-20",
      amount: 89.99,
      status: "Failed",
      avatar: "https://randomuser.me/api/portraits/men/3.jpg",
    },
    {
      id: 4,
      name: "Emily Johnson",
      date: "2025-07-18",
      amount: 560.0,
      status: "Completed",
      avatar: "https://randomuser.me/api/portraits/men/4.jpg",
    },
    {
      id: 5,
      name: "Michael Brown",
      date: "2025-07-12",
      amount: 45.75,
      status: "Pending",
      avatar: "https://randomuser.me/api/portraits/men/5.jpg",
    },
    {
      id: 6,
      name: "Sarah Lee",
      date: "2025-07-10",
      amount: 300.0,
      status: "Completed",
      avatar: "https://randomuser.me/api/portraits/men/6.jpg",
    },
    {
      id: 7,
      name: "David Kim",
      date: "2025-07-05",
      amount: 150.99,
      status: "Failed",
      avatar: "https://randomuser.me/api/portraits/men/7.jpg",
    },
    {
      id: 8,
      name: "Michle Jhon",
      date: "2025-07-06",
      amount: 190.2,
      status: "Dispatched",
      avatar: "https://randomuser.me/api/portraits/men/17.jpg",
    },
  ])

  const getStatusClass = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      case "Pending":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
      case "Failed":
        return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
      case "Dispatched":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
      default:
        return ""
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
       <CardHeader className="border-b py-4">
        <CardTitle className="text-xl font-medium">Payment History</CardTitle>
      </CardHeader>
      {/* Scrollable Content */}
      <CardContent className="p-0">
        <div className="max-h-[480px] overflow-y-auto">
          <ul className="divide-y">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40 transition"
              >
                {/* Left Section */}
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={payment.avatar}
                    alt={payment.name}
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">{payment.name}</p>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="mr-1 h-4 w-4 shrink-0" />
                      {payment.date}
                    </div>
                  </div>
                </div>

                {/* Right Section */}
                <div className="text-right shrink-0">
                  <p className="font-semibold">
                    ${payment.amount.toFixed(2)}
                  </p>
                  <Badge className={getStatusClass(payment.status)}>
                    {payment.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
