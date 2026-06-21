"use client"

import { CreditCardIcon, LogOutIcon, SettingsIcon, UserIcon, EllipsisVertical } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export const description = "An area chart with gradient fill"

const chartConfig = {
  desktop: {
    label: "المشاهدات",
  },
  mobile: {
    label: "النقرات",
  },
} satisfies ChartConfig

export default function ActivityInsights() {
  const { readModelViewModel } = useWidget("activity-insights")
  const payload = readModelViewModel?.payload

  const chartData =
    payload?.dataPoints?.map((point) => ({
      month: String(point.month ?? "-"),
      desktop: typeof point.impressions === "number" ? point.impressions : 0,
      mobile: typeof point.clicks === "number" ? point.clicks : 0,
    })) ?? []

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="text-right">
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <UserIcon />
              عرض التقرير التفصيلي
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <CreditCardIcon />
              تنزيل التقرير
            </DropdownMenuItem>
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <SettingsIcon />
              تصدير بصيغة CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex-row-reverse justify-start gap-2 text-right">
              <LogOutIcon />
              تحديث البيانات
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="text-right">
          <CardTitle className="text-xl mb-1">{payload?.title ?? "تحليلات النشاط"}</CardTitle>
          <CardDescription>
            {payload?.summary ?? "نظرة عامة على المستخدمين والأنشطة"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-72 w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              {/* Views */}

              <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FDBA74" stopOpacity={0.45} />

                <stop offset="55%" stopColor="#F59E0B" stopOpacity={0.22} />

                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>

              {/* Clicks */}

              <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#67E8F9" stopOpacity={0.45} />

                <stop offset="55%" stopColor="#0EA5E9" stopOpacity={0.22} />

                <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="mobile"
              type="natural"
              fill="url(#fillMobile)"
              stroke="#38BDF8"
              strokeWidth={3}
              fillOpacity={1}
            />

            <Area
              dataKey="desktop"
              type="natural"
              fill="url(#fillDesktop)"
              stroke="#F59E0B"
              strokeWidth={3}
              fillOpacity={1}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
