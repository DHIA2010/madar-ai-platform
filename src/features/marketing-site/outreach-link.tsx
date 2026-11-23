"use client"

import { useEffect } from "react"
import { Loader2 } from "lucide-react"

import { getClientEnvironment } from "@/infrastructure/environment/app-environment"

const SEPARATOR = String.fromCharCode(47)

// The page behind the link in a WhatsApp message sent from Madar's CRM. It is open for a
// moment only: it reports the tap (a chat app fetching the link for its card never runs this,
// so only a person's browser is counted) and goes on to where the link leads.
export function OutreachLink({ code, target }: { code: string; target: string }) {
  useEffect(() => {
    const go = () => window.location.replace(target)
    // The count must not hold the visitor back: after a moment they go on regardless.
    const fallback = window.setTimeout(go, 1500)
    const address = new URL(
      ["", "v1", "public", "outreach", encodeURIComponent(code), "click"].join(SEPARATOR),
      getClientEnvironment().API_BASE_URL
    )
    fetch(address, { method: "POST", keepalive: true })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(fallback)
        go()
      })
    return () => window.clearTimeout(fallback)
  }, [code, target])

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f5f8fd]">
      <Loader2 className="size-7 animate-spin text-slate-400" />
    </div>
  )
}
