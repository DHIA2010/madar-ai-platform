import * as React from "react"
import { cn } from "@/lib/utils"

type ColoredProgressProps = {
  value: number
  indicatorClassName?: string
  className?: string
}

export function ColoredProgress({
  value,
  indicatorClassName,
  className,
}: ColoredProgressProps) {
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          indicatorClassName
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
