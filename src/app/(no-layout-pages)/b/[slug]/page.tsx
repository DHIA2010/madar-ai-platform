import type { Metadata } from "next"

import { PublicBookingPageView } from "@/features/booking"

export const metadata: Metadata = { title: { absolute: "احجز موعدك" } }
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PublicBookingPageView slug={decodeURIComponent(slug)} />
}
