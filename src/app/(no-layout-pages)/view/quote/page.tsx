import type { Metadata } from "next"
import { Suspense } from "react"

import { PublicQuotePage } from "@/features/madar-admin/components/public-quote-page"

export const metadata: Metadata = {
  title: { absolute: "عرض سعر | مدار" },
  robots: { index: false, follow: false },
}

// ?token= read on the client.
export default function Page() {
  return (
    <Suspense>
      <PublicQuotePage />
    </Suspense>
  )
}
