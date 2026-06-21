"use client"

import {
  CircleCheckBig,
  ShieldHalf,
  OctagonX,
  CreditCardIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  EllipsisVertical,
} from "lucide-react"
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

export const description = "A radial chart with a custom shape"
const chartData = [{ browser: "safari", visitors: 1260, fill: "var(--color-safari)" }]
const chartConfig = {
  visitors: {
    label: "الزوار",
  },
  safari: {
    label: "Safari",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export default function TicketSupport() {
  return (
    <Card>
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
          <CardTitle className="text-lg mb-0">دعم التذاكر</CardTitle>
          <CardDescription>توزيع التذاكر خلال آخر 3 أشهر</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square
                     max-h-[280px] w-full"
        >
          <RadialBarChart
            data={chartData}
            endAngle={100}
            innerRadius={80}
            outerRadius={140}
            margin={{ top: 0, bottom: 0, left: 0, right: 0 }}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
            <RadialBar dataKey="visitors" background />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
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
                          className="fill-foreground text-4xl font-bold"
                        >
                          {chartData[0].visitors.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground"
                        >
                          التذاكر المحلولة
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>

        {/* Stats */}
        <div className="mt-0 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="
                                    flex h-10 w-10 items-center justify-center rounded-xl
                                    bg-emerald-600/10
                                    text-emerald-500
                                    border border-emerald-500/20
                                    flex-shrink-0"
              >
                <CircleCheckBig className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">التذاكر الجديدة</p>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <span className="text-sm font-medium text-green-600">845</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="
                                flex h-10 w-10 items-center justify-center rounded-xl
                                bg-amber-600/10
                                text-amber-500
                                border border-amber-500/20
                                flex-shrink-0"
              >
                <ShieldHalf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">التذاكر المفتوحة</p>
                <p className="text-xs text-muted-foreground">نشطة حالياً</p>
              </div>
            </div>
            <span className="text-sm font-medium text-yellow-600">620</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="
                                flex h-10 w-10 items-center justify-center rounded-xl
                                bg-rose-600/10
                                text-rose-500
                                border border-rose-500/20
                                flex-shrink-0"
              >
                <OctagonX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">زمن الاستجابة</p>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <span className="text-sm font-medium text-red-500">1.2 hrs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
