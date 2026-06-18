"use client"

import { TrendingUp } from "lucide-react"
import { Area, AreaChart, XAxis } from "recharts"

import { Badge } from "@/components/ui/badge"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "An area chart with a legend"

const chartData = [
  { month: "January", desktop: 145 },
  { month: "February", desktop: 278 },
  { month: "March", desktop: 192 },
  { month: "April", desktop: 356 },
  { month: "May", desktop: 221 },
  { month: "June", desktop: 174 },
];


const chartConfig = {
  desktop: {
    label: "Revenue",
    color: "var(--chart-3)",
  }
} satisfies ChartConfig

export default function RevenueChartCard() {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <div>
            <CardDescription className="text-lg">Total Revenue</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                $1,250.00
            </CardTitle>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-green-600">
            <Badge
            variant="outline"
            className="gap-1 rounded-full text-green-600"
          >
            <TrendingUp className="h-4 w-4" />
             +12.5%
          </Badge>
         </div>
        </CardHeader>
        <CardContent>
        <ChartContainer config={chartConfig} className="mt-0 h-full w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="fillRevenueDesktop" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="#4ADE80"
                  stopOpacity={0.45}
                />
                <stop
                  offset="60%"
                  stopColor="#22C55E"
                  stopOpacity={0.22}
                />
                <stop
                  offset="100%"
                  stopColor="#16A34A"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <Area
              dataKey="desktop"
              type="natural"
              fill="url(#fillRevenueDesktop)"
              stroke="#22C55E"
              strokeWidth={3}
              fillOpacity={1}
            />
            <XAxis 
              hide 
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={0}
              tickFormatter={(value) => value.slice(0, 3)}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
