import * as React from "react"

import { cn } from "@/lib/utils"

import { AppCard } from "@/components/app/card"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export {
  ChartContainer as AppChartPrimitiveContainer,
  ChartLegend as AppChartPrimitiveLegend,
  ChartLegendContent as AppChartPrimitiveLegendContent,
  ChartTooltip as AppChartPrimitiveTooltip,
  ChartTooltipContent as AppChartPrimitiveTooltipContent,
}
export type { ChartConfig as AppChartPrimitiveConfig } from "@/components/ui/chart"

export interface AppChartHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function AppChartHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: AppChartHeaderProps) {
  return (
    <div
      data-slot="app-chart-header"
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
      {...props}
    >
      <div className="space-y-1">
        {title ? <div className="text-base font-medium leading-none">{title}</div> : null}
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}

export interface AppChartLegendItem {
  label: React.ReactNode
  value?: React.ReactNode
  color?: string
  icon?: React.ReactNode
}

export interface AppChartLegendProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AppChartLegendItem[]
}

export function AppChartLegend({ items, className, ...props }: AppChartLegendProps) {
  return (
    <div
      data-slot="app-chart-legend"
      className={cn(
        "flex flex-wrap items-center gap-3 text-[11px] font-medium text-muted-foreground",
        className
      )}
      {...props}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-2.5 py-1.5 shadow-sm"
        >
          {item.icon ? (
            <span aria-hidden="true" className="shrink-0">
              {item.icon}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={item.color ? { backgroundColor: item.color } : undefined}
            />
          )}
          <span className="text-foreground/85">{item.label}</span>
          {item.value ? <span className="font-semibold text-foreground">{item.value}</span> : null}
        </div>
      ))}
    </div>
  )
}

export interface AppChartCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  loading?: boolean
  error?: boolean
  empty?: boolean
  loadingProps?: React.ComponentProps<typeof AppCard>["loadingProps"]
  errorProps?: React.ComponentProps<typeof AppCard>["errorProps"]
  emptyProps?: React.ComponentProps<typeof AppCard>["emptyProps"]
}

export function AppChartCard({
  title,
  subtitle,
  actions,
  footer,
  loading = false,
  error = false,
  empty = false,
  loadingProps,
  errorProps,
  emptyProps,
  className,
  children,
  ...props
}: AppChartCardProps) {
  return (
    <AppCard
      title={title}
      subtitle={subtitle}
      actions={actions}
      footer={footer}
      state={loading ? "loading" : error ? "error" : empty ? "empty" : "idle"}
      loadingProps={loadingProps}
      errorProps={errorProps}
      emptyProps={emptyProps}
      className={className}
      {...props}
    >
      {children}
    </AppCard>
  )
}
