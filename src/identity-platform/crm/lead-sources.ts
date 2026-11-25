import type { CrmAttribution } from "./types"

// The lead source names the CRM starts with (migration 196 seeds the same list).
export const DEFAULT_LEAD_SOURCES = [
  "سناب شات",
  "جوجل",
  "تيك توك",
  "ميتا",
  "واتساب",
  "إكس",
  "توصية",
  "زيارة ميدانية",
]

// An ad platform or site as it shows up in UTM tags, click ids and referrers, by its name in the
// dropdown.
const PLATFORM_SOURCE: [string, string][] = [
  ["snapchat", "سناب شات"],
  ["snap", "سناب شات"],
  ["google", "جوجل"],
  ["adwords", "جوجل"],
  ["youtube", "جوجل"],
  ["tiktok", "تيك توك"],
  ["facebook", "ميتا"],
  ["instagram", "ميتا"],
  ["meta", "ميتا"],
  ["fb", "ميتا"],
  ["ig", "ميتا"],
  ["whatsapp", "واتساب"],
  ["wa", "واتساب"],
  ["twitter", "إكس"],
  ["x", "إكس"],
  ["t.co", "إكس"],
]

const named = (value: string) => {
  const key = value.trim().toLowerCase()
  return PLATFORM_SOURCE.find(([platform]) => platform === key)?.[1] ?? null
}

// A referrer's site, by the platform it belongs to (www.google.com.sa -> جوجل).
const fromReferrer = (referrer: string) => {
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return null
  }
  const match = PLATFORM_SOURCE.find(
    ([platform]) => platform.length > 2 && host.split(".").includes(platform)
  )
  return match?.[1] ?? (host === "t.co" ? "إكس" : null)
}

// The source worked out from a lead's ad tags: its UTM source (by name when it's a known
// platform, else as written), else the ad platform of its click id, else the site that referred
// it. The first visit is used, unless it carried no tags and the latest one did -- the rule the
// rest of the CRM uses.
export function autoLeadSource(attribution: CrmAttribution | null | undefined): string | null {
  const first = attribution?.first
  const last = attribution?.last
  const tagged = (touch: typeof first) => Boolean(touch?.source || touch?.clickId)
  const touch = !tagged(first) && tagged(last) ? last : first
  if (!touch) return null
  if (touch.source?.trim()) return named(touch.source) ?? touch.source.trim().slice(0, 80)
  if (touch.clickIdType) {
    const byClick = named(touch.clickIdType)
    if (byClick) return byClick
  }
  return touch.referrer ? fromReferrer(touch.referrer) : null
}
