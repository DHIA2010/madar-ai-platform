import { Suspense } from "react"

import { LedgerPage } from "@/features/accounting"

// The account to open is in the query string (?account=), read on the client.
export default function Page() {
  return (
    <Suspense>
      <LedgerPage />
    </Suspense>
  )
}
