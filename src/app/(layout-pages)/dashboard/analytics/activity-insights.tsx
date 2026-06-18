"use client"

import {
  CreditCardIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  EllipsisVertical
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "An area chart with gradient fill"

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: "Views",
  },
  mobile: {
    label: "Clicks",
  },
} satisfies ChartConfig

export default function ActivityInsights() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl mb-1">Activity Insights</CardTitle>
          <CardDescription>
            Overview of users and activities
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <UserIcon />
              View detailed report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCardIcon />
              Download report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SettingsIcon />
              Export as CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon />
              Refresh data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

  <linearGradient
    id="fillDesktop"
    x1="0"
    y1="0"
    x2="0"
    y2="1"
  >

    <stop
      offset="0%"
      stopColor="#FDBA74"
      stopOpacity={0.45}
    />

    <stop
      offset="55%"
      stopColor="#F59E0B"
      stopOpacity={0.22}
    />

    <stop
      offset="100%"
      stopColor="#F59E0B"
      stopOpacity={0}
    />

  </linearGradient>


  {/* Clicks */}

  <linearGradient
    id="fillMobile"
    x1="0"
    y1="0"
    x2="0"
    y2="1"
  >

    <stop
      offset="0%"
      stopColor="#67E8F9"
      stopOpacity={0.45}
    />

    <stop
      offset="55%"
      stopColor="#0EA5E9"
      stopOpacity={0.22}
    />

    <stop
      offset="100%"
      stopColor="#0EA5E9"
      stopOpacity={0}
    />

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
