import * as React from "react"

import { cn } from "@/lib/utils"

export interface AppPageProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean
}

export function AppPage({ className, children, ...props }: AppPageProps) {
  return (
    <main
      data-slot="app-page"
      className={cn("flex min-h-full w-full flex-col gap-6", className)}
      {...props}
    >
      {children}
    </main>
  )
}

export function AppContainer({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="app-container"
      className={cn("mx-auto w-full max-w-screen-2xl px-6 md:px-8", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function AppSection({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section data-slot="app-section" className={cn("space-y-4", className)} {...props}>
      {children}
    </section>
  )
}

type AppGridVariant = 1 | 2 | 3 | 4

const gridClasses: Record<AppGridVariant, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
}

export interface AppGridProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AppGridVariant
  dense?: boolean
}

export function AppGrid({
  className,
  variant = 3,
  dense = false,
  children,
  ...props
}: AppGridProps) {
  return (
    <div
      data-slot="app-grid"
      className={cn("grid gap-6", gridClasses[variant], dense && "grid-flow-dense", className)}
      {...props}
    >
      {children}
    </div>
  )
}
