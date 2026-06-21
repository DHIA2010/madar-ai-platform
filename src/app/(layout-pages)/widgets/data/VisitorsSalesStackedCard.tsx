"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"
import {
  CircleCheckBig,
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  OctagonX,
  SettingsIcon,
  ShieldHalf,
  UserIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const chartData = {
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

type Range = "weekly" | "monthly" | "yearly"

export default function VisitorsSalesStackedCard() {
  const [range, setRange] = useState<Range>("monthly")

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
          <CardTitle className="text-lg font-semibold">الزوار / المبيعات</CardTitle>
          <p className="text-sm text-emerald-600">↑ 2.5% مقارنة بالفترة السابقة</p>
          <div className="mt-2 flex gap-1 rounded-lg border p-1">
            {(["weekly", "monthly", "yearly"] as Range[]).map((item) => (
              <Button
                key={item}
                size="sm"
                variant="ghost"
                className={cn("capitalize", range === item && "bg-muted font-semibold")}
                onClick={() => setRange(item)}
              >
                {item === "weekly" ? "أسبوعي" : item === "monthly" ? "شهري" : "سنوي"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData[range]}
              barGap={6}
              barSize={30}
              margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickMargin={10}
              />
              <YAxis tickLine={false} axisLine={false} className="text-xs" />
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  color: "var(--foreground)",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,.35)",
                }}
                labelStyle={{
                  color: "var(--foreground)",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
                itemStyle={{
                  color: "var(--foreground)",
                }}
              />

              <defs>
                {/* Visitors */}

                <linearGradient id="StackedvisitorsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" />

                  <stop offset="100%" stopColor="#2563EB" />
                </linearGradient>

                {/* Sales */}

                <linearGradient id="StackedsalesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A855F7" />

                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
              </defs>

              {/* Visitors */}
              <Bar
                dataKey="visitors"
                stackId="a"
                fill="url(#StackedvisitorsGradient)"
                radius={[0, 0, 6, 6]}
                name="الزوار"
              />

              {/* Sales */}
              <Bar
                dataKey="sales"
                stackId="a"
                fill="url(#StackedsalesGradient)"
                radius={[6, 6, 0, 0]}
                name="المبيعات"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm"
              style={{
                background: "linear-gradient(180deg,#22D3EE,#2563EB)",
              }}
            />
            الزوار
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm"
              style={{
                background: "linear-gradient(180deg,#A855F7,#6366F1)",
              }}
            />
            المبيعات
          </div>
        </div>
        {/* Stats */}
        <div className="mt-8 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600/10 text-green-500 border border-green-500/20">
                <CircleCheckBig className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">الطلبات المكتملة</p>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <span className="text-sm font-medium text-green-600">+128</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-600/10 text-yellow-500 border border-yellow-500/20">
                <ShieldHalf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">الطلبات قيد المعالجة</p>
                <p className="text-xs text-muted-foreground">نشطة حالياً</p>
              </div>
            </div>
            <span className="text-sm font-medium text-yellow-600">46</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/10 text-red-500 border border-red-500/20">
                <OctagonX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">الملغاة / المستردة</p>
                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>
            <span className="text-sm font-medium text-red-500">-12</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
