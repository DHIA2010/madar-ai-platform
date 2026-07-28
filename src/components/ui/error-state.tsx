import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ErrorStateVariant = "generic" | "network" | "unauthorized" | "forbidden"

type ErrorStatePreset = {
  title: string
  description: string
  retryLabel?: string
}

const ERROR_STATE_PRESETS: Record<ErrorStateVariant, ErrorStatePreset> = {
  generic: {
    title: "Something went wrong",
    description: "The request could not be completed.",
    retryLabel: "Retry",
  },
  network: {
    title: "Network connection issue",
    description: "Please check your internet connection and try again.",
    retryLabel: "Retry",
  },
  unauthorized: {
    title: "Unauthorized",
    description: "Your session may have expired. Sign in again to continue.",
    retryLabel: "Sign in",
  },
  forbidden: {
    title: "Access denied",
    description: "You do not have permission to view this resource.",
  },
}

export function ErrorState({
  variant = "generic",
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
  const preset = ERROR_STATE_PRESETS[variant]
  const resolvedTitle = title ?? preset.title
  const resolvedDescription = description ?? preset.description
  const resolvedRetryLabel = retryLabel ?? preset.retryLabel

  return (
    <Card className={cn("border-destructive/40", className)}>
      <CardHeader>
        <CardTitle>{resolvedTitle}</CardTitle>
        <CardDescription>{resolvedDescription}</CardDescription>
      </CardHeader>
      {onRetry && resolvedRetryLabel ? (
        <CardContent>
          <Button type="button" variant="outline" onClick={onRetry}>
            {resolvedRetryLabel}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  )
}
