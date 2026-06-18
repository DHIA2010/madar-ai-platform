"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, XAxis } from "recharts"

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

const chartData = [
  { month: "January", desktop: 163 },
  { month: "February", desktop: 305 },
  { month: "March", desktop: 187 },
  { month: "April", desktop: 342 },
  { month: "May", desktop: 256 },
  { month: "June", desktop: 198 },
   
]

const chartConfig = {
  desktop: {
    label: "Visitors",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export default function VisitorsChartCard() {
  return (
    <Card className="overflow-hidden h-full">
      <CardHeader>
        <div>
          <CardDescription className="text-lg">Total Visitors</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            25,300
          </CardTitle>
        </div>
        <div className="flex items-center gap-1 text-sm font-medium text-green-600">
          <Badge
            variant="outline"
            className="gap-1 rounded-full text-green-600"
          >
            <TrendingUp className="h-4 w-4" />
            +8.4%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
       <ChartContainer config={chartConfig} className="mt-0 h-full w-full">
        <BarChart
            data={chartData}
            margin={{ left: 0, right: 0 }}
            barSize={18}
          >
            {/* ✅ Gradient Definition */}
            <defs>

  <linearGradient
    id="VisitorbarGradient"
    x1="0"
    y1="0"
    x2="0"
    y2="1"
  >
    <stop offset="0%" stopColor="#67E8F9" />
    <stop offset="60%" stopColor="#38BDF8" />
    <stop offset="100%" stopColor="#0284C7" />
  </linearGradient>

  <filter id="visitorGlow">

    <feGaussianBlur
      stdDeviation="2"
      result="blur"
    />

    <feMerge>

      <feMergeNode in="blur"/>

      <feMergeNode in="SourceGraphic"/>

    </feMerge>

  </filter>

</defs>

            <XAxis
              hide
              dataKey="month"
              axisLine={false}
              tickLine={false}
            />

            {/* ✅ Use gradient here */}
            <Bar
              dataKey="desktop"
              fill="url(#VisitorbarGradient)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
      </ChartContainer>
      </CardContent>
    </Card>
  )
}
