"use client"

import {
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  CreditCardIcon,
  UserIcon,
  ChartNoAxesCombined,
  GalleryVerticalEnd,
} from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "A multiple line chart"

const chartData = [
  { month: "January", desktop: 120, mobile: 95 },
  { month: "February", desktop: 280, mobile: 160 },
  { month: "March", desktop: 190, mobile: 145 },
  { month: "April", desktop: 95, mobile: 210 },
  { month: "May", desktop: 240, mobile: 175 },
  { month: "June", desktop: 310, mobile: 220 },
]

const chartConfig = {
  desktop: {
    label: "الزوار الجدد",
    color: "var(--chart-1)",
  },
  mobile: {
    label: "الزوار القدامى",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export default function NewVsOldVisitors() {
  return (
    <Card>
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
          <CardTitle className="text-lg font-medium">الزوار الجدد مقابل القدامى</CardTitle>
          <CardDescription>مقارنة شهرية للزوار</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <ChartContainer
          config={chartConfig}
          className="rounded-xl mx-auto aspect-square h-[280px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 10,
              right: 10,
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
            <Line
              dataKey="desktop"
              type="linear"
              stroke="#0bf5a7"
              strokeWidth={2}
              dot={{
                r: 4,
                strokeWidth: 2,
              }}
            />
            <Line
              dataKey="mobile"
              type="linear"
              stroke="var(--color-mobile)"
              strokeWidth={2}
              dot={{
                r: 4,
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ChartContainer>
        {/* Stats */}
        <div className="space-y-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600/10 text-green-500 border border-green-500/20">
                <GalleryVerticalEnd className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">الزوار القدامى</p>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-sm font-medium text-green-600 border-green-500/30 rounded-full"
            >
              <span className="text-xs font-medium text-green-600">+128</span>
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-500 border border-blue-500/20">
                <ChartNoAxesCombined className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">الزوار الجدد</p>
                <p className="text-xs text-muted-foreground">نشط حالياً</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-sm font-medium text-blue-600 border-blue-500/30 rounded-full"
            >
              <span className="text-xs font-medium text-blue-600">46</span>
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
