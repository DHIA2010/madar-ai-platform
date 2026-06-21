import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import { Badge, type badgeVariants } from "@/components/ui/badge"

export interface AppBadgeProps
  extends React.ComponentPropsWithoutRef<typeof Badge>, VariantProps<typeof badgeVariants> {}

export const AppBadge = React.forwardRef<HTMLSpanElement, AppBadgeProps>(
  ({ className, ...props }, ref) => <Badge ref={ref} className={className} {...props} />
)

AppBadge.displayName = "AppBadge"

type AppStatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const statusVariantMap: Record<AppStatusTone, AppBadgeProps["variant"]> = {
  success: "default",
  warning: "secondary",
  danger: "destructive",
  info: "outline",
  neutral: "ghost",
}

export interface AppStatusBadgeProps extends Omit<AppBadgeProps, "variant"> {
  status: AppStatusTone
  label?: React.ReactNode
}

export function AppStatusBadge({ status, label, className, ...props }: AppStatusBadgeProps) {
  return (
    <AppBadge variant={statusVariantMap[status]} className={cn(className)} {...props}>
      {label ?? status}
    </AppBadge>
  )
}

export type { AppStatusTone }
