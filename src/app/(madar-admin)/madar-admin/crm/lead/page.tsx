import { Suspense } from "react"

import { MadarAdminCrmLead } from "@/features/madar-admin"

// The lead's id is in the query string (?id=), read on the client.
export default function Page() {
  return (
    <Suspense>
      <MadarAdminCrmLead />
    </Suspense>
  )
}
