import type { Metadata } from "next"

import { plainPreview } from "@/features/booking/services/link-preview"
import { PublicLoyaltyJoinView } from "@/features/loyalty"

// The link shows no Madar title or logo when shared in a chat.
export const metadata: Metadata = {
  ...plainPreview("انضم لبرنامج الولاء", "انضم واجمع النقاط مع كل زيارة."),
}
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <PublicLoyaltyJoinView code={decodeURIComponent(code)} />
}
