import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreditCardIcon, EllipsisVertical, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"
import { Area, Line, LineChart, ResponsiveContainer } from "recharts"

const sessionsData = [
  { value: 30 },
  { value: 45 },
  { value: 20 },
  { value: 60 },
  { value: 40 },
  { value: 70 },
  { value: 50 },
]

export default function TotalSessionsCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
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
          <CardTitle className="text-md font-semibold text-muted-foreground">
            إجمالي الجلسات
          </CardTitle>
          <CardDescription>آخر 7 أيام</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">4.5K</h2>
          <p className="text-md text-emerald-600">+8.2% مقارنة بالأسبوع الماضي</p>
        </div>

        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sessionsData}>
              <defs>
                {/* Area Fill */}

                <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.2} />

                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>

                {/* Line Gradient */}

                <linearGradient id="sessionsStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FBBF24" />

                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>

                {/* Glow */}

                <filter id="sessionsGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />

                  <feMerge>
                    <feMergeNode in="blur" />

                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <Area type="natural" dataKey="value" stroke="none" fill="url(#sessionsFill)" />

              <Line
                type="natural"
                dataKey="value"
                stroke="url(#sessionsStroke)"
                strokeWidth={3}
                filter="url(#sessionsGlow)"
                dot={{
                  r: 5,

                  strokeWidth: 2,

                  stroke: "#FBBF24",

                  fill: "var(--card)",
                }}
                activeDot={{
                  r: 7,

                  strokeWidth: 3,

                  stroke: "#FBBF24",

                  fill: "var(--card)",
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
