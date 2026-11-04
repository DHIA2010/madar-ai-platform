"use client"

import { useEffect } from "react"

import {
  ATTRIBUTION_PARAM,
  captureAttribution,
  encodeAttribution,
  readAttribution,
} from "@/lib/attribution"

// Saves where this visitor came from (see lib/attribution), and hands it to the app when they
// follow a link from madar.my to app.madar.my (a different origin, so its own storage).
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution()
    const ownRoot = window.location.hostname.replace(/^(www|app)\./, "")
    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      let url: URL
      try {
        url = new URL(anchor.href)
      } catch {
        return
      }
      // Only links to another Madar host (madar.my → app.madar.my).
      if (url.hostname === window.location.hostname) return
      if (url.hostname.replace(/^(www|app)\./, "") !== ownRoot) return
      const saved = readAttribution()
      if (!saved || url.searchParams.has(ATTRIBUTION_PARAM)) return
      url.searchParams.set(ATTRIBUTION_PARAM, encodeAttribution(saved))
      anchor.href = url.toString()
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])
  return null
}
