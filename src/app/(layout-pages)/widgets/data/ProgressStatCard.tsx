import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreditCardIcon, EllipsisVertical, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react"

type ProgressVariant = "success" | "danger" | "info" | "warning"

interface ProgressStatCardProps {
  title: string
  value: string
  progress: number
  badgeText: string
  variant?: ProgressVariant
}

const variantStyles: Record<
  ProgressVariant,
  {
    bar: string
    badge: string
  }
> = {
  success: {
    bar: "[&>div]:bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-700 dark:text-emerald-100",
  },
  danger: {
    bar: "[&>div]:bg-rose-500",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-700 dark:text-rose-100",
  },
  info: {
    bar: "[&>div]:bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-100",
  },
  warning: {
    bar: "[&>div]:bg-yellow-500",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-100",
  },
}

export default function ProgressStatCard({
  title,
  value,
  progress,
  badgeText,
  variant = "success",
}: ProgressStatCardProps) {
  const styles = variantStyles[variant]

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
          <CardTitle className="text-md text-muted-foreground font-medium text-right">
            {title}
          </CardTitle>
          <CardDescription>آخر تحديث</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6 text-right">
        <h2 className="text-3xl font-bold num-ltr">{value}</h2>

        <Progress value={progress} className={cn("h-1.5", styles.bar)} />

        <Badge variant="secondary" className={`${styles.badge} num-ltr`}>
          {badgeText}
        </Badge>
      </CardContent>
    </Card>
  )
}
