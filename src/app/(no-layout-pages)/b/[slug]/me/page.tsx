import type { Metadata } from "next"

import { PublicBookingAccountView } from "@/features/booking"
import { bookingPagePreview } from "@/features/booking/services/link-preview"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return {
    ...(await bookingPagePreview(decodeURIComponent(slug), {
      title: "حجوزاتي",
      description: "حجوزاتك وحالتها.",
    })),
    robots: { index: false },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  return <PublicBookingAccountView slug={decodeURIComponent(slug)} />
}
