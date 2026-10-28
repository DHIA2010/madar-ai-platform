"use client"

import { Megaphone } from "lucide-react"

import { usePublicPlatformSettings } from "../hooks/use-pricing"

// The announcement Madar staff set in Madar Admin's platform settings -- shown at the top of every
// customer page while it's non-empty.
export function PlatformAnnouncementBanner() {
  const settings = usePublicPlatformSettings()
  const message = settings?.announcementBanner.trim()
  if (!message) return null
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-[#2878ff] px-4 py-2 text-center text-[12.5px] font-semibold text-white"
    >
      <Megaphone className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
