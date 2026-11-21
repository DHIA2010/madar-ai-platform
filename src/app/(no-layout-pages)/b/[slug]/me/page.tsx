import type { Metadata } from "next"

import { PublicBookingAccountView } from "@/features/booking"

export const metadata: Metadata = { title: { absolute: "حجوزاتي" }, robots: { index: false } }
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <PublicBookingAccountView slug={decodeURIComponent(slug)} />
}
