"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

import { AppInput } from "@/components/app"

import type { PublishPlatform } from "../services/campaign-publishing.service"

// The tracking words on an ad's link (utm_source, utm_medium, utm_campaign, utm_content), each
// in a box of its own under the link -- the way ad platforms ask for them. Madar fills every box
// itself; a box the person edits keeps what they typed, and the others keep following the
// campaign's name. The line at the end shows the link exactly as the platform will get it.

const TRACKING_SOURCE: Record<PublishPlatform, { source: string; medium: string }> = {
  snapchat: { source: "snapchat", medium: "paid_social" },
  tiktok: { source: "tiktok", medium: "paid_social" },
  meta: { source: "meta", medium: "paid_social" },
  google: { source: "google", medium: "cpc" },
}
const KEYS = ["source", "medium", "campaign", "content"] as const
type TrackingKey = (typeof KEYS)[number]
// What the person typed over Madar's own words. A key that is absent still follows the default.
export type TrackingEdits = Partial<Record<TrackingKey, string>>
// The words as they go out: every key present, an empty one meaning "leave it off the link".
export type ResolvedTracking = Record<TrackingKey, string>

// A name as a tracking word: lower case, letters and digits, the rest as underscores (the same
// rule the server uses).
export function trackingSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
}

// The words to send: Madar's own, with the person's edits over them.
export function resolveTracking(
  platform: PublishPlatform,
  defaults: { campaign: string; content?: string },
  edits: TrackingEdits
): ResolvedTracking {
  const own = {
    source: TRACKING_SOURCE[platform].source,
    medium: TRACKING_SOURCE[platform].medium,
    campaign: trackingSlug(defaults.campaign) || "campaign",
    content: trackingSlug(defaults.content ?? ""),
  }
  return {
    source: (edits.source ?? own.source).trim(),
    medium: (edits.medium ?? own.medium).trim(),
    campaign: (edits.campaign ?? own.campaign).trim(),
    content: (edits.content ?? own.content).trim(),
  }
}

// The link with the words on it, as the platform receives it; null while the link is not one.
export function trackedLink(url: string, tracking: ResolvedTracking): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== "https:") return null
    for (const key of KEYS) {
      const word = tracking[key]
      if (word) parsed.searchParams.set(`utm_${key}`, word)
      else parsed.searchParams.delete(`utm_${key}`)
    }
    return parsed.toString()
  } catch {
    return null
  }
}

const readable = (link: string) => {
  try {
    return decodeURI(link)
  } catch {
    return link
  }
}

export function CampaignTrackingFields({
  platform,
  url,
  defaults,
  edits,
  onChange,
  className,
}: {
  platform: PublishPlatform
  url: string
  defaults: { campaign: string; content?: string }
  edits: TrackingEdits
  onChange: (edits: TrackingEdits) => void
  className?: string
}) {
  const t = useTranslations("campaigns.publish.tracking")
  const tracking = resolveTracking(platform, defaults, edits)
  const link = trackedLink(url, tracking)
  return (
    <div className={cn("rounded-xl border border-[#e1e7f0] bg-[#fafbfe] p-4", className)}>
      <p className="text-[13px] font-bold text-[#0b1738]">{t("title")}</p>
      <p className="mt-1 text-[12px] leading-5 text-[#6b7b96]">{t("hint")}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {KEYS.map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#475467]">{t(key)}</span>
            <AppInput
              dir="ltr"
              maxLength={100}
              className="h-11 rounded-xl border-[#d5dce8] bg-white px-3 text-start text-[13px] font-medium text-[#0b1738]"
              value={edits[key] ?? tracking[key]}
              onChange={(event) => onChange({ ...edits, [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[12px] font-semibold text-[#475467]">{t("preview")}</p>
      <p
        dir="ltr"
        className="mt-1 break-all rounded-lg bg-white px-3 py-2 text-start text-[12px] leading-5 text-[#1d4fd8] ring-1 ring-[#e1e7f0]"
      >
        {/* Shown readable: Arabic words as written, not as percent codes. */}
        {link ? readable(link) : t("previewEmpty")}
      </p>
    </div>
  )
}
