import type { Metadata } from "next"

import { PublicLoyaltyJoinView } from "@/features/loyalty"

export const metadata: Metadata = { title: { absolute: "انضم لبرنامج الولاء" } }
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PublicLoyaltyJoinView code={decodeURIComponent(code)} />
}
