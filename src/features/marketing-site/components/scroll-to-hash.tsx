"use client"

import { useEffect } from "react"

// Arriving at madar.my/#pricing from another page (the blog, the legal pages): the browser's own
// jump to the anchor happens before the page has finished laying out, so it misses. Scroll there
// once the homepage is ready instead.
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [])
  return null
}
