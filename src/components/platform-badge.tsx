import { Globe2, Music2, Radar, Sparkles, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const PLATFORM_ICON: Record<string, { icon: LucideIcon; className: string; hex: string }> = {
  "Google Ads": { icon: Radar, className: "bg-blue-50 text-blue-600", hex: "#2563eb" },
  Snapchat: { icon: Sparkles, className: "bg-amber-50 text-amber-600", hex: "#f59e0b" },
  "Meta Ads": { icon: Globe2, className: "bg-indigo-50 text-indigo-600", hex: "#4f46e5" },
  "TikTok Ads": { icon: Music2, className: "bg-slate-100 text-slate-700", hex: "#111827" },
}

interface PlatformBadgeProps {
  platform: string
  className?: string
  iconClassName?: string
}

export function PlatformBadge({ platform, className, iconClassName }: PlatformBadgeProps) {
  const entry = PLATFORM_ICON[platform]
  const Icon = entry?.icon ?? Globe2

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        entry?.className ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className={cn("size-4", iconClassName)} />
    </span>
  )
}
