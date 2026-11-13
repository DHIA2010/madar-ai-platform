// Where a visitor to madar.my came from -- an ad's UTM tags and click id, or the referring site --
// kept in their browser for 90 days and sent along with the talk-to-sales form and the sign-up,
// so the CRM can tell which campaign brought each lead.
//
// madar.my and app.madar.my are different origins (separate storage), so links from the site
// to the app carry the saved touches in a `_ma` query parameter, and the app saves them in turn.

export interface AttributionTouch {
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  // An ad platform's click id (Snapchat ScCid, Google gclid, Meta fbclid, TikTok ttclid...).
  clickId: string | null
  clickIdType: string | null
  // An outside site that linked here (when there were no UTM tags).
  referrer: string | null
  landingPage: string
  at: string
}

// The first touch (what brought them) and the latest one.
export interface Attribution {
  first: AttributionTouch
  last: AttributionTouch
}

const STORAGE_KEY = "madar_attribution"
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
export const ATTRIBUTION_PARAM = "_ma"

const CLICK_IDS = [
  ["ScCid", "snapchat"],
  ["sccid", "snapchat"],
  ["gclid", "google"],
  ["gbraid", "google"],
  ["wbraid", "google"],
  ["fbclid", "meta"],
  ["ttclid", "tiktok"],
  ["msclkid", "microsoft"],
  ["twclid", "x"],
] as const

// True for a query parameter that only says where a visitor came from (UTM tags, an ad click id,
// the site's hand-over). The app loads its ad pixels only on URLs made of these -- anything else
// (an invitation or install token) must never reach an ad platform.
export function isAttributionParam(key: string): boolean {
  return key === ATTRIBUTION_PARAM || key.startsWith("utm_") || CLICK_IDS.some(([id]) => id === key)
}

const clip = (value: string | null, max = 200) =>
  value ? value.trim().slice(0, max) || null : null

// A touch from this page's URL and referrer, or null when it says nothing about where they came
// from (no tags, no click id, and an internal or missing referrer).
function touchFromLocation(): AttributionTouch | null {
  const params = new URLSearchParams(window.location.search)
  const click = CLICK_IDS.find(([key]) => params.get(key))
  let referrer: string | null = null
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : ""
    const own = window.location.hostname.replace(/^(www|app)\./, "")
    if (host && !host.endsWith(own)) referrer = host
  } catch {
    referrer = null
  }
  const touch: AttributionTouch = {
    source: clip(params.get("utm_source")) ?? (click ? click[1] : null),
    medium: clip(params.get("utm_medium")) ?? (click ? "paid" : null),
    campaign: clip(params.get("utm_campaign")),
    content: clip(params.get("utm_content")),
    term: clip(params.get("utm_term")),
    clickId: click ? clip(params.get(click[0])) : null,
    clickIdType: click ? click[1] : null,
    referrer,
    landingPage: window.location.pathname.slice(0, 300),
    at: new Date().toISOString(),
  }
  return touch.source || touch.clickId || touch.referrer ? touch : null
}

function read(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Attribution
    if (!saved?.first?.at || Date.now() - new Date(saved.first.at).getTime() > MAX_AGE_MS) {
      return null
    }
    return saved
  } catch {
    return null
  }
}

function write(value: Attribution) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Private mode / storage off: attribution is best effort.
  }
}

function decode(encoded: string): Attribution | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))))
    const value = JSON.parse(json) as Attribution
    return value?.first?.at ? value : null
  } catch {
    return null
  }
}

export function encodeAttribution(value: Attribution) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// Called on every page load: keeps the first touch, updates the latest one. A visit with no
// tracking info leaves what's saved alone (and records a direct visit only when nothing is saved).
export function captureAttribution() {
  if (typeof window === "undefined") return
  const handedOver = new URLSearchParams(window.location.search).get(ATTRIBUTION_PARAM)
  const carried = handedOver ? decode(handedOver) : null
  const saved = read() ?? carried
  const touch = touchFromLocation()
  if (touch) {
    write({ first: saved?.first ?? touch, last: touch })
  } else if (saved) {
    write(saved)
  } else {
    const direct: AttributionTouch = {
      source: null,
      medium: null,
      campaign: null,
      content: null,
      term: null,
      clickId: null,
      clickIdType: null,
      referrer: null,
      landingPage: window.location.pathname.slice(0, 300),
      at: new Date().toISOString(),
    }
    write({ first: direct, last: direct })
  }
}

// What to send with a lead or a sign-up.
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null
  return read()
}
