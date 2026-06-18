import { Card, CardContent } from "@/components/ui/card"
import { Bar, BarChart, XAxis } from "recharts"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { month: "January", revenue: 420 },
  { month: "February", revenue: 560 },
  { month: "March", revenue: 780 },
  { month: "April", revenue: 610 },
  { month: "May", revenue: 540 },
  { month: "June", revenue: 390 },
  { month: "July", revenue: 480 },
]

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export default function TotalRevenueCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="mb-3">
          <p className="text-md text-muted-foreground">Total Revenue</p>
          <h2 className="text-3xl font-semibold">$92,460</h2>
        </div>

        <p className="text-sm flex gap-2 mb-5">
          <span className="text-red-600 font-semibold">-18.2%</span>
          from last month
        </p>

        <ChartContainer config={chartConfig} className="h-14 w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{
              top: 0,
              right: 0,
              left: 0,
              bottom: 0,
            }}
          >
            <XAxis
              hide
              dataKey="month"
              tickLine={false}
              axisLine={false}
            />

            <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#98ec2d" stopOpacity={1} />
                    <stop offset="100%" stopColor="#17ad37" stopOpacity={1} />
                </linearGradient>
            </defs>

            <Bar
              dataKey="revenue"
              fill="url(#revenueGradient)"
              radius={6}
              maxBarSize={15}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
