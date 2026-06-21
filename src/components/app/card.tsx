import * as React from "react"

import { cn } from "@/lib/utils"

import { AppEmpty, AppError, AppLoading } from "@/components/app/feedback"
import { AppStatusBadge } from "@/components/app/status"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type AppCardState = "idle" | "loading" | "empty" | "error"

export interface AppCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  state?: AppCardState
  loadingProps?: React.ComponentProps<typeof AppLoading>
  errorProps?: React.ComponentProps<typeof AppError>
  emptyProps?: React.ComponentProps<typeof AppEmpty>
  headerClassName?: string
  contentClassName?: string
  footerClassName?: string
}

export function AppCard({
  title,
  subtitle,
  icon,
  actions,
  footer,
  state = "idle",
  loadingProps,
  errorProps,
  emptyProps,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
  children,
  ...props
}: AppCardProps) {
  const body =
    state === "loading" ? (
      <AppLoading variant="card" {...loadingProps} />
    ) : state === "error" ? (
      <AppError {...errorProps} />
    ) : state === "empty" ? (
      <AppEmpty {...emptyProps} />
    ) : (
      children
    )

  return (
    <Card className={cn("overflow-hidden", className)} {...props}>
      {title || subtitle || icon || actions ? (
        <CardHeader className={cn("flex-row items-start justify-between gap-4", headerClassName)}>
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <div className="shrink-0">{icon}</div> : null}
            <div className="min-w-0 space-y-1">
              {title ? <CardTitle className="text-base">{title}</CardTitle> : null}
              {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </CardHeader>
      ) : null}

      {body ? <CardContent className={cn(contentClassName)}>{body}</CardContent> : null}

      {footer ? (
        <CardFooter className={cn("justify-between", footerClassName)}>{footer}</CardFooter>
      ) : null}
    </Card>
  )
}

export interface AppStatCardProps extends Omit<AppCardProps, "children"> {
  value?: React.ReactNode
  change?: React.ReactNode
  changeStatus?: React.ComponentProps<typeof AppStatusBadge>["status"]
  changeLabel?: React.ReactNode
}

export function AppStatCard({
  value,
  change,
  changeStatus = "neutral",
  changeLabel,
  title,
  subtitle,
  icon,
  actions,
  footer,
  state,
  loadingProps,
  errorProps,
  emptyProps,
  className,
  ...props
}: AppStatCardProps) {
  return (
    <AppCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      actions={actions}
      footer={footer}
      state={state}
      loadingProps={loadingProps}
      errorProps={errorProps}
      emptyProps={emptyProps}
      className={className}
      {...props}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {value ? <div className="text-2xl font-semibold tracking-tight">{value}</div> : null}
          {change || changeLabel ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {changeLabel ? (
                <span className="text-sm text-muted-foreground">{changeLabel}</span>
              ) : null}
              {change ? <AppStatusBadge status={changeStatus} label={change} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}

export interface AppMetricCardProps extends Omit<AppCardProps, "children"> {
  metric?: React.ReactNode
  note?: React.ReactNode
  accent?: React.ReactNode
}

export function AppMetricCard({
  metric,
  note,
  accent,
  title,
  subtitle,
  icon,
  actions,
  footer,
  state,
  loadingProps,
  errorProps,
  emptyProps,
  className,
  ...props
}: AppMetricCardProps) {
  return (
    <AppCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      actions={actions}
      footer={footer}
      state={state}
      loadingProps={loadingProps}
      errorProps={errorProps}
      emptyProps={emptyProps}
      className={className}
      {...props}
    >
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {metric ? <div className="text-3xl font-semibold tracking-tight">{metric}</div> : null}
            {note ? <div className="mt-2 text-sm text-muted-foreground">{note}</div> : null}
          </div>
          {accent ? <div className="shrink-0">{accent}</div> : null}
        </div>
      </div>
    </AppCard>
  )
}
