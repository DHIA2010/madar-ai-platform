"use client"

import {
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  TrendingUp,
  UserIcon,
} from "lucide-react"
import { Area, AreaChart, XAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export const description = "An area chart with a legend"

const chartConfig = {
  desktop: {
    label: "الإيرادات",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

export default function RevenueChartCard() {
  const { readModelViewModel } = useWidget("revenue-chart")
  const payload = readModelViewModel?.payload

  const chartData =
    payload?.dataPoints?.map((point) => ({
      month: String(point.month ?? "-"),
      desktop: typeof point.value === "number" ? point.value : 0,
    })) ?? []

  const totalRevenue = chartData.reduce((total, point) => total + point.desktop, 0)
  const firstValue = chartData[0]?.desktop ?? 0
  const lastValue = chartData[chartData.length - 1]?.desktop ?? 0
  const trend = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-right">
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <UserIcon className="h-4 w-4 shrink-0" />
              عرض التقرير التفصيلي
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <CreditCardIcon className="h-4 w-4 shrink-0" />
              تنزيل التقرير
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <SettingsIcon className="h-4 w-4 shrink-0" />
              تصدير بصيغة CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <LogOutIcon className="h-4 w-4 shrink-0" />
              تحديث البيانات
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="text-right">
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(totalRevenue)}
          </CardTitle>
          <CardDescription className="text-lg">
            {payload?.title ?? "إجمالي الإيرادات"}
          </CardDescription>
          <div className="mt-2 flex items-center justify-end gap-1 text-sm font-medium text-green-600">
            <Badge variant="outline" className="gap-1 rounded-full text-green-600">
              <TrendingUp className="h-4 w-4" />
              {trend >= 0 ? "+" : ""}
              {trend.toFixed(1)}%
            </Badge>
          </div>
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
                <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.45} />
                <stop offset="60%" stopColor="#22C55E" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
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
