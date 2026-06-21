"use client"

import * as React from "react"
import Link from "next/link"
import { Building2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useStoreContextStore } from "@/store/store-context.store"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export interface AppBreadcrumbItem {
  label: React.ReactNode
  href?: string
  current?: boolean
}

export interface AppBreadcrumbProps extends React.ComponentProps<typeof Breadcrumb> {
  items: AppBreadcrumbItem[]
}

export function AppBreadcrumb({ items, className, ...props }: AppBreadcrumbProps) {
  return (
    <Breadcrumb className={className} {...props}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isCurrent = item.current ?? isLast

          return (
            <React.Fragment key={index}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {item.href && !isCurrent ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export interface AppToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export function AppToolbar({ leading, trailing, className, children, ...props }: AppToolbarProps) {
  return (
    <div
      data-slot="app-toolbar"
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 space-y-1">{leading ?? children}</div>
      {trailing ? <div className="flex flex-wrap items-center gap-3">{trailing}</div> : null}
    </div>
  )
}

export interface AppPageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  breadcrumbItems?: AppBreadcrumbItem[]
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function AppPageHeader({
  breadcrumbItems,
  title,
  subtitle,
  actions,
  className,
  ...props
}: AppPageHeaderProps) {
  const activeStore = useStoreContextStore((state) => state.activeStore)
  const loadActiveStore = useStoreContextStore((state) => state.loadActiveStore)

  React.useEffect(() => {
    loadActiveStore()
  }, [loadActiveStore])

  const contextChip = activeStore ? (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200">
      <Building2 className="size-3.5 text-slate-300" />
      <span className="font-medium text-slate-100">{activeStore.name}</span>
      <span className="text-slate-400">•</span>
      <span className="text-slate-300">{activeStore.platform}</span>
      <span className="text-slate-400">•</span>
      <span className="text-slate-300">{activeStore.country}</span>
    </div>
  ) : null

  return (
    <header data-slot="app-page-header" className={cn("space-y-4", className)} {...props}>
      {breadcrumbItems?.length ? <AppBreadcrumb items={breadcrumbItems} /> : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions || contextChip ? (
          <div className="flex flex-wrap items-center gap-3">
            {actions}
            {contextChip}
          </div>
        ) : null}
      </div>
    </header>
  )
}
