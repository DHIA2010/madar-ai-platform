import type { Metadata } from "next"

import { PublicBookingPageView } from "@/features/booking"
import { bookingPagePreview } from "@/features/booking/services/link-preview"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

// The page's link shows the business's own name and logo wherever it is shared.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return bookingPagePreview(decodeURIComponent(slug), {
    title: "احجز موعدك",
    description: "احجز موعدك في دقيقة.",
  })
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  return <PublicBookingPageView slug={decodeURIComponent(slug)} />
}
