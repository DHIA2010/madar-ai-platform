import { Globe2, type LucideIcon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { cn } from "@/lib/utils"

import {
  GoogleAdsIcon,
  MetaIcon,
  SallaIcon,
  ShopifyIcon,
  SnapchatIcon,
  TikTokIcon,
  YouTubeIcon,
} from "./brand-icons"

type PlatformIconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>
type PlatformIconEntry = { icon: PlatformIconComponent; className: string; hex: string }

// One entry per real brand -- real marks + official colors from brand-icons.tsx (Simple Icons,
// verified), not generic lucide-react stand-ins. Zid has no published icon anywhere verifiable,
// so it intentionally falls back to a generic icon rather than a guessed/fabricated one.
const GOOGLE_ADS: PlatformIconEntry = {
  icon: GoogleAdsIcon,
  className: "bg-[#4285F4]/10 text-[#4285F4]",
  hex: "#4285F4",
}
const YOUTUBE: PlatformIconEntry = {
  icon: YouTubeIcon,
  className: "bg-[#FF0000]/10 text-[#FF0000]",
  hex: "#FF0000",
}
const SNAPCHAT: PlatformIconEntry = {
  icon: SnapchatIcon,
  className: "bg-[#FFFC00]/20 text-[#8a8500]",
  hex: "#FFFC00",
}
const META: PlatformIconEntry = {
  icon: MetaIcon,
  className: "bg-[#0467DF]/10 text-[#0467DF]",
  hex: "#0467DF",
}
const TIKTOK: PlatformIconEntry = {
  icon: TikTokIcon,
  className: "bg-slate-100 text-slate-900",
  hex: "#000000",
}
const SALLA: PlatformIconEntry = {
  icon: SallaIcon,
  className: "bg-[#BAF3E6]/40 text-[#0d9488]",
  hex: "#0d9488",
}
const SHOPIFY: PlatformIconEntry = {
  icon: ShopifyIcon,
  className: "bg-[#7AB55C]/10 text-[#7AB55C]",
  hex: "#7AB55C",
}
const ZID: PlatformIconEntry = {
  icon: Globe2,
  className: "bg-violet-50 text-violet-600",
  hex: "#7c3aed",
}

// Single shared source of truth for platform branding across the whole app (Campaigns, Channels,
// and anywhere else a platform is shown). Keyed by every real platform-name string actually used
// anywhere in this codebase (Channels uses the ad-account-style "Google Ads"/"Meta Ads"/"TikTok
// Ads"; Campaigns uses the per-campaign-type "Google Search"/"Google Display"/"Meta"/"TikTok"/
// the grouped node key "Google") -- so any page can call PlatformBadge with whatever platform
// string it already has, with no per-page translation layer needed.
export const PLATFORM_ICON: Record<string, PlatformIconEntry> = {
  "Google Ads": GOOGLE_ADS,
  "Google Search": GOOGLE_ADS,
  "Google Display": GOOGLE_ADS,
  Google: GOOGLE_ADS,
  YouTube: YOUTUBE,
  Snapchat: SNAPCHAT,
  "Meta Ads": META,
  Meta: META,
  "TikTok Ads": TIKTOK,
  TikTok: TIKTOK,
  Salla: SALLA,
  Shopify: SHOPIFY,
  Zid: ZID,
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
