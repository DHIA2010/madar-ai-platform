import { Store } from "lucide-react"

import { PLATFORM_LABEL } from "../services"
import type { PlatformKey } from "../types"

import { PLATFORM_ICON, PlatformBadge } from "@/components/platform-badge"

// Salla/Shopify/Zid already have real logo assets via PlatformBadge; WooCommerce/Other don't, so
// they fall back to a plain icon chip rather than inventing new brand image assets for a mock page.
export function PlatformChip({ platform }: { platform: PlatformKey }) {
  if (PLATFORM_ICON[platform]) {
    return (
      <div className="flex items-center gap-2">
        <PlatformBadge platform={platform} className="size-7" />
        <span className="text-sm text-foreground">{PLATFORM_LABEL[platform]}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border/50">
        <Store className="size-3.5" />
      </span>
      <span className="text-sm text-foreground">{PLATFORM_LABEL[platform]}</span>
    </div>
  )
}
