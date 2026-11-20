"use client"

import dynamic from "next/dynamic"

// The wizard reads the chosen creative from the address, so it is drawn in the browser.
const CampaignCreateScreen = dynamic(
  () => import("@/features/campaigns").then((module) => module.CampaignCreateScreen),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-xl border border-border/70 bg-muted/20" />
    ),
  }
)

export default function Page() {
  return <CampaignCreateScreen />
}
