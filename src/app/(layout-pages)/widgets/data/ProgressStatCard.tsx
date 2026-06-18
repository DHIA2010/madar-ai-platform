import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type ProgressVariant = "success" | "danger" | "info" | "warning"

interface ProgressStatCardProps {
  title: string
  value: string
  progress: number
  badgeText: string
  variant?: ProgressVariant
}

const variantStyles: Record<ProgressVariant, {
  bar: string
  badge: string
}> = {
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
      <CardContent className="space-y-4 p-6">
        <p className="text-md text-muted-foreground font-medium">
          {title}
        </p>

        <h2 className="text-3xl font-bold">
          {value}
        </h2>

        <Progress
          value={progress}
          className={cn("h-1.5", styles.bar)}
        />

        <Badge
          variant="secondary"
          className={styles.badge}
        >
          {badgeText}
        </Badge>
      </CardContent>
    </Card>
  )
}
