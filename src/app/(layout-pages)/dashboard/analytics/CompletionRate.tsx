"use client"

import {
  ArrowUp,
  ShieldHalf,
  Leaf,
  Lightbulb,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  CreditCardIcon,
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
import { useWidget } from "@/features/dashboard/hooks/use-widget"

export const description = "مخطط أعمدة لمعدل الإنجاز"

const chartConfig = {
  completion: {
    label: "الإنجاز",
  },
} satisfies ChartConfig

export default function CompletionRate() {
  const { readModelViewModel } = useWidget("completion-rate")
  const payload = readModelViewModel?.payload

  const chartData =
    payload?.dataPoints?.map((point) => ({
      month: String(point.month ?? "-"),
      completion: typeof point.completion === "number" ? point.completion : 0,
    })) ?? []

  const averageCompletion = chartData.length
    ? chartData.reduce((total, point) => total + point.completion, 0) / chartData.length
    : 0
  const firstValue = chartData[0]?.completion ?? 0
  const lastValue = chartData[chartData.length - 1]?.completion ?? 0
  const improvement = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0

  return (
    <Card className="h-auto w-full">
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
          <p className="text-md font-medium text-muted-foreground">
            {payload?.title ?? "معدل الإنجاز"}
          </p>

          <div className="mt-2 flex items-center gap-3">
            <h2 className="text-4xl font-bold tracking-tight">{averageCompletion.toFixed(1)}%</h2>

            <span
              className="
        flex items-center gap-1 rounded-full
        bg-emerald-500/10 px-2 py-1
        text-sm font-medium text-emerald-400
      "
            >
              <ArrowUp className="h-4 w-4" />
              {improvement.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Mini bar chart */}
        <ChartContainer config={chartConfig} className="h-[180px] w-full">
          <BarChart accessibilityLayer data={chartData} barSize={26}>
            <defs>
              <linearGradient id="CompletionbarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C084FC" />

                <stop offset="60%" stopColor="#A855F7" />

                <stop offset="100%" stopColor="#7E22CE" />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />

            <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />

            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />

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
                <p className="text-sm font-medium">الجلسات النشطة</p>

                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>

            <span className="text-sm font-medium text-emerald-400">
              +{Math.round(lastValue * 24)} هذا الأسبوع
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
                <p className="text-sm font-medium">العناصر المكتملة</p>

                <p className="text-xs text-muted-foreground">هذا الأسبوع</p>
              </div>
            </div>

            <span className="text-sm font-medium text-emerald-400">
              +{Math.round(lastValue * 20)} هذا الأسبوع
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
                <p className="text-sm font-medium">عمليات المتابعة</p>

                <p className="text-xs text-muted-foreground">آخر 7 أيام</p>
              </div>
            </div>

            <span className="text-sm font-medium text-emerald-400">
              +{Math.round(lastValue * 9)} هذا الأسبوع
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
