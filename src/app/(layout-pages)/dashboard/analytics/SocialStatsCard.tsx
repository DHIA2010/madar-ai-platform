"use client"

import {
  Facebook,
  Twitter,
  Instagram,
  EllipsisVertical,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  CreditCardIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useWidget } from "@/features/dashboard/hooks/use-widget"

const ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-5 w-5 text-white" />,
  instagram: <Instagram className="h-5 w-5 text-white" />,
  tiktok: <span className="text-white font-bold">T</span>,
  x: <Twitter className="h-5 w-5 text-white" />,
  snapchat: <span className="text-white font-bold">S</span>,
}

const BGS = ["bg-blue-600", "bg-pink-500", "bg-emerald-500", "bg-sky-500", "bg-yellow-400"]

export default function SocialStatsCard() {
  const { readModelViewModel } = useWidget("social-stats")
  const payload = readModelViewModel?.payload
  const stats =
    payload?.dataPoints?.map((point, index) => {
      const channel = String(point.channel ?? "-")
      const normalized = channel.toLowerCase()
      const value = typeof point.value === "number" ? point.value : 0
      const changeValue = typeof point.change === "number" ? point.change : 0

      return {
        name: channel,
        category: String(point.category ?? "Marketing"),
        value: new Intl.NumberFormat("en-US").format(value),
        change: `${changeValue >= 0 ? "+" : ""}${changeValue.toFixed(1)}%`,
        positive: changeValue >= 0,
        icon: ICONS[normalized] ?? <span className="text-white font-bold">M</span>,
        bg: BGS[index % BGS.length],
      }
    }) ?? []

  const totalValue = stats.reduce((total, item) => total + Number(item.value.replace(/,/g, "")), 0)
  const averageChange = stats.length
    ? stats.reduce((total, item) => total + Number(item.change.replace("%", "")), 0) / stats.length
    : 0

  return (
    <Card className="w-full">
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
          <p className="text-lg font-medium">{payload?.title ?? "الأداء الاجتماعي"}</p>
          <div className="mt-2 flex items-baseline gap-3">
            <h2 className="text-3xl font-semibold">
              {new Intl.NumberFormat("en-US").format(totalValue)}
            </h2>
            <span className="text-sm font-medium text-green-600">
              {averageChange.toFixed(1)}% ↑
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {payload?.summary ?? "نظرة عامة على آخر سنة"}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-4">
        {stats.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.bg}`}>
                {item.icon}
              </div>
              <div>
                <p className="text-md font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.category}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold">{item.value}</span>
              <Badge
                className={
                  item.positive
                    ? `
        pointer-events-none shadow-none
        rounded-full px-3 text-xs font-medium
        bg-green-500/10 text-green-500 border border-green-500/20
      `
                    : `
        pointer-events-none shadow-none
        rounded-full px-3 text-xs font-medium
        bg-red-500/10 text-red-500 border border-red-500/20
      `
                }
              >
                {item.change}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
