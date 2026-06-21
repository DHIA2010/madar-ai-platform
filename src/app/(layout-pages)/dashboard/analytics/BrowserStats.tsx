"use client"

import * as React from "react"
import {
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  TrendingUp,
  UserIcon,
} from "lucide-react"
import { Label, Pie, PieChart, Cell } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export const description = "A donut chart with text"
const gradientMap: Record<string, [string, string]> = {
  meta: ["#EC4899", "#BE185D"],
  google: ["#67E8F9", "#0284C7"],
  tiktok: ["#4ADE80", "#15803D"],
  snapchat: ["#C084FC", "#7E22CE"],
  email: ["#FDBA74", "#EA580C"],
}

type TooltipEntry = {
  name?: string
  value?: number | string
}

type CustomTooltipProps = {
  active?: boolean
  payload?: TooltipEntry[]
}

const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-background p-2 shadow-md dir-ltr text-left">
      {payload.map((entry, index: number) => {
        const key = String(entry.name ?? "other").toLowerCase() // 👈 IMPORTANT
        const gradient = gradientMap[key]

        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            {/* ✅ Correct gradient */}
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: `linear-gradient(310deg, ${gradient[0]}, ${gradient[1]})`,
              }}
            />

            <span className="text-muted-foreground">{entry.name ?? "-"}</span>

            <span className="font-medium ms-auto num-ltr">{entry.value ?? 0}</span>
          </div>
        )
      })}
    </div>
  )
}

const chartConfig = {
  visitors: {
    label: "الزوار",
  },
  chrome: {
    label: "Chrome",
  },
  safari: {
    label: "Safari",
  },
  firefox: {
    label: "Firefox",
  },
  edge: {
    label: "Edge",
  },
  other: {
    label: "Other",
  },
} satisfies ChartConfig

export default function BrowserStats() {
  const { readModelViewModel } = useWidget("browser-stats")
  const payload = readModelViewModel?.payload
  const chartData =
    payload?.dataPoints?.map((point) => ({
      browser: String(point.channel ?? "other").toLowerCase(),
      visitors: typeof point.visitors === "number" ? point.visitors : 0,
    })) ?? []

  const totalVisitors = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.visitors, 0)
  }, [chartData])

  return (
    <Card className="h-auto w-full">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-0">
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
          <CardTitle className="text-lg mb-0 text-right">
            {payload?.title ?? "أعلى القنوات"}
          </CardTitle>
          <CardDescription className="num-ltr text-right">يناير - يونيو 2025</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-80 w-full">
          <PieChart>
            <ChartTooltip cursor={false} content={<CustomTooltip />} />
            {/* ✅ Define gradients */}
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ee0979" />
                <stop offset="100%" stopColor="#ff6a00" />
              </linearGradient>

              <linearGradient id="grad2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00c6fb" />
                <stop offset="100%" stopColor="#005bea" />
              </linearGradient>

              <linearGradient id="grad3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#17ad37" />
                <stop offset="100%" stopColor="#98ec2d" />
              </linearGradient>

              <linearGradient id="grad4" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7928ca" />
                <stop offset="100%" stopColor="#ff0080" />
              </linearGradient>

              <linearGradient id="grad5" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f7971e" />
                <stop offset="100%" stopColor="#ffd200" />
              </linearGradient>

              <filter id="donutGlow">
                <feGaussianBlur stdDeviation="2" result="blur" />

                <feMerge>
                  <feMergeNode in="blur" />

                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <Pie
              data={chartData}
              dataKey="visitors"
              nameKey="browser"
              innerRadius={75}
              outerRadius={120}
              cornerRadius={8}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={3}
              filter="url(#donutGlow)"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={`url(#grad${index + 1})`} // ✅ apply gradient
                />
              ))}

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
                          className="fill-foreground text-4xl font-bold tracking-tight num-ltr"
                        >
                          {totalVisitors.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 24}
                          className="fill-muted-foreground"
                        >
                          إجمالي الزوار
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex flex-wrap justify-center gap-2" dir="rtl">
          {chartData.map((item, index) => {
            const configKey = item.browser as keyof typeof chartConfig

            return (
              <div
                key={item.browser}
                className="
flex items-center gap-2

rounded-full

border border-border/50

bg-muted/30

px-3 py-1

backdrop-blur-sm
"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(310deg, ${gradientMap[item.browser]?.[0] ?? "#94A3B8"}, ${gradientMap[item.browser]?.[1] ?? "#475569"})`,
                  }}
                />
                <span className="text-muted-foreground">
                  {chartConfig[configKey]?.label ?? item.browser}
                </span>
              </div>
            )
          })}
        </div>
        <div
          className="
    mt-2 flex items-center gap-2

    rounded-full

    bg-emerald-500/10

    px-3 py-1

    text-emerald-400
  "
        >
          ارتفاع بمقدار <span className="num-ltr">5.2%</span> هذا الشهر{" "}
          <TrendingUp className="h-4 w-4" />
        </div>
      </CardFooter>
    </Card>
  )
}
