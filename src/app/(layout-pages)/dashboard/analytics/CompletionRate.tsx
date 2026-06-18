"use client"

import {
  ArrowUp, ShieldHalf, Leaf, Lightbulb, EllipsisVertical,
  LogOutIcon, SettingsIcon, UserIcon, CreditCardIcon
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export const description = "A bar chart with completion rate"

const chartData = [
  { month: "Jan", completion: 120 },
  { month: "Feb", completion: 180 },
  { month: "Mar", completion: 240 },
  { month: "Apr", completion: 210 },
  { month: "May", completion: 275 },
  { month: "Jun", completion: 190 },
]

const chartConfig = {
  completion: {
    label: "Completion",
  },
} satisfies ChartConfig

export default function CompletionRate() {
  return (
    <Card className="h-auto w-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <p className="text-md font-medium text-muted-foreground">
            Completion Rate
          </p>

          <div className="mt-2 flex items-center gap-3">
            <h2 className="text-4xl font-bold tracking-tight">
              87%
            </h2>

            <span
              className="
        flex items-center gap-1 rounded-full
        bg-emerald-500/10 px-2 py-1
        text-sm font-medium text-emerald-400
      "
            >
              <ArrowUp className="h-4 w-4" />
              25.8%
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full [&_svg]:size-5"
            >
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <UserIcon className="mr-2 h-4 w-4" />
              View detailed report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Download report
            </DropdownMenuItem>
            <DropdownMenuItem>
              <SettingsIcon className="mr-2 h-4 w-4" />
              Export as CSV / PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon className="mr-2 h-4 w-4" />
              Refresh data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {/* Mini bar chart */}
        <ChartContainer
          config={chartConfig}
          className="h-[180px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            barSize={26}
          >
            <defs>

              <linearGradient
                id="CompletionbarGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#C084FC"
                />

                <stop
                  offset="60%"
                  stopColor="#A855F7"
                />

                <stop
                  offset="100%"
                  stopColor="#7E22CE"
                />
              </linearGradient>

            </defs>

            <CartesianGrid
              vertical={false}
              stroke="rgba(255,255,255,.05)"
            />

            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />

            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />

            <Bar
              dataKey="completion"
              radius={[10, 10, 0, 0]}
              fill="url(#CompletionbarGradient)"
              activeIndex={chartData.length - 1}
            />
          </BarChart>
        </ChartContainer>

        {/* Stats */}
        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div
                className="
        flex h-10 w-10 items-center justify-center rounded-xl

        bg-blue-600/10 text-blue-600 border border-blue-500/20

        shadow-[0_0_15px_rgba(59,130,246,.15)]
      "
              >
                <ShieldHalf className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-medium">
                  Active Sessions
                </p>

                <p className="text-xs text-muted-foreground">
                  Last 7 days
                </p>
              </div>

            </div>

            <span className="text-sm font-medium text-emerald-400">
              +126 this week
            </span>

          </div>

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div
                className="
                  flex h-10 w-10 items-center justify-center rounded-xl

                  bg-rose-600/10 text-rose-600 border border-rose-500/20

                  shadow-[0_0_15px_rgba(244,63,94,.15)]
                "
              >
                <Lightbulb className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-medium">
                  Resolved Items
                </p>

                <p className="text-xs text-muted-foreground">
                  This week
                </p>
              </div>

            </div>

            <span className="text-sm font-medium text-emerald-400">
              +98 this week
            </span>

          </div>

          <div className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div
                className="
        flex h-10 w-10 items-center justify-center rounded-xl

        bg-violet-600/10 text-violet-600 border border-violet-500/20

        dark:shadow-[0_0_15px_rgba(168,85,247,.15)]
      "
              >
                <Leaf className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-medium">
                  Follow-ups Created
                </p>

                <p className="text-xs text-muted-foreground">
                  Last 7 days
                </p>
              </div>

            </div>

            <span className="text-sm font-medium text-emerald-400">
              +42 this week
            </span>

          </div>
        </div>
      </CardContent>
    </Card>
  )
}
