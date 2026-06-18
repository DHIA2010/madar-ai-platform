"use client"

import { TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "A responsive multiple bar chart"

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 173, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
  { month: "July", desktop: 260, mobile: 180 },
  { month: "August", desktop: 310, mobile: 220 },
  { month: "September", desktop: 280, mobile: 210 },
]

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--chart-2)",
  },
}

export default function BarChartPage() {
  return (
    <Card className="w-full">
      <CardHeader className="border-b space-y-1">
        <CardTitle>Bar Chart - Multiple</CardTitle>
        <CardDescription>January - December 2024</CardDescription>
      </CardHeader>

      <CardContent className="p-6">
        {/* Responsive Height */}
        <ChartContainer
          config={chartConfig}
          className="w-full h-[260px] sm:h-[320px] md:h-[380px]"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={25}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <CartesianGrid vertical={false} />

            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
              interval="preserveStartEnd"
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              width={35}
            />

            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dashed" />}
            />

            <Bar
              dataKey="desktop"
              fill="var(--color-desktop)"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
            />

            <Bar
              dataKey="mobile"
              fill="var(--color-mobile)"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>

      <CardFooter className="border-t pt-6">
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              January - June 2024
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
