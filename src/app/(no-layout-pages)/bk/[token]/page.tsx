import type { Metadata } from "next"

import { PublicBookingManageView } from "@/features/booking"

export const metadata: Metadata = {
  title: { absolute: "حجزي" },
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicBookingManageView token={decodeURIComponent(token)} />
}
