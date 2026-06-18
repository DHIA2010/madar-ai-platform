"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle,
  XCircle,
  Truck,
  AlertCircle,
} from "lucide-react"

export function ProgressCards() {
  return (
    <div className="grid gap-6">

      {/* Total Amount Card */}
      <Card>
        <CardContent className="p-6">
          <h6 className="text-sm text-muted-foreground">Total amount</h6>

          <div className="flex items-center gap-3 mt-1">
            <h3 className="text-2xl font-bold">24,447</h3>
            <Badge className="bg-emerald-100 text-emerald-600 font-semibold">
              ↑ 11%
            </Badge>
          </div>

          {/* Multi-color Progress */}
          <div className="mt-4 h-2 w-full bg-muted rounded-full overflow-hidden flex">
            <div className="bg-blue-500 h-full" style={{ width: "35%" }} />
            <div className="bg-amber-500 h-full" style={{ width: "20%" }} />
            <div className="bg-cyan-500 h-full" style={{ width: "10%" }} />
          </div>

          {/* Legends */}
          <div className="flex justify-between mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Income
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              Expenses
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
              Transactions
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Completed */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="text-emerald-500 h-6 w-6" />
            <h5 className="font-bold text-lg">
              100%{" "}
              <span className="text-muted-foreground text-sm font-normal">
                Completed
              </span>
            </h5>
          </div>

          <Progress
            value={100}
            className="mt-3 h-1.5 bg-muted [&>div]:bg-emerald-500"
          />
        </CardContent>
      </Card>

      {/* Not Confirmed */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-500 h-6 w-6" />
            <h5 className="font-bold text-lg">
              75%{" "}
              <span className="text-muted-foreground text-sm font-normal">
                Not Confirmed!
              </span>
            </h5>
          </div>

          <Progress
            value={75}
            className="mt-3 h-1.5 bg-muted [&>div]:bg-red-500"
          />
        </CardContent>
      </Card>

      {/* Shipping */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <Truck className="text-blue-500 h-6 w-6" />
            <h5 className="font-bold text-lg">
              30%{" "}
              <span className="text-muted-foreground text-sm font-normal">
                Shipping ...
              </span>
            </h5>
          </div>

          <Progress
            value={30}
            className="mt-3 h-1.5 bg-muted [&>div]:bg-blue-500"
          />
        </CardContent>
      </Card>

      {/* Payment Pending */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-500 h-6 w-6" />
            <h5 className="font-bold text-lg">
              50%{" "}
              <span className="text-muted-foreground text-sm font-normal">
                Payment has not been made!
              </span>
            </h5>
          </div>

          <Progress
            value={50}
            className="mt-3 h-1.5 bg-muted [&>div]:bg-amber-500"
          />
        </CardContent>
      </Card>

    </div>
  )
}
