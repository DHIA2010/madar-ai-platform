import type { Metadata } from "next"

import { PublicLoyaltyCardView } from "@/features/loyalty"

export const metadata: Metadata = { title: { absolute: "بطاقة الولاء" }, robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicLoyaltyCardView token={decodeURIComponent(token)} />
}
