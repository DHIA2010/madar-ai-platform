import { Card, CardContent } from "@/components/ui/card"
import { Bar, BarChart, XAxis } from "recharts"
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart"

const chartData = [
  { month: "January", conversion: 2.4 },
  { month: "February", conversion: 2.8 },
  { month: "March", conversion: 2.6 },
  { month: "April", conversion: 3.1 },
  { month: "May", conversion: 2.9 },
  { month: "June", conversion: 3.3 },
  { month: "July", conversion: 3.6 },
]

const chartConfig = {
  conversion: {
    label: "Conversion Rate",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export default function ConversionRateCard() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="mb-3">
          <p className="text-md text-muted-foreground">Conversion Rate</p>
          <h2 className="text-3xl font-semibold">3.6%</h2>
        </div>

        <p className="text-sm flex gap-2 mb-5">
          <span className="text-green-600 font-semibold">+0.4%</span>
          from last month
        </p>

        <ChartContainer config={chartConfig} className="h-14 w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <XAxis hide dataKey="month" />

            <defs>
                <linearGradient id="conversionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ee0979" stopOpacity={1} />
                    <stop offset="100%" stopColor="#ff6a00" stopOpacity={1} />
                </linearGradient>
            </defs>

            <Bar
              dataKey="conversion"
              fill="url(#conversionGradient)"
               radius={6}
              maxBarSize={15}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
