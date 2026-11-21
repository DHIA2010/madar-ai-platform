import type { Metadata } from "next"

import { ROUTES } from "@/constants/routes"
import { plainPreview } from "@/features/booking/services/link-preview"
import { PublicLoyaltyCardView } from "@/features/loyalty"
import { cardLook } from "@/features/loyalty/services/card-look"

export const dynamic = "force-dynamic"

// The link shows no Madar title or logo when shared in a chat. Saved to a phone's home screen,
// the card opens on its own like an app under the business's name, which is also what lets the
// phone offer notifications for it.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const token = decodeURIComponent((await params).token)
  const look = await cardLook(token)
  return {
    ...plainPreview("بطاقة الولاء", "بطاقتك ونقاطك."),
    robots: { index: false },
    manifest: ROUTES.publicLoyaltyCardManifest(encodeURIComponent(token)),
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: look?.businessName || "بطاقة الولاء",
    },
  }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicLoyaltyCardView token={decodeURIComponent(token)} />
}
