import Image from "next/image"

import { cn } from "@/lib/utils"

type PlatformLogoEntry = { src: string; alt: string; hex: string }

// Real, official logo files the user supplied directly (public/images/platforms/) -- not
// hand-drawn icon approximations. `hex` is the platform's real official brand color (verified
// via Simple Icons), kept separately from the raster logo for chart/sparkline coloring, since a
// baked-in raster image has no single extractable color. Every real platform-name string used
// anywhere in this app (Channels uses the ad-account-style "Google Ads"/"Meta Ads"/"TikTok Ads";
// Campaigns uses the per-campaign-type "Google Search"/"Google Display"/"Meta"/"TikTok"/the
// grouped node key "Google") maps to the same underlying logo, so any page can call PlatformBadge
// with whatever platform string it already has, with no per-page translation layer needed.
const GOOGLE_ADS: PlatformLogoEntry = {
  src: "/images/platforms/google-ads.png",
  alt: "Google Ads",
  hex: "#4285F4",
}
const YOUTUBE: PlatformLogoEntry = {
  src: "/images/platforms/youtube.avif",
  alt: "YouTube",
  hex: "#FF0000",
}
const SNAPCHAT: PlatformLogoEntry = {
  src: "/images/platforms/snapchat.jpg",
  alt: "Snapchat",
  hex: "#FFFC00",
}
const META: PlatformLogoEntry = { src: "/images/platforms/meta.webp", alt: "Meta", hex: "#0467DF" }
const TIKTOK: PlatformLogoEntry = {
  src: "/images/platforms/tiktok.png",
  alt: "TikTok",
  hex: "#000000",
}
const SALLA: PlatformLogoEntry = {
  src: "/images/platforms/salla.webp",
  alt: "Salla",
  hex: "#0d9488",
}
const SHOPIFY: PlatformLogoEntry = {
  src: "/images/platforms/shopify.webp",
  alt: "Shopify",
  hex: "#7AB55C",
}
const ZID: PlatformLogoEntry = { src: "/images/platforms/zid.png", alt: "Zid", hex: "#7c3aed" }

export const PLATFORM_ICON: Record<string, PlatformLogoEntry> = {
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

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-border/50",
        className
      )}
    >
      {entry ? (
        <Image
          src={entry.src}
          alt={entry.alt}
          fill
          className={cn("object-contain", iconClassName)}
        />
      ) : null}
    </span>
  )
}
