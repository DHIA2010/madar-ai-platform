import type { Metadata } from "next"

import { plainPreview } from "@/features/booking/services/link-preview"
import { PublicLoyaltyCardView } from "@/features/loyalty"

// The link shows no Madar title or logo when shared in a chat.
export const metadata: Metadata = {
  ...plainPreview("بطاقة الولاء", "بطاقتك ونقاطك."),
  robots: { index: false },
}
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicLoyaltyCardView token={decodeURIComponent(token)} />
}
