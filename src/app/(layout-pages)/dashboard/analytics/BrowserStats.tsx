"use client"

import * as React from "react"
import { TrendingUp } from "lucide-react"
import { Label, Pie, PieChart, Cell } from "recharts"


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
    type ChartConfig,
} from "@/components/ui/chart"

export const description = "A donut chart with text"

const chartData = [
    { browser: "chrome", visitors: 275 },
    { browser: "safari", visitors: 200 },
    { browser: "firefox", visitors: 287 },
    { browser: "edge", visitors: 173 },
    { browser: "other", visitors: 190 },
]
const gradientMap: Record<string, [string, string]> = {
  chrome: ["#EC4899", "#BE185D"],
  safari: ["#67E8F9", "#0284C7"],
  firefox: ["#4ADE80", "#15803D"],
  edge: ["#C084FC", "#7E22CE"],
  other: ["#FDBA74", "#EA580C"],
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      {payload.map((entry: any, index: number) => {
        const key = entry.name.toLowerCase() // 👈 IMPORTANT
        const gradient = gradientMap[key]

        return (
          <div key={index} className="flex items-center gap-2 text-sm">
            
            {/* ✅ Correct gradient */}
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: `linear-gradient(310deg, ${gradient[0]}, ${gradient[1]})`
              }}
            />

            <span className="text-muted-foreground">
              {entry.name}
            </span>

            <span className="font-medium ml-auto">
              {entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const chartConfig = {
    visitors: {
        label: "Visitors",
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
    const totalVisitors = React.useMemo(() => {
        return chartData.reduce((acc, curr) => acc + curr.visitors, 0)
    }, [])

    return (
        <Card className="h-auto w-full">
            <CardHeader className="items-center pb-0">
                <CardTitle className="text-lg mb-0">Browser Audience</CardTitle>
                <CardDescription>January - June 2025</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pb-0">
                <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square h-80 w-full"
                >
                    <PieChart>
                        <ChartTooltip
                            cursor={false}
                            content={<CustomTooltip />}
                        />
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

  <feGaussianBlur
    stdDeviation="2"
    result="blur"
  />

  <feMerge>

    <feMergeNode in="blur"/>

    <feMergeNode in="SourceGraphic"/>

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
                                    fill={`url(#grad${index + 1})`}   // ✅ apply gradient
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
                                                    className="fill-foreground text-4xl font-bold tracking-tight"
                                                >
                                                    {totalVisitors.toLocaleString()}
                                                </tspan>
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={(viewBox.cy ?? 0) + 24}
                                                    className="fill-muted-foreground"
                                                >
                                                    Total Visitors
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
                <div className="flex flex-wrap justify-center gap-2">
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
                                        background: `linear-gradient(310deg, ${gradientMap[item.browser]?.[0]}, ${gradientMap[item.browser]?.[1]})`
                                    }}
                                />
                                <span className="text-muted-foreground">
                                    {chartConfig[configKey]?.label}
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
                    Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
                </div>
            </CardFooter>
        </Card>
    )
}
