"use client"

import { useEffect } from "react"
import Cal, { getCalApi } from "@calcom/embed-react"

import { MADAR_DEMO_CAL_LINK } from "./marketing-constants"

const NAMESPACE = "madar-demo"

export interface BookedMeeting {
  startTime: string
  uid: string | null
}

// Madar's Cal.com booking calendar, inline, prefilled with what the lead just typed. Cal.com shows
// it in the visitor's browser language (Arabic for most of them).
export default function MeetingBooker({
  prefill,
  onBooked,
}: {
  prefill: Record<string, string>
  onBooked: (meeting: BookedMeeting) => void
}) {
  useEffect(() => {
    let active = true
    void getCalApi({ namespace: NAMESPACE }).then((cal) => {
      cal("ui", {
        theme: "light",
        layout: "month_view",
        cssVarsPerTheme: { light: { "cal-brand": "#2878ff" }, dark: { "cal-brand": "#2878ff" } },
      })
      cal("on", {
        action: "bookingSuccessfulV2",
        callback: (event) => {
          const { startTime, uid } = event.detail.data
          if (active && startTime) onBooked({ startTime, uid: uid ?? null })
        },
      })
    })
    return () => {
      active = false
    }
  }, [onBooked])

  return (
    <Cal
      namespace={NAMESPACE}
      calLink={MADAR_DEMO_CAL_LINK}
      config={{ ...prefill, layout: "month_view", theme: "light" }}
      className="min-h-[600px] w-full overflow-auto"
    />
  )
}
