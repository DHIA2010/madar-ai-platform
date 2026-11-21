import type { Metadata } from "next"

import { PublicBookingManageView } from "@/features/booking"
import { bookingLinkPreview } from "@/features/booking/services/link-preview"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ token: string }> }

// The link sent to the customer shows the business's own name and logo in the chat.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  return {
    ...(await bookingLinkPreview(decodeURIComponent(token), {
      title: "حجزي",
      description: "تفاصيل حجزك: الموعد والحالة.",
    })),
    robots: { index: false, follow: false },
  }
}

export default async function Page({ params }: Props) {
  const { token } = await params
  return <PublicBookingManageView token={decodeURIComponent(token)} />
}
