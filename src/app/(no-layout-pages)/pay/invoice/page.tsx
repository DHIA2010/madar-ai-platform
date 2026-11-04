import type { Metadata } from "next"
import { Suspense } from "react"

import { InvoicePayPage } from "@/features/billing"

export const metadata: Metadata = {
  title: { absolute: "دفع فاتورة | مدار" },
  robots: { index: false, follow: false },
}

// ?token= (and Moyasar's ?id= on return) read on the client.
export default function Page() {
  return (
    <Suspense>
      <InvoicePayPage />
    </Suspense>
  )
}
