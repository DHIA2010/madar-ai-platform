"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Area, AreaChart, XAxis } from "recharts"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { month: "January", visitors: 145 },
  { month: "February", visitors: 278 },
  { month: "March", visitors: 192 },
  { month: "April", visitors: 356 },
  { month: "May", visitors: 221 },
  { month: "June", visitors: 174 },
  { month: "July", visitors: 680 },
]

const chartConfig = {
  visitors: {
    label: "Visitors",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export default function VisitorsCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="mb-3">
          <p className="text-md text-muted-foreground">Visitors</p>
          <h2 className="text-3xl font-semibold">18,432</h2>
        </div>

        <p className="text-sm flex gap-2 mb-5">
          <span className="text-green-600 font-semibold">+9.6%</span>
          from last month
        </p>

        <ChartContainer config={chartConfig} className="h-14 w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fillVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="#f76e1e" // orange
                  stopOpacity={0.6}
                />
                <stop
                  offset="95%"
                  stopColor="#ffc400" // orange
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <XAxis hide dataKey="month" />

            <Area
              type="monotone"
              dataKey="visitors"
              stroke="#ffc400"
              fill="url(#fillVisitors)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
