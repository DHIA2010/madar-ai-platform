import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type EmptyStateVariant =
  | "no-data"
  | "no-search-results"
  | "no-campaigns"
  | "no-customers"
  | "no-reports"
  | "no-integrations"

type EmptyStatePreset = {
  title: string
  description?: string
  actionLabel?: string
}

const EMPTY_STATE_PRESETS: Record<EmptyStateVariant, EmptyStatePreset> = {
  "no-data": {
    title: "No data available",
    description: "There is nothing to display yet.",
  },
  "no-search-results": {
    title: "No search results",
    description: "Try refining your query or clearing active filters.",
    actionLabel: "Clear search",
  },
  "no-campaigns": {
    title: "No campaigns found",
    description: "Create your first campaign to start tracking performance.",
    actionLabel: "Create campaign",
  },
  "no-customers": {
    title: "No customers found",
    description: "Customer records will appear here once data sync is complete.",
    actionLabel: "Refresh data",
  },
  "no-reports": {
    title: "No reports available",
    description: "Generate your first report to see insights over time.",
    actionLabel: "Generate report",
  },
  "no-integrations": {
    title: "No integrations connected",
    description: "Connect a platform to start syncing marketing and commerce data.",
    actionLabel: "Connect integration",
  },
}

export function EmptyState({
  variant,
  title = "No data available",
  description,
  actionLabel,
  onAction,
  className,
}: {
  variant?: EmptyStateVariant
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}) {
  const preset = variant ? EMPTY_STATE_PRESETS[variant] : undefined
  const resolvedTitle = title ?? preset?.title ?? "No data available"
  const resolvedDescription = description ?? preset?.description
  const resolvedActionLabel = actionLabel ?? preset?.actionLabel

  return (
    <Card className={cn("border-dashed", className)}>
      <CardHeader>
        <CardTitle>{resolvedTitle}</CardTitle>
        {resolvedDescription ? <CardDescription>{resolvedDescription}</CardDescription> : null}
      </CardHeader>
      {resolvedActionLabel || onAction ? (
        <CardContent>
          <Button type="button" variant="outline" onClick={onAction} disabled={!onAction}>
            {resolvedActionLabel ?? "Try again"}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  )
}
