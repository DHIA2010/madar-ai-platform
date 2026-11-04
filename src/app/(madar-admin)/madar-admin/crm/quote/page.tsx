import { Suspense } from "react"

import { MadarAdminCrmQuote } from "@/features/madar-admin"

// ?id= (an existing quote) or ?leadId= (a new one), read on the client.
export default function Page() {
  return (
    <Suspense>
      <MadarAdminCrmQuote />
    </Suspense>
  )
}
