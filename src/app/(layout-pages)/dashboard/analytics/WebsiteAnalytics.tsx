"use client"

import {
  CreditCardIcon,
  DollarSign,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  TrendingDown,
  TrendingUp,
  UserIcon,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { Progress } from "@/components/ui/progress"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export default function WebsiteAnalytics() {
  const { readModelViewModel } = useWidget("website-analytics")
  const payload = readModelViewModel?.payload
  const metrics = payload?.dataPoints?.[0]

  const totalUsers = typeof metrics?.totalUsers === "number" ? metrics.totalUsers : 0
  const revenue = typeof metrics?.revenue === "number" ? metrics.revenue : 0
  const revenueDelta = typeof metrics?.revenueDelta === "number" ? metrics.revenueDelta : 0
  const activeUsers = typeof metrics?.activeUsers === "number" ? metrics.activeUsers : 0
  const activeDelta = typeof metrics?.activeDelta === "number" ? metrics.activeDelta : 0
  const conversionRate = typeof metrics?.conversionRate === "number" ? metrics.conversionRate : 0
  const conversionDelta = typeof metrics?.conversionDelta === "number" ? metrics.conversionDelta : 0

  return (
    <Card className="relative overflow-hidden h-full">
      {/* Gaussian Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />

      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full [&_svg]:size-5">
              <EllipsisVertical />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="text-right">
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
          <CardTitle className="mb-1 text-xl">{payload?.title ?? "تحليلات الموقع"}</CardTitle>

          <CardDescription>{payload?.summary ?? "نظرة عامة على بيانات الموقع"}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {/* Top Stats */}
        <div>
          <h2 className="text-4xl font-bold tracking-tight">
            {new Intl.NumberFormat("en-US", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(totalUsers)}
          </h2>

          <p className="mt-1 text-muted-foreground">إجمالي المستخدمين</p>
        </div>

        {/* Metrics */}
        <div className="mt-7 flex flex-col gap-7">
          {/* Revenue */}
          <div className="flex items-center gap-5">
            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-emerald-600/10 text-emerald-600 border border-emerald-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <DollarSign className="h-5 w-5" />
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">الإيرادات</span>

                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(revenue)}
                  </span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-emerald-500/10 px-2 py-0.5
                      text-sm text-emerald-400
                    "
                  >
                    <TrendingUp className="mr-1 h-4 w-4" />
                    {revenueDelta}%
                  </span>
                </div>
              </div>

              <Progress
                value={45}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#98ec2d,#17ad37)]

                  [&>div]:shadow-[0_0_14px_rgba(23,173,55,.35)]
                "
              />
            </div>
          </div>

          {/* Active Users */}
          <div className="flex items-center gap-5">
            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-rose-600/10 text-rose-600 border border-rose-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <Users className="h-5 w-5" />
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المستخدمون النشطون</span>

                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {new Intl.NumberFormat("en-US").format(activeUsers)}
                  </span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-emerald-500/10 px-2 py-0.5
                      text-sm text-emerald-400
                    "
                  >
                    <TrendingUp className="mr-1 h-4 w-4" />
                    {activeDelta}%
                  </span>
                </div>
              </div>

              <Progress
                value={60}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#ff4ecd,#ff0080)]

                  [&>div]:shadow-[0_0_14px_rgba(255,0,128,.35)]
                "
              />
            </div>
          </div>

          {/* Conversion Rate */}
          <div className="flex items-center gap-5">
            <div
              className="
                flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                bg-violet-600/10 text-violet-600 border border-violet-500/20
                shadow-[0_0_20px_rgba(168,85,247,.15)]
              "
            >
              <TrendingUp className="h-5 w-5" />
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">معدل التحويل</span>

                <div className="flex items-center gap-2">
                  <span className="font-medium">{conversionRate.toFixed(1)}%</span>

                  <span
                    className="
                      flex items-center rounded-full
                      bg-rose-500/10 px-2 py-0.5
                      text-sm text-rose-400
                    "
                  >
                    <TrendingDown className="mr-1 h-4 w-4" />
                    {Math.abs(conversionDelta)}%
                  </span>
                </div>
              </div>

              <Progress
                value={75}
                className="
                  mt-2 h-2 bg-muted

                  [&>div]:rounded-full

                  [&>div]:bg-[linear-gradient(90deg,#a855f7,#7c3aed)]

                  [&>div]:shadow-[0_0_14px_rgba(168,85,247,.35)]
                "
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
