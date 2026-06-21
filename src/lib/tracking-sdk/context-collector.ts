import type { TrackingContext } from "./contracts"

function detectBrowser(userAgent: string): string {
  if (/edg/i.test(userAgent)) {
    return "Edge"
  }
  if (/chrome|crios/i.test(userAgent)) {
    return "Chrome"
  }
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) {
    return "Safari"
  }
  if (/firefox|fxios/i.test(userAgent)) {
    return "Firefox"
  }
  return "Unknown"
}

function currentPath() {
  if (typeof window === "undefined") {
    return "/"
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function collectTrackingContext(landingPage?: string): TrackingContext {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
  const browser = detectBrowser(userAgent)
  const platform = typeof navigator === "undefined" ? "unknown" : navigator.platform
  const language = typeof navigator === "undefined" ? "unknown" : navigator.language
  const screenSize =
    typeof window === "undefined" ? "0x0" : `${window.screen.width}x${window.screen.height}`

  const params =
    typeof window === "undefined"
      ? new URLSearchParams("")
      : new URLSearchParams(window.location.search)

  return {
    timestamp: new Date().toISOString(),
    language,
    screenSize,
    referrer: typeof document === "undefined" || !document.referrer ? null : document.referrer,
    landingPage: landingPage ?? currentPath(),
    utm: {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
      term: params.get("utm_term"),
      content: params.get("utm_content"),
    },
    device: {
      userAgent,
      browser,
      platform,
    },
  }
}

export function getCurrentPagePath(): string {
  return currentPath()
}
