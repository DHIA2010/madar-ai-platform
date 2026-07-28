import type { EmptyStateVariant } from "@/components/ui/empty-state"
import { EmptyState } from "@/components/ui/empty-state"
import type { ErrorStateVariant } from "@/components/ui/error-state"
import { ErrorState } from "@/components/ui/error-state"
import { LoadingCard } from "@/components/ui/loading-card"
import { LoadingChart } from "@/components/ui/loading-chart"
import { LoadingPage } from "@/components/ui/loading-page"
import { LoadingTable } from "@/components/ui/loading-table"

export type AppLoadingVariant = "page" | "card" | "chart" | "table"

export function AppLoading({
  variant = "page",
  ...props
}: {
  variant?: AppLoadingVariant
  cards?: number
  showChart?: boolean
  showTable?: boolean
  rows?: number
  columns?: number
  className?: string
}) {
  switch (variant) {
    case "card":
      return <LoadingCard {...props} />
    case "chart":
      return <LoadingChart {...props} />
    case "table":
      return <LoadingTable {...props} />
    case "page":
    default:
      return <LoadingPage {...props} />
  }
}

export function AppError({
  variant,
  title = "Something went wrong",
  description = "The request could not be completed.",
  retryLabel = "Retry",
  onRetry,
  className,
}: {
  variant?: ErrorStateVariant
  title?: string
  description?: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <ErrorState
      variant={variant}
      title={title}
      description={description}
      retryLabel={retryLabel}
      onRetry={onRetry}
      className={className}
    />
  )
}

export function AppEmpty({
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
  return (
    <EmptyState
      variant={variant}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
      className={className}
    />
  )
}
