import { Suspense } from "react"

import { ApplicationsMarketplace } from "@/features/applications"

// ?section= read on the client.
export default function Page() {
  return (
    <Suspense>
      <ApplicationsMarketplace />
    </Suspense>
  )
}
