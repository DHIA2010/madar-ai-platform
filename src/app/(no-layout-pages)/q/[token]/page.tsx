import type { Metadata } from "next"

import { PublicQuotationPage } from "@/features/invoicing"

export const metadata: Metadata = {
  title: { absolute: "عرض سعر | مدار" },
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

// The customer's link to one document: no sign-in, never indexed.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PublicQuotationPage token={decodeURIComponent(token)} />
}
