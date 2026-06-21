import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarGrid } from "recharts"
import {
  ArrowUpRight,
  CreditCardIcon,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface RadialStatCardProps {
  title: string
  subtitle?: string
  value: number
  label: string
  trend?: string
  color?: string
}

export default function RadialStatCard({
  title,
  subtitle = "يناير - يونيو 2024",
  value,
  label,
  trend = "اتجاه تصاعدي",
  color = "#3b82f6",
}: RadialStatCardProps) {
  const data = [{ value }]

  return (
    <Card className="rounded-xl">
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
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground num-ltr">
            {subtitle}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-6 p-6">
        {/* Chart */}
        <div className="relative h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={data}
              startAngle={0}
              endAngle={250}
              innerRadius={80}
              outerRadius={110}
            >
              <PolarGrid
                gridType="circle"
                radialLines={false}
                stroke="none"
                className="first:fill-muted last:fill-background"
                polarRadius={[86, 74]}
              />
              {/* Background track */}
              <RadialBar
                dataKey="value"
                //maxAngle={260}
                // clockWise
                cornerRadius={999}
                fill={color}
                // background={{ fill: "#0e87ff" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold num-ltr">{value}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1">
          <div
            className="flex items-center justify-center gap-1 text-sm font-medium num-ltr"
            dir="ltr"
          >
            {trend}
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <p className="text-xs text-muted-foreground">عرض إجمالي الزوار خلال آخر 6 أشهر</p>
        </div>
      </CardContent>
    </Card>
  )
}
