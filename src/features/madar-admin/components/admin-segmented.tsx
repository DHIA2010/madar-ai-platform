"use client"

import { cn } from "@/lib/utils"

// The segmented control the other Madar Admin pages use (see the follow-ups page).
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ key: T; label: string; count?: number | null }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap rounded-[10px] border border-border/60 p-1">
      {options.map((option) => (
        <button
          key={String(option.key)}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
            value === option.key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
          {option.count ? (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-bold",
                value === option.key ? "bg-background/20" : "bg-muted text-foreground"
              )}
            >
              {option.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
