"use client"

// The platform marks used across the integrations surfaces. Extracted verbatim from
// connections-overview so the connections page and the new-connection wizard render the
// exact same logo for a given platform -- the wizard previously drew two-letter initials,
// which read as a different product on a screen the user reaches from the other one.
//
// `className` replaces the default frame (size/radius/border) rather than being appended,
// so callers that need a different chip shape -- the wizard's hero constellation, say --
// can restyle the frame without the artwork inside it changing.

import Image from "next/image"

import { cn } from "@/lib/utils"
import { ASSETS } from "@/constants/assets"

const DEFAULT_FRAME_CLASS =
  "size-10 shrink-0 rounded-lg border border-white/70 bg-white p-1 shadow-sm"

export function ConnectorLogo({
  platformName,
  className,
}: {
  platformName: string
  className?: string
}) {
  const frameClassName = className ?? DEFAULT_FRAME_CLASS

  if (platformName === "Google Analytics 4") {
    return (
      <div className={frameClassName} aria-label="Google Analytics 4 logo">
        <svg
          viewBox="0 0 36 36"
          width="36"
          height="36"
          className="size-full max-h-full max-w-full"
          role="img"
          aria-hidden="true"
        >
          <circle cx="10" cy="28" r="5" fill="#F9AB00" />
          <rect x="16" y="12" width="8" height="21" rx="4" fill="#F9AB00" />
          <rect x="26" y="4" width="8" height="29" rx="4" fill="#E37400" />
        </svg>
      </div>
    )
  }

  if (platformName === "Google Ads") {
    return (
      <div className={frameClassName} aria-label="Google Ads logo">
        <svg
          viewBox="0 0 36 36"
          width="36"
          height="36"
          className="size-full max-h-full max-w-full"
          role="img"
          aria-hidden="true"
        >
          <path
            d="M14 5a5 5 0 0 1 6.5 2L31 25a5 5 0 1 1-8.7 5L11.8 12A5 5 0 0 1 14 5Z"
            fill="#4285F4"
          />
          <path
            d="M8 10a5 5 0 0 1 6.9 1.8l8.7 14.9a5 5 0 1 1-8.7 5L6.3 17.8A5 5 0 0 1 8 10Z"
            fill="#34A853"
          />
          <circle cx="8" cy="30" r="5" fill="#FBBC04" />
        </svg>
      </div>
    )
  }

  if (platformName === "Meta Ads") {
    return (
      <div className={cn(frameClassName, "relative")} aria-label="Meta Ads logo">
        <Image src={ASSETS.platforms.meta} alt="Meta Ads" fill className="object-contain p-0.5" />
      </div>
    )
  }

  if (platformName === "TikTok Ads") {
    return (
      <div className={frameClassName} aria-label="TikTok Ads logo">
        <svg
          viewBox="0 0 36 36"
          width="36"
          height="36"
          className="size-full max-h-full max-w-full"
          role="img"
          aria-hidden="true"
        >
          <path d="M17 7v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#25F4EE" strokeWidth="3.2" />
          <path d="M19 7v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#FE2C55" strokeWidth="3.2" />
          <path d="M18 6v14.5a4.5 4.5 0 1 1-4-4.5" fill="none" stroke="#111827" strokeWidth="3.2" />
        </svg>
      </div>
    )
  }

  if (platformName === "Snapchat Ads") {
    return (
      <div className={frameClassName} aria-label="Snapchat Ads logo">
        <svg
          viewBox="0 0 36 36"
          width="36"
          height="36"
          className="size-full max-h-full max-w-full"
          role="img"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="32" height="32" rx="8" fill="#FFFC00" />
          <path
            d="M18 8c3.2 0 5.8 2.5 5.8 5.6v3c0 .9.3 1.7 1 2.2.7.5 1.7.8 1.7 1.6 0 .9-1 .9-1.8 1.1-.6.2-1.1.6-1.4 1.1-.5.8-1.8 1.2-3.1 1.2-.8 0-1.2.2-1.5.6l-.7 1h-1l-.7-1c-.3-.4-.7-.6-1.5-.6-1.3 0-2.6-.4-3.1-1.2-.3-.5-.8-.9-1.4-1.1-.8-.2-1.8-.2-1.8-1.1 0-.8 1-.9 1.7-1.6.7-.5 1-1.3 1-2.2v-3C12.2 10.5 14.8 8 18 8Z"
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth="1.2"
          />
        </svg>
      </div>
    )
  }

  if (platformName === "Salla") {
    return (
      <div className={cn(frameClassName, "relative")} aria-label="Salla logo">
        <Image src={ASSETS.platforms.salla} alt="Salla" fill className="object-contain p-0.5" />
      </div>
    )
  }

  if (platformName === "Shopify") {
    return (
      <div className={cn(frameClassName, "relative")} aria-label="Shopify logo">
        <Image src={ASSETS.platforms.shopify} alt="Shopify" fill className="object-contain p-0.5" />
      </div>
    )
  }

  if (platformName === "Zid") {
    return (
      <div className={cn(frameClassName, "relative")} aria-label="Zid logo">
        <Image src={ASSETS.platforms.zid} alt="Zid" fill className="object-contain p-0.5" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        frameClassName,
        "flex items-center justify-center text-xs font-semibold text-muted-foreground"
      )}
    >
      {platformName.slice(0, 2).toUpperCase()}
    </div>
  )
}
