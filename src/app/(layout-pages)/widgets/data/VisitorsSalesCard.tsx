"use client"
import { useState } from "react"
import { Gauge, ShieldHalf, OctagonX } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

type Range = "weekly" | "monthly" | "yearly"

const chartData: Record<Range, any[]> = {
  weekly: [
    { label: "Mon", visitors: 40, sales: 60 },
    { label: "Tue", visitors: 55, sales: 75 },
    { label: "Wed", visitors: 50, sales: 70 },
    { label: "Thu", visitors: 65, sales: 90 },
    { label: "Fri", visitors: 70, sales: 95 },
    { label: "Sat", visitors: 60, sales: 80 },
    { label: "Sun", visitors: 75, sales: 110 },
  ],
  monthly: [
    { label: "Jan", visitors: 80, sales: 120 },
    { label: "Feb", visitors: 100, sales: 180 },
    { label: "Mar", visitors: 70, sales: 140 },
    { label: "Apr", visitors: 130, sales: 220 },
    { label: "May", visitors: 120, sales: 200 },
    { label: "Jun", visitors: 150, sales: 260 },
    { label: "Jul", visitors: 130, sales: 230 },
    { label: "Aug", visitors: 170, sales: 300 },
    { label: "Sep", visitors: 140, sales: 250 },
    { label: "Oct", visitors: 190, sales: 340 },
    { label: "Nov", visitors: 160, sales: 290 },
    { label: "Dec", visitors: 200, sales: 360 },
  ],
  yearly: [
    { label: "2021", visitors: 1200, sales: 1800 },
    { label: "2022", visitors: 1500, sales: 2300 },
    { label: "2023", visitors: 1800, sales: 2900 },
    { label: "2024", visitors: 2100, sales: 3400 },
    { label: "2025", visitors: 2400, sales: 3900 },
  ],
}

export default function VisitorsSalesCard() {
  const [range, setRange] = useState<Range>("monthly")

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row flex-wrap gap-3 items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">
            Visitors / Sales
          </CardTitle>
          <p className="text-sm text-emerald-600">
            ↑ 2.5% vs last period
          </p>
        </div>

        {/* Tabs Filter */}
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="h-8">
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="p-6 pt-0">
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData[range]}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient
  id="visitorsGradient"
  x1="0"
  y1="0"
  x2="0"
  y2="1"
>
  <stop
    offset="0%"
    stopColor="#22D3EE"
    stopOpacity={0.45}
  />

  <stop
    offset="50%"
    stopColor="#3B82F6"
    stopOpacity={0.18}
  />

  <stop
    offset="100%"
    stopColor="#3B82F6"
    stopOpacity={0}
  />
</linearGradient>
                <linearGradient
  id="salesGradient"
  x1="0"
  y1="0"
  x2="0"
  y2="1"
>
  <stop
    offset="0%"
    stopColor="#A855F7"
    stopOpacity={0.45}
  />

  <stop
    offset="50%"
    stopColor="#6366F1"
    stopOpacity={0.18}
  />

  <stop
    offset="100%"
    stopColor="#6366F1"
    stopOpacity={0}
  />
</linearGradient>

<filter id="cyanGlow">
  <feGaussianBlur
    stdDeviation="2"
    result="blur"
  />

  <feMerge>
    <feMergeNode in="blur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>

<filter id="purpleGlow">
  <feGaussianBlur
    stdDeviation="2"
    result="blur"
  />

  <feMerge>
    <feMergeNode in="blur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>


              </defs>

              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickMargin={10}
              />  
              
              <YAxis hide />

              <Tooltip
                  cursor={{
                    stroke: "rgba(255,255,255,.08)",
                    strokeWidth: 1,
                  }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    color: "var(--foreground)",
                  }}
                />

              <Area
                type="natural"
                dataKey="visitors"
                stroke="#22D3EE"
                strokeWidth={3}
                filter="url(#cyanGlow)"
                fill="url(#visitorsGradient)"
              />
              <Area
                type="natural"
                dataKey="sales"
                stroke="#8B5CF6"
                strokeWidth={3}
                filter="url(#purpleGlow)"
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>

        </div>

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{
  background:
    "linear-gradient(180deg,#22D3EE,#3B82F6)"
}} />
            Visitors
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{
  background:
    "linear-gradient(180deg,#A855F7,#6366F1)"
}} />
            Sales
          </div>
        </div>
        {/* Stats */}
          <div className="mt-8 space-y-5">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"> 
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white-600">
                          <Gauge className="h-5 w-5" />
                      </div>
                      <div>
                          <p className="text-sm font-medium">Completed Orders</p>
                          <p className="text-xs text-muted-foreground">Last 7 days</p>
                      </div>
                  </div>
                  <span className="text-sm font-medium text-green-600">+128</span>
              </div>  

              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white-600">
                          <ShieldHalf className="h-5 w-5" /> 
                      </div>
                      <div>
                          <p className="text-sm font-medium">Processing Orders</p>
                          <p className="text-xs text-muted-foreground">Currently active</p>
                      </div>
                  </div>
                  <span className="text-sm font-medium text-yellow-600">46</span>
              </div>
          </div>    

      </CardContent>
        
    </Card>
  )
}
