"use client"

import dynamic from "next/dynamic"

const CampaignCreativeLibraryScreen = dynamic(
  () => import("@/features/campaigns").then((module) => module.CampaignCreativeLibraryScreen),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-xl border border-border/70 bg-muted/20" />
    ),
  }
)

export default function Page() {
  return <CampaignCreativeLibraryScreen />
}
