import type { Metadata } from "next"

import { PublicGiftView } from "@/features/booking"
import { giftLinkPreview } from "@/features/booking/services/link-preview"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

// The link sent to the person shows the business's own name and logo in the chat.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  return {
    ...(await giftLinkPreview(decodeURIComponent(token), {
      title: "بطاقة هدية",
      description: "وصلتك بطاقة هدية. افتحها لترى التفاصيل.",
    })),
    robots: { index: false, follow: false },
  }
}

export default async function Page({ params }: Props) {
  const { token } = await params
  return <PublicGiftView token={decodeURIComponent(token)} />
}
