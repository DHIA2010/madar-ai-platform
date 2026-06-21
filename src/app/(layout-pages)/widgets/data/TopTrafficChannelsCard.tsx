import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import {
  Airplay,
  ChartColumnDecreasing,
  Clock,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreditCardIcon, EllipsisVertical, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"

export default function TopTrafficChannelsCard() {
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
          <CardTitle className="text-lg">أهم قنوات الزيارات</CardTitle>
          <CardDescription>بناءً على بيانات الزوار</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-6">
          {/* Revenue */}
          <div className="flex items-center gap-5">
            <div
              className="
        flex h-10 w-10 items-center justify-center rounded-xl
        bg-emerald-600/10 text-emerald-500
        flex-shrink-0 border border-emerald-500/20
      "
            >
              <Wallet className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">الإيرادات</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">$7,926</span>
                  <span className="flex items-center text-sm text-emerald-600">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    12%
                  </span>
                </div>
              </div>
              <Progress
                value={60}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-emerald-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* Active Users */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-indigo-600/10 text-indigo-500
  flex-shrink-0 border border-indigo-500/20
"
            >
              <UserRoundX className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">المستخدمون النشطون</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">428</span>
                  <span className="flex items-center text-sm text-indigo-600">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    8%
                  </span>
                </div>
              </div>
              <Progress
                value={75}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-indigo-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* Bounce Rate */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-pink-600/10 text-pink-500
  flex-shrink-0 border border-pink-500/20
"
            >
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">معدل الارتداد</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">42%</span>
                  <span className="flex items-center text-sm text-green-500">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    5%
                  </span>
                </div>
              </div>
              <Progress
                value={42}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-pink-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* Customer Retention */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-teal-600/10 text-teal-500
  flex-shrink-0 border border-teal-500/20
"
            >
              <Airplay className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">الاحتفاظ بالعملاء</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">78%</span>
                  <span className="flex items-center text-sm text-teal-500">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    3%
                  </span>
                </div>
              </div>
              <Progress
                value={78}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-teal-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* Average Session Duration */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-amber-600/10 text-amber-500
  flex-shrink-0 border border-amber-500/20
"
            >
              <Clock className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">متوسط مدة الجلسة</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">5m 20s</span>
                  <span className="flex items-center text-sm text-rose-500">
                    <TrendingDown className="mr-1 h-4 w-4" />
                    1m
                  </span>
                </div>
              </div>
              <Progress
                value={65}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-yellow-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* Conversion Rate */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-violet-600/10 text-violet-500
  flex-shrink-0 border border-violet-500/20
"
            >
              <ChartColumnDecreasing className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">معدل التحويل</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">3.6%</span>
                  <span className="flex items-center text-sm text-rose-500">
                    <TrendingDown className="mr-1 h-4 w-4" />
                    2%
                  </span>
                </div>
              </div>
              <Progress
                value={36}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-violet-500 [&>div]:rounded-full"
              />
            </div>
          </div>

          {/* New Signups */}
          <div className="flex items-center gap-5">
            <div
              className="
  flex h-10 w-10 items-center justify-center rounded-xl
  bg-orange-600/10 text-orange-500
  flex-shrink-0 border border-orange-500/20
"
            >
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-md text-muted-foreground">التسجيلات الجديدة</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">1,245</span>
                  <span className="flex items-center text-sm text-green-500">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    +12%
                  </span>
                </div>
              </div>
              <Progress
                value={55}
                className="mt-2 h-1.5 bg-muted [&>div]:bg-orange-500 [&>div]:rounded-full"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
