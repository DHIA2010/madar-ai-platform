"use client"

import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Printer,
  Download,
} from "lucide-react"
export default function InvoiceCard() {
  return (
    <Card className="mx-auto w-full">
      <CardContent className="space-y-8 p-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Invoice</h1>
            <p className="text-muted-foreground">
              #INV-001245
            </p>
          </div>

          {/* Logo */}
          <div className="text-3xl font-bold">
            <img src="https://codervent.com/reactboard/images/icons/amazon.png" alt="Company Logo" className="h-12 w-auto" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* FROM */}
          <div className="space-y-1 text-sm">
            <p className="font-medium">FROM:</p>
            <p className="font-semibold">
              ReactBoard Technologies
            </p>
            <p>123 Innovation Street</p>
            <p>San Francisco, CA 94107</p>
            <p>Email: support@reactboard.com</p>
            <p>Phone: +1 555 234 5678</p>
          </div>

          {/* BILL TO */}
          <div className="space-y-1 text-right text-sm">
            <p className="font-medium">BILL TO:</p>
            <p className="font-semibold">John Doe</p>
            <p>Pixel Studio Ltd.</p>
            <p>22 Green Valley Road</p>
            <p>Austin, TX 73301</p>
            <p>Email: john@pixelstudio.com</p>
            <p>Phone: +1 555 789 1234</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <p>
            <span className="font-medium">Invoice Date:</span>{" "}
            Oct 25, 2025
          </p>
          <p>
            <span className="font-medium">Due Date:</span>{" "}
            Nov 5, 2025
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="border px-4 py-3 text-left">
                  Description
                </th>
                <th className="border px-4 py-3 text-center">
                  Qty
                </th>
                <th className="border px-4 py-3 text-right">
                  Price
                </th>
                <th className="border px-4 py-3 text-right">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="border px-4 py-3">
                  ReactBoard Admin Template
                </td>
                <td className="border px-4 py-3 text-center">
                  1
                </td>
                <td className="border px-4 py-3 text-right">
                  $49.00
                </td>
                <td className="border px-4 py-3 text-right">
                  $49.00
                </td>
              </tr>

              <tr>
                <td className="border px-4 py-3">
                  Custom UI Kit Development
                </td>
                <td className="border px-4 py-3 text-center">
                  2
                </td>
                <td className="border px-4 py-3 text-right">
                  $120.00
                </td>
                <td className="border px-4 py-3 text-right">
                  $240.00
                </td>
              </tr>

              <tr>
                <td className="border px-4 py-3">
                  React Integration Support
                </td>
                <td className="border px-4 py-3 text-center">
                  1
                </td>
                <td className="border px-4 py-3 text-right">
                  $80.00
                </td>
                <td className="border px-4 py-3 text-right">
                  $80.00
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <div className="w-full max-w-sm rounded-md border p-4 text-sm">
            <div className="flex justify-between py-1">
              <span>Subtotal:</span>
              <span>$369.00</span>
            </div>

            <div className="flex justify-between py-1">
              <span>Tax (10%):</span>
              <span>$36.90</span>
            </div>

            <Separator className="my-2" />

            <div className="flex justify-between text-lg font-semibold">
              <span>Total:</span>
              <span>$405.90</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button>
            <Printer className="mr-2 h-4 w-4" />
            Print Invoice
          </Button>

          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
