import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function EmptyState({
  title = "No data available",
  description,
  actionLabel,
  onAction,
  className,
}: {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {actionLabel || onAction ? (
        <CardContent>
          <Button type="button" variant="outline" onClick={onAction} disabled={!onAction}>
            {actionLabel ?? "Try again"}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  )
}
