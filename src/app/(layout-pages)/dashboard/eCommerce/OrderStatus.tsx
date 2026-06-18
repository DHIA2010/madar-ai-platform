"use client"

import * as React from "react"
import { CircleCheckBig, ShieldHalf, OctagonX, CreditCardIcon, LogOutIcon, SettingsIcon, UserIcon, EllipsisVertical } from "lucide-react"
import { Label, Pie, PieChart, Cell } from "recharts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart"

export const description = "A donut chart with text"

const chartData = [
  { status: "completed", orders: 420 },
  { status: "processing", orders: 185 },
  { status: "pending", orders: 96 },
  { status: "cancelled", orders: 54 },
  { status: "refunded", orders: 32 },
]

const chartConfig = {
  orders: {
    label: "Orders",
  },
  completed: {
    label: "Completed",
  },
  processing: {
    label: "Processing",
  },
  pending: {
    label: "Pending",
  },
  cancelled: {
    label: "Cancelled",
  },
  refunded: {
    label: "Refunded",
  },
} satisfies ChartConfig


const gradientMap: Record<string, [string, string]> = {
  completed: ["#ee0979", "#ff6a00"],
  processing: ["#00c6fb", "#005bea"],
  pending: ["#17ad37", "#98ec2d"],
  cancelled: ["#7928ca", "#ff0080"],
  refunded: ["#f7971e", "#ffd200"],
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      {payload.map((entry: any, index: number) => {
        const key = entry.name.toLowerCase() // 👈 IMPORTANT
        const gradient = gradientMap[key]

        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            
            {/* ✅ Correct gradient */}
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: `linear-gradient(310deg, ${gradient[0]}, ${gradient[1]})`
              }}
            />

            <span className="text-muted-foreground">
              {entry.name}
            </span>

            <span className="font-medium ml-auto">
              {entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}


export default function OrderStatus() {
    const totalOrders = React.useMemo(() => {
  return chartData.reduce((acc, curr) => acc + curr.orders, 0)
}, [])


    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b py-3">
                <div>
                    <CardTitle className="text-lg mb-0">Order Status</CardTitle>
                    <CardDescription>
                        Order distribution in last 3 months
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
            <CardContent>
                <ChartContainer
                    config={chartConfig}
                    className="h-[280] w-full mx-auto"
                >
                    <PieChart>
                                            <ChartTooltip
                                                cursor={false}
                                                content={<CustomTooltip />}
                                            />
                                            {/* ✅ Define gradients */}
                                            <defs>
                                                <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#ee0979" />
                                                    <stop offset="100%" stopColor="#ff6a00" />
                                                </linearGradient>
                    
                                                <linearGradient id="grad2" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#00c6fb" />
                                                    <stop offset="100%" stopColor="#005bea" />
                                                </linearGradient>
                    
                                                <linearGradient id="grad3" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#17ad37" />
                                                    <stop offset="100%" stopColor="#98ec2d" />
                                                </linearGradient>
                    
                                                <linearGradient id="grad4" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#7928ca" />
                                                    <stop offset="100%" stopColor="#ff0080" />
                                                </linearGradient>
                    
                                                <linearGradient id="grad5" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#f7971e" />
                                                    <stop offset="100%" stopColor="#ffd200" />
                                                </linearGradient>
                                            </defs>
                                            <Pie
                                                data={chartData}
                                                dataKey="orders"     // ✅ FIX
                                                nameKey="status"     // ✅ FIX
                                                innerRadius={80}
                                                outerRadius={115}
                                                stroke="var(--card)"
                                                strokeWidth={3}
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={`url(#grad${index + 1})`}   // ✅ apply gradient
                                                    />
                                                ))}
                    
                                                <Label
                                                    content={({ viewBox }) => {
                                                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                                            return (
                                                                <text
                                                                    x={viewBox.cx}
                                                                    y={viewBox.cy}
                                                                    textAnchor="middle"
                                                                    dominantBaseline="middle"
                                                                >
                                                                    <tspan
                                                                        x={viewBox.cx}
                                                                        y={viewBox.cy}
                                                                        className="fill-foreground text-3xl font-bold"
                                                                    >
                                                                        {totalOrders.toLocaleString()}
                                                                    </tspan>
                                                                    <tspan
                                                                        x={viewBox.cx}
                                                                        y={(viewBox.cy ?? 0) + 24}
                                                                        className="fill-muted-foreground"
                                                                    >
                                                                        Visitors
                                                                    </tspan>
                                                                </text>
                                                            )
                                                        }
                                                    }}
                                                />
                                            </Pie>
                                        </PieChart>
                </ChartContainer>

                {/* Stats */}
                <div className="mt-8 space-y-5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600/10 text-green-400 border border-green-500/20">
                                <CircleCheckBig className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Completed Orders</p>
                                <p className="text-xs text-muted-foreground">Last 7 days</p>
                            </div>
                        </div>
                        <span className="text-sm font-medium text-green-600">+128</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-600/10 text-yellow-400 border border-yellow-500/20">
                                <ShieldHalf className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Processing Orders</p>
                                <p className="text-xs text-muted-foreground">Currently active</p>
                            </div>
                        </div>
                        <span className="text-sm font-medium text-yellow-600">46</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/10 text-red-400 border border-red-500/20">
                                <OctagonX className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Cancelled / Refunded</p>
                                <p className="text-xs text-muted-foreground">Last 7 days</p>
                            </div>
                        </div>
                        <span className="text-sm font-medium text-red-500">-12</span>
                    </div>
                </div>

            </CardContent>
        </Card>
    )
}
